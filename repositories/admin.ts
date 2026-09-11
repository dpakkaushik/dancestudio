import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialLink } from "@/types/profile";

/** PLATFORM ADMINS AND STUDIO VERIFICATION (8 Sep 2026; rewritten 11 Sep).
 *
 *  ⚠ AN ORGANIZATION IS NEVER REVIEWED BY A HUMAN. The user: "org no more needs
 *  admin verification at all — org has only GST verification, that will be done
 *  by the API; just the studio needs admin verification." So a request in this
 *  table is a STUDIO asking to be checked: its 5-10 photos of the space and its
 *  own public links. An admin approves or rejects with a reason; approval is
 *  `tenants.verified_at`, the badge, and the studio's own subscription is what
 *  then puts it on Discover.
 *
 *  Rows with a null `tenant_id` are the organization reviews this replaced.
 *  They are kept as history and are NOT read back into the queue — every read
 *  here asks for `tenant_id` — because there is no longer anybody to decide
 *  them. Every write is an RPC that re-checks who is asking, so nothing in this
 *  file decides anything. */

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
    .not("tenant_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) {
    throw new Error(`verification.queue failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as RequestRow[]).map(toRequest);
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
  /** studios waiting on an admin */
  pending: number;
  /** studios an admin said no to (the owner may ask again) */
  rejected: number;
  /** STUDIOS wearing the badge right now (11 Sep 2026) */
  verifiedStudios: number;
  /** every live studio — the denominator that says how much of the platform
   *  has been checked at all */
  studios: number;
}

const headCount = async (q: PromiseLike<{ count: number | null; error: { message: string } | null }>, what: string): Promise<number> => {
  const { count, error } = await q;
  if (error) {
    throw new Error(`verification.count ${what} failed: ${error.message}`);
  }
  return count ?? 0;
};

export async function countVerification(supabase: SupabaseClient): Promise<VerificationCounts> {
  const [pending, rejected, verifiedStudios, studios] = await Promise.all([
    headCount(supabase.from("org_verification_requests").select("id", { count: "exact", head: true }).eq("status", "pending").not("tenant_id", "is", null).is("deleted_at", null), "pending"),
    headCount(supabase.from("org_verification_requests").select("id", { count: "exact", head: true }).eq("status", "rejected").not("tenant_id", "is", null).is("deleted_at", null), "rejected"),
    headCount(supabase.from("tenants").select("id", { count: "exact", head: true }).eq("type", "studio").is("deleted_at", null).not("verified_at", "is", null), "verified studios"),
    headCount(supabase.from("tenants").select("id", { count: "exact", head: true }).eq("type", "studio").is("deleted_at", null), "studios"),
  ]);
  return { pending, rejected, verifiedStudios, studios };
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
    /* a studio's review; the organization reviews this replaced stay history */
    .not("tenant_id", "is", null)
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
