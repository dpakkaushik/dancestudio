"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPhones, setMyLearnStyles, updateMyProfile } from "@/repositories/profiles";

/** The Profile tab's one write (S_profiletab: Edit profile 11364, the links
 *  sheet 11161, the styles sheet 11217 — three sheets, one record). Zod checks
 *  the shape; the RPC re-checks it and scopes the write to the caller. */

const schema = z.object({
  fullName: z.string().trim().min(1).max(120),
  city: z.string().trim().min(1, "Add your city").max(120),
  age: z.number().int().min(13).max(99).nullable(),
  /* THE DATE OF BIRTH (19 Sep 2026): an ISO date; undefined leaves it as it is.
     The RPC checks it is 13 to 99 years ago and works the age out from it. */
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "a date of birth is a date")
    .nullable()
    .optional(),
  socials: z
    .array(
      z.object({
        platform: z.string().trim().min(1).max(40),
        url: z.string().trim().url().max(300),
      })
    )
    .max(12),
  /* no limit on dance styles (10 Oct 2026) — 100 is the database's safety ceiling */
  styles: z.array(z.string().trim().min(1).max(40)).max(100),
  /* the same shape the business phone takes (settings slice) — an empty box is
     null, which is how a person TAKES THEIR NUMBER DOWN without asking anyone */
  /* ⚠ OMITTED = LEAVE IT AS IT IS (6 Oct 2026, decision 4): the number is its own
     read now, and only the contact sheet edits it — so the styles and links rows
     and Edit details send none, and the server keeps the stored one rather than
     trusting a copy the page may never have held. */
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ]{7,17}$/, "a phone number is 8 to 18 digits")
    .nullable()
    .optional(),
  /* THE CONTACT EMAIL (19 Sep 2026) — the Mail button's address. Omitted, the
     column is left alone (the styles and links sheets never carry it); null
     clears it; the database keeps the same shape as a CHECK */
  contactEmail: z.string().trim().email("that is not an email address").max(254).nullable().optional(),
  /* CALL IS A TOGGLE (push 2, 19 Sep 2026): omitted, the switch is left alone */
  phonePublic: z.boolean().optional(),
});

export type MyProfileInput = z.infer<typeof schema>;

/* ⚠ `setMyPlaceAction` IS GONE (26 Sep 2026): it wrote `set_my_place` on the
   organization LOGIN's row, and both the login and the RPC are retired. An
   organization's pin is its business row's, through `set_business_location`. */

export async function updateMyProfileAction(input: MyProfileInput): Promise<{ error: string | null }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: first ? `${first.path.join(".") || "profile"}: ${first.message}` : "Invalid request" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    /* the RPC takes the whole profile, so an omitted number is filled from the
       one on record — never sent as null, which would take it down */
    const phone =
      parsed.data.phone === undefined
        ? ((await findPhones(supabase, [user.id], { strict: true })).get(user.id) ?? null)
        : parsed.data.phone || null;
    await updateMyProfile(supabase, {
      ...parsed.data,
      city: parsed.data.city || null,
      phone,
    });
    revalidatePath("/");
    revalidatePath(`/person/${user.id}`);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save your profile" };
  }
}

const learnSchema = z.object({ styles: z.array(z.string().trim().min(1).max(40)).max(100) });

/** THE STYLES SOMEBODY WANTS TO LEARN (11 Oct 2026) — onboarding's first styles
 *  step and Discover's Recommendation settings. Its own door, because the
 *  column is private and `update_my_profile` takes the public profile. */
export async function setMyLearnStylesAction(input: { styles: string[] }): Promise<{ error: string | null; styles?: string[] }> {
  const parsed = learnSchema.safeParse(input);
  if (!parsed.success) return { error: "Those styles could not be saved — check the names and try again" };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  try {
    const styles = await setMyLearnStyles(supabase, parsed.data.styles);
    revalidatePath("/discover");
    return { error: null, styles };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save your styles" };
  }
}
