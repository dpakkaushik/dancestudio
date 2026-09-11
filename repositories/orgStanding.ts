import type { SupabaseClient } from "@supabase/supabase-js";

/** WHAT AN ORGANIZATION STILL ASKS THE DATABASE (9 Sep 2026; trimmed 11 Sep).
 *
 *  Four things, and none of them is a verification any more: the one sentence
 *  between it and a new studio, its events host, the removal of a proof photo
 *  (shared with the studio strip, which is the only thing that ADDS one), and
 *  the figures the admin accounts desk draws per organization.
 *
 *  ⚠ THE ORGANIZATION PHOTO READS LEFT ON 11 Sep 2026. An organization shows
 *  DanceOS nothing — the user: "org no more needs admin verification at all" —
 *  so the photos, and the signing helper they shared, moved to
 *  `repositories/studioVerification.ts`, where a STUDIO's evidence is read.
 *  Subscriptions left on 10 Sep 2026, and are per studio. */

/** The one sentence left between this organization and CREATING a studio, or
 *  null. Asked of the database so the screen cannot disagree with the gate. */
export async function findWhyNoStudio(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("why_no_studio");
  if (error) {
    throw new Error(`org.gate failed: ${error.message}`);
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/** The organization's own events host (R15, 9 Sep 2026) — the tenant its
 *  events belong to and whose name a public event prints. Made on first ask,
 *  so this is safe to call before one exists. */
export async function findMyOrgTenantId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("my_org_tenant");
  if (error) {
    throw new Error(`org.eventsHost failed: ${error.message}`);
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

export async function removeProofPhoto(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.rpc("remove_org_proof_photo", { p_id: id });
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
