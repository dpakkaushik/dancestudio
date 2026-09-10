import type { SupabaseClient } from "@supabase/supabase-js";
import { PROOF_BUCKET, PROOF_URL_SECONDS, type ProofPhoto } from "@/lib/media/proof";

/** WHERE AN ORGANIZATION STANDS WITH DANCEOS (R13/R14/R16, 9 Sep 2026).
 *
 *  The reads behind the one strip on HOME that says it: the photos it has shown,
 *  and — from the database rather than from arithmetic repeated here — the
 *  single sentence still standing between it and creating a studio.
 *
 *  Subscriptions moved out of here on 10 Sep 2026: they are per STUDIO now
 *  (`repositories/studioPlans.ts`), not per organization. */

/** The photos, newest ordering last, each with a signed URL. The signing is one
 *  batched call; a path the bucket no longer holds comes back without a URL
 *  rather than breaking the strip. */
export async function findMyProofPhotos(supabase: SupabaseClient): Promise<ProofPhoto[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("org_proof_photos")
    .select("id, path, sort, created_at")
    .eq("org_id", user.id)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) {
    throw new Error(`proof.mine failed: ${error.message}`);
  }
  return signProof(supabase, (data ?? []) as Array<{ id: string; path: string }>);
}

/** One organization's photos, for an admin reading a verification request. The
 *  storage policy is what admits the admin — this passes no service key. */
export async function findProofPhotosFor(supabase: SupabaseClient, orgId: string): Promise<ProofPhoto[]> {
  const { data, error } = await supabase
    .from("org_proof_photos")
    .select("id, path, sort, created_at")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) {
    throw new Error(`proof.for failed: ${error.message}`);
  }
  return signProof(supabase, (data ?? []) as Array<{ id: string; path: string }>);
}

async function signProof(
  supabase: SupabaseClient,
  rows: Array<{ id: string; path: string }>
): Promise<ProofPhoto[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.path),
      PROOF_URL_SECONDS
    );
  /* a signing failure is not a page failure: the rows still say how many photos
     exist, which is what the count and the gate are about */
  const urlByPath = new Map<string, string>();
  if (!error) {
    (data ?? []).forEach((s) => {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    });
  }
  return rows.map((r) => ({ id: r.id, path: r.path, url: urlByPath.get(r.path) ?? null }));
}

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

export async function addProofPhoto(supabase: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await supabase.rpc("add_org_proof_photo", { p_path: path });
  if (error) {
    throw new Error(error.message);
  }
  return String(data);
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
