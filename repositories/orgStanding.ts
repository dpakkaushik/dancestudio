import type { SupabaseClient } from "@supabase/supabase-js";
import { PROOF_BUCKET, PROOF_URL_SECONDS, type ProofPhoto } from "@/lib/media/proof";

/** WHERE AN ORGANIZATION STANDS WITH DANCEOS (R13/R14/R16, 9 Sep 2026).
 *
 *  One read for the one strip that says it: the tick, the request and its
 *  reason, the links, the photos it has shown, whether the subscription is
 *  live, and — from the database rather than from arithmetic repeated here —
 *  the single sentence still standing between it and its first studio.
 *
 *  This lives on HOME, not inside the studios hub (the user's ask, 9 Sep 2026):
 *  where an organization stands, and its way of reaching a person about it, are
 *  the first things it should see, not something to go looking for. */

export interface OrgSubscription {
  active: boolean;
  until: string | null;
  plan: "granted" | "monthly" | "yearly" | null;
}

export interface OrgStanding {
  verifiedAt: string | null;
  socialsCount: number;
  photos: ProofPhoto[];
  subscription: OrgSubscription;
  /** null when a studio may be created; otherwise the reason, from the database */
  whyNoStudio: string | null;
}

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

export async function findMyOrgSubscription(supabase: SupabaseClient): Promise<OrgSubscription> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { active: false, until: null, plan: null };
  const { data, error } = await supabase
    .from("org_plans")
    .select("plan, until, ended_at")
    .eq("org_id", user.id)
    .is("deleted_at", null)
    .is("ended_at", null)
    .order("until", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`org.subscription failed: ${error.message}`);
  }
  if (!data) return { active: false, until: null, plan: null };
  const row = data as { plan: string; until: string };
  /* the same clock the database uses: IST, date only */
  const todayIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return {
    active: row.until >= todayIst,
    until: row.until,
    plan: row.plan as OrgSubscription["plan"],
  };
}

/** The one sentence left between this organization and its first studio, or
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

export async function grantOrgSubscription(
  supabase: SupabaseClient,
  orgId: string,
  months: number,
  note: string | null
): Promise<void> {
  const { error } = await supabase.rpc("admin_grant_org_subscription", {
    p_org_id: orgId,
    p_months: months,
    p_note: note,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function endOrgSubscription(supabase: SupabaseClient, orgId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("admin_end_org_subscription", { p_org_id: orgId, p_reason: reason });
  if (error) {
    throw new Error(error.message);
  }
}

export interface OrgStandingRow {
  orgId: string;
  subscribed: boolean;
  until: string | null;
  plan: string | null;
  proofPhotos: number;
}

/** Subscription and evidence figures for a page of organizations, for the
 *  admin accounts desk. One call for the whole page, not one per row. */
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
  ((data ?? []) as Array<{ org_id: string; subscribed: boolean; until: string | null; plan: string | null; proof_photos: number }>).forEach(
    (r) => {
      out.set(r.org_id, {
        orgId: r.org_id,
        subscribed: r.subscribed,
        until: r.until,
        plan: r.plan,
        proofPhotos: r.proof_photos,
      });
    }
  );
  return out;
}
