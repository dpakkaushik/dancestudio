import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminBusiness } from "@/repositories/adminPanel";

/** THE TWO GATES A PERSON MEETS BEFORE OPENING A BUSINESS (9 Sep 2026; trimmed
 *  11 Sep; re-cut 26 Sep), plus the removal of a proof photo and the figures
 *  the admin accounts desk draws per owner.
 *
 *  ⚠ `findMyOrgTenantId` LEFT ON 26 Sep 2026 with the organization LOGIN it
 *  served: `my_org_business()` made a hosting row for a login on first ask, and
 *  there is no such login any more — an organization is a `businesses` row a
 *  person opens from `/organizations`, found through `findMyMemberships` like a
 *  studio. Anything that still wants "the organization's id" reads the owned
 *  memberships of type `org`. */

/** The one sentence left between this account and CREATING a studio, or null.
 *  Asked of the database so the screen cannot disagree with the gate. */
export async function findWhyNoStudio(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("why_no_studio");
  if (error) {
    throw new Error(`org.gate failed: ${error.message}`);
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/** The one sentence between this account and OPENING AN ORGANIZATION, or null
 *  (26 Sep 2026) — `why_no_organization()`, the same shape as the studio's gate:
 *  the hub prints it where the Add button would be, and
 *  `create_business_with_owner` raises it. */
export async function findWhyNoOrganization(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("why_no_organization");
  if (error) {
    throw new Error(`org.openGate failed: ${error.message}`);
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

export async function removeProofPhoto(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc("remove_studio_photo", { p_id: id });
  if (error) {
    throw new Error(error.message);
  }
}

/** What an ACCOUNT runs, for the admin accounts desk (26 Sep 2026). */
export interface OwnerStanding {
  ownerId: string;
  studios: number;
  /** studios whose own mandate (or comp) is live — `studio_plan_active`'s
   *  reading, taken off the same subscription row the Businesses desk prints */
  subscribedStudios: number;
  organizations: number;
}

/** ⚠ COUNTED OFF THE BUSINESSES LIST, NOT OFF `admin_org_standing` (26 Sep
 *  2026). That RPC answers only for `profiles.role = 'org'`, and no such
 *  profile exists since the organization login was retired — so it answers
 *  nobody, for ever, and the desk read "1 BUSINESS" with no word on whether the
 *  studio behind it was subscribed. `admin_businesses` already carries the
 *  owner and the subscription row per business, so the figure the chip wants is
 *  arithmetic over a list the panel reads anyway; the RPC is dead and is the
 *  next admin migration's to drop, not tonight's. A subscription counts while
 *  its status still grants access (active, past due, or cancelled with a paid
 *  period left) — the three statuses `subscription_has_access` admits. */
export function ownerStandingOf(businesses: ReadonlyArray<AdminBusiness>): Map<string, OwnerStanding> {
  const out = new Map<string, OwnerStanding>();
  for (const b of businesses) {
    if (!b.ownerId) continue;
    const row = out.get(b.ownerId) ?? { ownerId: b.ownerId, studios: 0, subscribedStudios: 0, organizations: 0 };
    if (b.type === "studio") {
      row.studios += 1;
      if (b.subStatus && ["active", "past_due", "canceled"].includes(b.subStatus)) row.subscribedStudios += 1;
    } else if (b.type === "org") {
      row.organizations += 1;
    }
    out.set(b.ownerId, row);
  }
  return out;
}
