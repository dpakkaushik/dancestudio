import type { SupabaseClient } from "@supabase/supabase-js";

/** THE TWO GATES A PERSON MEETS BEFORE OPENING A BUSINESS (9 Sep 2026; trimmed
 *  11 Sep; re-cut 26 Sep), plus the removal of a proof photo and the figures
 *  the admin accounts desk draws per organization.
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

export interface OrgStandingRow {
  orgId: string;
  proofPhotos: number;
  studios: number;
  subscribedStudios: number;
}

/** Evidence and studio figures for a page of organizations, for the admin
 *  accounts desk. One call for the whole page, not one per row. */
export async function findAdminOrgStanding(
  supabase: SupabaseClient,
  orgIds: string[]
): Promise<Map<string, OrgStandingRow>> {
  const out = new Map<string, OrgStandingRow>();
  if (orgIds.length === 0) return out;
  const { data, error } = await supabase.rpc("admin_org_standing", { p_org_ids: orgIds });
  if (error) {
    throw new Error(`admin.orgStanding failed: ${error.message}`);
  }
  ((data ?? []) as Array<{ org_id: string; proof_photos: number; studios: number; subscribed_studios: number }>).forEach((r) => {
    out.set(r.org_id, {
      orgId: r.org_id,
      proofPhotos: Number(r.proof_photos),
      studios: Number(r.studios),
      subscribedStudios: Number(r.subscribed_studios),
    });
  });
  return out;
}
