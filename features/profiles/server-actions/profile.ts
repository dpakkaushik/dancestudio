"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { setMyPlace, updateMyProfile } from "@/repositories/profiles";

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
  styles: z.array(z.string().trim().min(1).max(40)).max(12),
  /* the same shape the business phone takes (settings slice) — an empty box is
     null, which is how a person TAKES THEIR NUMBER DOWN without asking anyone */
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ]{7,17}$/, "a phone number is 8 to 18 digits")
    .nullable(),
  /* THE CONTACT EMAIL (19 Sep 2026) — the Mail button's address. Omitted, the
     column is left alone (the styles and links sheets never carry it); null
     clears it; the database keeps the same shape as a CHECK */
  contactEmail: z.string().trim().email("that is not an email address").max(254).nullable().optional(),
  /* CALL IS A TOGGLE (push 2, 19 Sep 2026): omitted, the switch is left alone */
  phonePublic: z.boolean().optional(),
});

export type MyProfileInput = z.infer<typeof schema>;

/** AN ORGANIZATION'S PIN (push 2): the Edit sheet's map writes it the moment the
 *  organization places it — a pin somebody has visibly put should not need a
 *  second press — and the locked picker is what makes that safe (16 Sep 2026). */
export async function setMyPlaceAction(input: { lat: number | null; lng: number | null }): Promise<{ error: string | null }> {
  const parsed = z.object({ lat: z.number().finite().nullable(), lng: z.number().finite().nullable() }).safeParse(input);
  if (!parsed.success) {
    return { error: "That is not a place on the map" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  try {
    await setMyPlace(supabase, parsed.data);
    revalidatePath("/");
    revalidatePath("/profile");
    revalidatePath(`/org/${user.id}`);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save the pin" };
  }
}

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
    await updateMyProfile(supabase, {
      ...parsed.data,
      city: parsed.data.city || null,
      phone: parsed.data.phone || null,
    });
    revalidatePath("/profile");
    revalidatePath("/");
    revalidatePath(`/person/${user.id}`);
    /* an organization's page reads the same row (19 Sep 2026) */
    revalidatePath(`/org/${user.id}`);
    return { error: null };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not save your profile" };
  }
}
