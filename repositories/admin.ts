import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialLink } from "@/types/profile";

/** PLATFORM ADMINS AND ORGANIZATION VERIFICATION (8 Sep 2026).
 *
 *  An organization asks to be verified; an admin reads its social links and
 *  answers; until the answer is yes, nothing the organization runs is public.
 *  Every write here is an RPC that re-checks who is asking — `is_platform_admin`
 *  for the answer, the caller's own role and links for the ask — so nothing in
 *  this file decides anything. The reads lean on two policies: an organization
 *  reads its own requests, an admin reads them all. */

export type VerificationStatus = "pending" | "approved" | "rejected";

export interface VerificationRequest {
  id: string;
  orgId: string;
  orgName: string;
  orgCity: string | null;
  orgAvatarPath: string | null;
  socials: SocialLink[];
  /** set once an admin has said yes — a request can be pending on an already-verified org only if it was revoked and asked again */
  orgVerifiedAt: string | null;
  status: VerificationStatus;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** One organization as the admin's list draws it — with or without a request. */
export interface OrganizationRow {
  id: string;
  name: string;
  city: string | null;
  avatarPath: string | null;
  socials: SocialLink[];
  verifiedAt: string | null;
  createdAt: string;
}

const toSocials = (raw: unknown): SocialLink[] =>
  Array.isArray(raw)
    ? raw
        .filter((x): x is { platform: unknown; url: unknown } => Boolean(x) && typeof x === "object")
        .map((x) => ({ platform: String(x.platform ?? ""), url: String(x.url ?? "") }))
        .filter((x) => x.platform && x.url)
    : [];

/** the one question every admin surface asks first; false for a stranger, false on error */
export async function amIPlatformAdmin(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
}

interface RequestRow {
  id: string;
  org_id: string;
  status: VerificationStatus;
  note: string | null;
  created_at: string;
  decided_at: string | null;
  profiles: { full_name: string; city: string | null; avatar_path: string | null; socials: unknown; verified_at: string | null } | null;
}

const toRequest = (r: RequestRow): VerificationRequest => ({
  id: r.id,
  orgId: r.org_id,
  orgName: r.profiles?.full_name ?? "An organization",
  orgCity: r.profiles?.city ?? null,
  orgAvatarPath: r.profiles?.avatar_path ?? null,
  socials: toSocials(r.profiles?.socials),
  orgVerifiedAt: r.profiles?.verified_at ?? null,
  status: r.status,
  note: r.note,
  createdAt: r.created_at,
  decidedAt: r.decided_at,
});

const REQUEST_SELECT = "id, org_id, status, note, created_at, decided_at, profiles (full_name, city, avatar_path, socials, verified_at)";

/** THE QUEUE — what is waiting on an admin, oldest first. Under RLS a
 *  non-admin gets their own rows at most; the page refuses them before asking. */
export async function findVerificationQueue(supabase: SupabaseClient): Promise<VerificationRequest[]> {
  const { data, error } = await supabase
    .from("org_verification_requests")
    .select(REQUEST_SELECT)
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    throw new Error(`verification.queue failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as RequestRow[]).map(toRequest);
}

/** Every organization, verified or not — so an admin can also REVOKE a tick
 *  (the grandfathered ones never had a request). Profiles are signed-in
 *  readable, so this is a plain read; the page is what limits it to admins. */
export async function findOrganizations(supabase: SupabaseClient): Promise<OrganizationRow[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, city, avatar_path, socials, verified_at, created_at")
    .eq("role", "org")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    throw new Error(`verification.orgs failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{ id: string; full_name: string; city: string | null; avatar_path: string | null; socials: unknown; verified_at: string | null; created_at: string }>).map((r) => ({
    id: r.id,
    name: r.full_name,
    city: r.city,
    avatarPath: r.avatar_path,
    socials: toSocials(r.socials),
    verifiedAt: r.verified_at,
    createdAt: r.created_at,
  }));
}

/** THE ORGANIZATION'S OWN VIEW: its latest request, or null if it never asked.
 *  Says `org_id = me` out loud — an admin's client would otherwise read every
 *  organization's requests here. */
export async function findMyVerificationRequest(supabase: SupabaseClient): Promise<VerificationRequest | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("org_verification_requests")
    .select(REQUEST_SELECT)
    .eq("org_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`verification.mine failed: ${error.message}`);
  }
  return data ? toRequest(data as unknown as RequestRow) : null;
}

/** the ask — the RPC refuses a person, an already-verified organization, and one with no links */
export async function requestOrgVerification(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("request_org_verification");
  if (error) {
    throw new Error(error.message);
  }
  return String(data);
}

/** the answer — admins only, and it moves the tick and every studio's visibility with it */
export async function decideOrgVerification(
  supabase: SupabaseClient,
  input: { orgId: string; approve: boolean; note?: string | null }
): Promise<void> {
  const { error } = await supabase.rpc("decide_org_verification", {
    p_org_id: input.orgId,
    p_approve: input.approve,
    p_note: input.note ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}
