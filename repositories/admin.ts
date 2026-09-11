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
  /** THE STUDIO UNDER REVIEW (11 Sep 2026). Set on every request filed since
   *  verification moved to the studio; null on the legacy organization
   *  requests, which are kept as history. When set, the card is about the
   *  studio — its name, its links, its photos — and the decision stamps ITS
   *  badge; the organization is only who gets told. */
  tenantId: string | null;
  tenantName: string | null;
  tenantCity: string | null;
  tenantSocials: SocialLink[];
  tenantVerifiedAt: string | null;
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
  tenants?: { id: string; name: string; city: string | null; socials: unknown; verified_at: string | null } | null;
}

const toRequest = (r: RequestRow): VerificationRequest => ({
  tenantId: r.tenants?.id ?? null,
  tenantName: r.tenants?.name ?? null,
  tenantCity: r.tenants?.city ?? null,
  tenantSocials: toSocials(r.tenants?.socials),
  tenantVerifiedAt: r.tenants?.verified_at ?? null,
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

const REQUEST_SELECT = "id, org_id, status, note, created_at, decided_at, profiles (full_name, city, avatar_path, socials, verified_at), tenants (id, name, city, socials, verified_at)";

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

/* ── THE DESK, PAGED (11 Sep 2026) ──────────────────────────────────────────
 *
 *  The user's objection, exactly: "how am I gonna scroll down if there are 2k
 *  studios which applied?" The queue read every pending request into one list
 *  and every organization on the platform under it — 500 rows, then a hard
 *  stop, no counts, no search. These read one PAGE, say how many there are in
 *  all, and match a name. They are plain table reads under the two policies
 *  that already exist — "admins read every request", and profiles being
 *  signed-in readable — so no migration stands between the screen and them.
 *  The count is PostgREST's own (`count: "exact"`), which is a COUNT(*) under
 *  the same RLS, not a second list. */

export interface VerificationCounts {
  /** requests waiting on an admin */
  pending: number;
  /** requests an admin said no to (the organization may ask again) */
  rejected: number;
  /** organizations wearing the tick right now — grandfathered ones included */
  verifiedOrgs: number;
  /** STUDIOS wearing the badge right now (11 Sep 2026) — the figure that
   *  replaced verifiedOrgs on the desk once the review moved to the studio */
  verifiedStudios: number;
  /** every live organization */
  orgs: number;
}

const headCount = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string): Promise<number> => {
  const { count, error } = await q;
  if (error) {
    throw new Error(`verification.count ${what} failed: ${error.message}`);
  }
  return count ?? 0;
};

export async function countVerification(supabase: SupabaseClient): Promise<VerificationCounts> {
  const [pending, rejected, verifiedOrgs, verifiedStudios, orgs] = await Promise.all([
    headCount(supabase.from("org_verification_requests").select("id", { count: "exact", head: true }).eq("status", "pending").is("deleted_at", null), "pending"),
    headCount(supabase.from("org_verification_requests").select("id", { count: "exact", head: true }).eq("status", "rejected").is("deleted_at", null), "rejected"),
    headCount(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "org").is("deleted_at", null).not("verified_at", "is", null), "verified"),
    headCount(supabase.from("tenants").select("id", { count: "exact", head: true }).eq("type", "studio").is("deleted_at", null).not("verified_at", "is", null), "verified studios"),
    headCount(supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "org").is("deleted_at", null), "orgs"),
  ]);
  return { pending, rejected, verifiedOrgs, verifiedStudios, orgs };
}

/* `!inner` so a filter on the organization's name narrows the REQUESTS, not
   merely the embedded profile — without it a non-matching row still comes back
   with `profiles: null`, which is the opposite of a search */
const REQUEST_SELECT_INNER = "id, org_id, status, note, created_at, decided_at, profiles!inner (full_name, city, avatar_path, socials, verified_at), tenants (id, name, city, socials, verified_at)";

export interface Page<T> {
  rows: T[];
  /** how many match in all, not how many are on this page */
  total: number;
}

/** One page of requests in one state. Pending is oldest first — the person who
 *  has waited longest is at the top; anything decided is newest decision first. */
export async function findVerificationRequestsPage(
  supabase: SupabaseClient,
  input: { status: VerificationStatus; q?: string | null; page: number; pageSize: number }
): Promise<Page<VerificationRequest>> {
  const from = (input.page - 1) * input.pageSize;
  let query = supabase
    .from("org_verification_requests")
    .select(REQUEST_SELECT_INNER, { count: "exact" })
    .eq("status", input.status)
    .is("deleted_at", null);
  if (input.q) {
    /* the desk searches by the STUDIO's name now — and still by the
       organization's, since a request from before 11 Sep 2026 has no studio.
       PostgREST's `or` across an embedded table needs the table named. */
    const term = input.q.replace(/[%_,()]/g, " ").trim();
    if (term) {
      query = query.or(`full_name.ilike.%${term}%`, { referencedTable: "profiles" });
    }
  }
  query = input.status === "pending" ? query.order("created_at", { ascending: true }) : query.order("decided_at", { ascending: false, nullsFirst: false });
  const { data, error, count } = await query.range(from, from + input.pageSize - 1);
  if (error) {
    throw new Error(`verification.page failed: ${error.message}`);
  }
  return { rows: ((data ?? []) as unknown as RequestRow[]).map(toRequest), total: count ?? 0 };
}

/** One page of organizations: all of them, only the verified, or only the
 *  unverified — matched on name or city. */
export async function findOrganizationsPage(
  supabase: SupabaseClient,
  input: { verified?: boolean; q?: string | null; page: number; pageSize: number }
): Promise<Page<OrganizationRow>> {
  const from = (input.page - 1) * input.pageSize;
  let query = supabase
    .from("profiles")
    .select("id, full_name, city, avatar_path, socials, verified_at, created_at", { count: "exact" })
    .eq("role", "org")
    .is("deleted_at", null);
  if (input.verified === true) {
    query = query.not("verified_at", "is", null);
  } else if (input.verified === false) {
    query = query.is("verified_at", null);
  }
  if (input.q) {
    const term = input.q.replace(/[%_,()]/g, " ").trim();
    if (term) {
      query = query.or(`full_name.ilike.%${term}%,city.ilike.%${term}%`);
    }
  }
  const { data, error, count } = await query.order(input.verified === true ? "verified_at" : "created_at", { ascending: false }).range(from, from + input.pageSize - 1);
  if (error) {
    throw new Error(`verification.orgs page failed: ${error.message}`);
  }
  return {
    total: count ?? 0,
    rows: ((data ?? []) as Array<{ id: string; full_name: string; city: string | null; avatar_path: string | null; socials: unknown; verified_at: string | null; created_at: string }>).map((r) => ({
      id: r.id,
      name: r.full_name,
      city: r.city,
      avatarPath: r.avatar_path,
      socials: toSocials(r.socials),
      verifiedAt: r.verified_at,
      createdAt: r.created_at,
    })),
  };
}

/** ONE STUDIO as the admin's Approved tab draws it (11 Sep 2026). */
export interface StudioRow {
  id: string;
  name: string;
  city: string | null;
  area: string | null;
  photoPath: string | null;
  socials: SocialLink[];
  verifiedAt: string | null;
  visibility: string;
  /** the organization that runs it */
  ownerId: string | null;
  ownerName: string | null;
}

/** One page of studios WEARING THE BADGE — what the Approved tab is now, with
 *  the one lever that changes it. Matched on the studio's name or city. */
export async function findVerifiedStudiosPage(
  supabase: SupabaseClient,
  input: { q?: string | null; page: number; pageSize: number }
): Promise<Page<StudioRow>> {
  const from = (input.page - 1) * input.pageSize;
  let query = supabase
    .from("tenants")
    .select("id, name, city, area, photo_path, socials, verified_at, visibility, tenant_members (user_id, member_role, deleted_at, profiles (full_name))", { count: "exact" })
    .eq("type", "studio")
    .is("deleted_at", null)
    .not("verified_at", "is", null);
  if (input.q) {
    const term = input.q.replace(/[%_,()]/g, " ").trim();
    if (term) {
      query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%`);
    }
  }
  const { data, error, count } = await query.order("verified_at", { ascending: false }).range(from, from + input.pageSize - 1);
  if (error) {
    throw new Error(`verification.studios page failed: ${error.message}`);
  }
  type Row = {
    id: string; name: string; city: string | null; area: string | null; photo_path: string | null; socials: unknown; verified_at: string | null; visibility: string;
    tenant_members: Array<{ user_id: string; member_role: string; deleted_at: string | null; profiles: { full_name: string } | null }> | null;
  };
  return {
    total: count ?? 0,
    rows: ((data ?? []) as unknown as Row[]).map((r) => {
      const owner = (r.tenant_members ?? []).find((m) => m.member_role === "owner" && !m.deleted_at) ?? null;
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        area: r.area,
        photoPath: r.photo_path,
        socials: toSocials(r.socials),
        verifiedAt: r.verified_at,
        visibility: r.visibility,
        ownerId: owner?.user_id ?? null,
        ownerName: owner?.profiles?.full_name ?? null,
      };
    }),
  };
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
