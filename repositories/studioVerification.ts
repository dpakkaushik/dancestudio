import type { SupabaseClient } from "@supabase/supabase-js";
import { PROOF_BUCKET, PROOF_URL_SECONDS, type ProofPhoto } from "@/lib/media/proof";

/** WHAT DANCEOS CHECKS, NOW THAT IT CHECKS A STUDIO (11 Sep 2026 — the user:
 *  "the earlier logic of org verification will work for the studio: the user
 *  will upload 5-10 images and social media for the studio, then admin will
 *  verify the studio, then the studio will get badge, then it will subscribe
 *  to go live").
 *
 *  The reads and writes behind that, per studio. The photos live in the same
 *  private bucket, under the same `proof/{org_id}/…` folder they always did —
 *  only the row now says WHICH studio it shows — so every storage policy that
 *  was written and proven for organization photos covers these untouched.
 *
 *  Every read degrades to empty rather than throwing: the `tenant_id` column
 *  arrives with migration 20260914090000, and a hub that 500s because the
 *  column is a day away would be worse than one that says "no photos yet". */

export interface StudioVerificationState {
  /** the badge — set when an admin has approved this studio */
  verifiedAt: string | null;
  /** how many photos it has shown, and them */
  photos: ProofPhoto[];
  /** an open request, if one is waiting on an admin */
  pending: boolean;
  /** the newest request's id — what a support thread about this review hangs on */
  requestId: string | null;
  /** the admin's words on the last refusal, if the last answer was no */
  rejectedNote: string | null;
}

interface PhotoRow {
  id: string;
  path: string;
}

async function signProof(supabase: SupabaseClient, rows: PhotoRow[]): Promise<ProofPhoto[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(PROOF_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.path),
      PROOF_URL_SECONDS
    );
  const urlByPath = new Map<string, string>();
  if (!error) {
    (data ?? []).forEach((s) => {
      if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    });
  }
  return rows.map((r) => ({ id: r.id, path: r.path, url: urlByPath.get(r.path) ?? null }));
}

/** One studio's photos, for its owner or for an admin reading its request.
 *  The policies are what admit either; no service key passes through here. */
export async function findStudioProofPhotos(supabase: SupabaseClient, tenantId: string): Promise<ProofPhoto[]> {
  const { data, error } = await supabase
    .from("org_proof_photos")
    .select("id, path, sort, created_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) {
    return [];
  }
  return signProof(supabase, (data ?? []) as PhotoRow[]);
}

/** Where each of these studios stands, in ONE pair of queries rather than one
 *  pair per studio — the hub draws every studio an organization runs, and a
 *  round trip per row is how a hub with eight studios becomes slow. */
export async function findStudioVerificationStates(
  supabase: SupabaseClient,
  tenants: Array<{ id: string; verifiedAt: string | null }>
): Promise<Record<string, StudioVerificationState>> {
  const out: Record<string, StudioVerificationState> = {};
  tenants.forEach((t) => {
    out[t.id] = { verifiedAt: t.verifiedAt, photos: [], pending: false, requestId: null, rejectedNote: null };
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length === 0) return out;

  const [photos, requests] = await Promise.all([
    supabase
      .from("org_proof_photos")
      .select("id, path, sort, created_at, tenant_id")
      .in("tenant_id", ids)
      .is("deleted_at", null)
      .order("sort", { ascending: true })
      .limit(200),
    supabase
      .from("org_verification_requests")
      .select("id, tenant_id, status, note, decided_at, created_at")
      .in("tenant_id", ids)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (!photos.error) {
    const rows = (photos.data ?? []) as Array<PhotoRow & { tenant_id: string }>;
    const signed = await signProof(supabase, rows);
    rows.forEach((r, i) => {
      const state = out[r.tenant_id];
      if (state) state.photos.push(signed[i]!);
    });
  }

  if (!requests.error) {
    const rows = (requests.data ?? []) as Array<{ id: string; tenant_id: string; status: string; note: string | null }>;
    /* newest first, so the FIRST row for a studio is its latest answer */
    const seen = new Set<string>();
    rows.forEach((r) => {
      const state = out[r.tenant_id];
      if (!state) return;
      if (!state.requestId) state.requestId = r.id;
      if (r.status === "pending") {
        state.pending = true;
        return;
      }
      if (!seen.has(r.tenant_id) && r.status === "rejected") {
        state.rejectedNote = r.note;
      }
      seen.add(r.tenant_id);
    });
  }

  return out;
}

export async function addStudioProofPhoto(supabase: SupabaseClient, tenantId: string, path: string): Promise<string> {
  const { data, error } = await supabase.rpc("add_studio_proof_photo", { p_tenant_id: tenantId, p_path: path });
  if (error) {
    throw new Error(error.message);
  }
  return String(data);
}

export async function requestStudioVerification(supabase: SupabaseClient, tenantId: string): Promise<string> {
  const { data, error } = await supabase.rpc("request_studio_verification", { p_tenant_id: tenantId });
  if (error) {
    throw new Error(error.message);
  }
  return String(data);
}

/** An admin's answer. Approval is the BADGE only — the studio still subscribes
 *  to reach Discover, which is the order the user asked for. */
export async function decideStudioVerification(
  supabase: SupabaseClient,
  input: { tenantId: string; approve: boolean; note: string | null }
): Promise<void> {
  const { error } = await supabase.rpc("decide_studio_verification", {
    p_tenant_id: input.tenantId,
    p_approve: input.approve,
    p_note: input.note,
  });
  if (error) {
    throw new Error(error.message);
  }
}
