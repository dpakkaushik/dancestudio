"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { createTenantWithOwner, updateTenantProfile } from "@/repositories/tenants";

export interface OrganizationActionState {
  error: string | null;
  created?: boolean;
  /** what the toast says once the sheet has closed */
  note?: string;
}

/** OPEN AN ORGANIZATION (26 Sep 2026, the user: "make organization a tab on home
 *  for artist and users and mechanism to create and open an organization
 *  similar to studios"). The same door a studio uses — `create_business_with_owner`
 *  with `p_type = 'org'` — and `why_no_organization()` inside it is the one gate.
 *
 *  ⚠ A MOBILE NUMBER AND AN EMAIL ARE REQUIRED, and they are the ORGANIZATION'S
 *  (the user: "all profiles created from user or artist require a mobile number,
 *  email etc … editable to the user who creates that profile and not take
 *  directly what the user used for their login"). They ride the same shape the
 *  business phone and contact email have carried since 29 Aug and 19 Sep, and
 *  land through `update_business_profile` the moment the row exists — two doors
 *  rather than a changed creation signature, exactly as the studio's pin does. */
const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Give the organization a name").max(140),
  area: z.string().trim().max(140).optional(),
  city: z.string().trim().min(1, "An organization needs a city").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9 ]{7,17}$/, "A mobile number is 8 to 18 digits"),
  email: z.string().trim().email("That is not an email address").max(254),
});

export async function createOrganizationAction(_prev: OrganizationActionState, formData: FormData): Promise<OrganizationActionState> {
  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    area: (formData.get("area") as string) || undefined,
    city: (formData.get("city") as string) || "",
    phone: formData.get("phone"),
    email: formData.get("contact_email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  /* an account with no profile is sent to onboarding first — the RPC would refuse it anyway */
  if (!(await findProfileById(supabase, user.id))) {
    redirect("/onboarding");
  }

  let orgId: string;
  try {
    const org = await createTenantWithOwner(supabase, {
      name: parsed.data.name,
      type: "org",
      area: parsed.data.area ?? null,
      city: parsed.data.city,
    });
    orgId = org.id;
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : "Could not open the organization" };
  }

  /* THE NUMBER AND THE ADDRESS, LAST. An organization that exists with neither
     is still an organization — so a refusal here is said in the toast rather
     than undoing the row, and both fields are on its Edit sheet. */
  let note: string | undefined;
  try {
    await updateTenantProfile(supabase, orgId, {
      foundedYear: null,
      phone: parsed.data.phone,
      socials: [],
      enquiryTypes: null,
      accepts: { upi: true, cards: true, cash: true, bank: false },
      contactEmail: parsed.data.email,
    });
  } catch {
    note = "Organization opened. Its number and email could not be saved just now — add them from Edit organization in its Settings.";
  }

  revalidatePath("/organizations");
  revalidatePath("/");
  return { error: null, created: true, note: note ?? "Organization opened — verify its GST number from its Settings, then subscribe it to go public." };
}
