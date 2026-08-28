import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimKind, ClassClaim, MyClaimAsk } from "@/types/claim";

/** Claims move only through the RPCs: the studio asks, and only the person asked
 *  can answer. Reads are RLS-shaped — the public sees confirmed claims on
 *  published classes, a member sees their tenant's, and you always see your own. */

interface ClaimRow {
  id: string;
  class_id: string;
  user_id: string;
  kind: ClaimKind;
  status: "asked" | "confirmed" | "rejected";
  can_attendance: boolean;
  can_refunds: boolean;
  pay_per_session_inr: number;
  created_at: string;
  profiles: { full_name: string; city: string | null } | null;
}

const CLAIM_COLUMNS =
  "id, class_id, user_id, kind, status, can_attendance, can_refunds, pay_per_session_inr, created_at, profiles (full_name, city)";

const toClaim = (row: ClaimRow): ClassClaim => ({
  id: row.id,
  classId: row.class_id,
  userId: row.user_id,
  kind: row.kind,
  status: row.status,
  canAttendance: row.can_attendance,
  canRefunds: row.can_refunds,
  payPerSessionInr: row.pay_per_session_inr ?? 0,
  createdAt: row.created_at,
  personName: row.profiles?.full_name ?? "Someone",
  personCity: row.profiles?.city ?? null,
});

/** Everybody on one class — what the viewer may see is decided by RLS. */
export async function findClaimsByClass(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassClaim[]> {
  const { data, error } = await supabase
    .from("class_claims")
    .select(CLAIM_COLUMNS)
    .eq("class_id", classId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`claims.findByClass failed: ${error.message}`);
  }
  return (data as unknown as ClaimRow[]).map(toClaim);
}

interface MyAskRow extends ClaimRow {
  classes: {
    title: string;
    style: string;
    share_slug: string;
    tenants: { name: string } | null;
    class_sessions: Array<{ starts_at: string }> | null;
  } | null;
}

/** The asks waiting for the signed-in person, newest first.
 *
 *  Says `user_id = auth.uid()` OUT LOUD. This leaned on RLS to mean "my asks",
 *  but Step 11 lets a tenant's members read every claim on their tenant — so
 *  for a studio owner this returned the asks the studio SENT as if they were
 *  asks waiting for the owner. The fourth time this lesson has surfaced: RLS is
 *  a ceiling, not a scoping mechanism. (No caller hit it yet; fixed at Step 14
 *  while the calendar was reading the same table.) */
export async function findMyPendingClaims(supabase: SupabaseClient): Promise<MyClaimAsk[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }
  const { data, error } = await supabase
    .from("class_claims")
    .select(
      `${CLAIM_COLUMNS}, classes (title, style, share_slug, tenants (name), class_sessions (starts_at))`
    )
    .eq("user_id", user.id)
    .eq("status", "asked")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`claims.findMinePending failed: ${error.message}`);
  }
  return (data as unknown as MyAskRow[])
    .filter((r) => r.classes)
    .map((r) => ({
      ...toClaim(r),
      classTitle: r.classes!.title,
      classStyle: r.classes!.style,
      classShareSlug: r.classes!.share_slug,
      tenantName: r.classes!.tenants?.name ?? "",
      startsAt:
        [...(r.classes!.class_sessions ?? [])]
          .map((s) => s.starts_at)
          .sort((a, b) => a.localeCompare(b))[0] ?? null,
    }));
}

export async function claimPerson(
  supabase: SupabaseClient,
  input: {
    classId: string;
    userId: string;
    kind: ClaimKind;
    canAttendance?: boolean;
    canRefunds?: boolean;
    payPerSessionInr?: number;
  }
): Promise<void> {
  const { error } = await supabase.rpc("claim_person", {
    p_class_id: input.classId,
    p_user_id: input.userId,
    p_kind: input.kind,
    p_can_attendance: input.canAttendance ?? false,
    p_can_refunds: input.canRefunds ?? false,
    p_pay_per_session_inr: input.payPerSessionInr ?? 0,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** What a session pays is the OWNER's call alone — separate from the jobs an
 *  owner or trainer hands out, which is why this is not part of setClaimPowers. */
export async function setClaimPay(
  supabase: SupabaseClient,
  claimId: string,
  payPerSessionInr: number
): Promise<void> {
  const { error } = await supabase.rpc("set_claim_pay", {
    p_claim_id: claimId,
    p_pay_per_session_inr: payPerSessionInr,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function respondToClaim(
  supabase: SupabaseClient,
  claimId: string,
  accept: boolean
): Promise<void> {
  const { error } = await supabase.rpc("respond_to_claim", {
    p_claim_id: claimId,
    p_accept: accept,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function withdrawClaim(supabase: SupabaseClient, claimId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_claim", { p_claim_id: claimId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function setClaimPowers(
  supabase: SupabaseClient,
  claimId: string,
  canAttendance: boolean,
  canRefunds: boolean
): Promise<void> {
  const { error } = await supabase.rpc("set_claim_powers", {
    p_claim_id: claimId,
    p_can_attendance: canAttendance,
    p_can_refunds: canRefunds,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Asks a set of businesses have SENT and are still waiting on — the Requests
 *  desk's Sent side for whoever runs those businesses (prototype 5734: "it is
 *  the reason a class of yours is still a draft, so it says so"). Says which
 *  tenants out loud: members read their tenant's claims under RLS, and a person
 *  on two teams would otherwise see both as one list. */
export async function findAskedClaimsForTenants(supabase: SupabaseClient, tenantIds: string[]): Promise<MyClaimAsk[]> {
  if (tenantIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("class_claims")
    .select(
      `${CLAIM_COLUMNS}, classes (title, style, share_slug, tenants (name), class_sessions (starts_at))`
    )
    .in("tenant_id", tenantIds)
    .eq("status", "asked")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`claims.findAskedForTenants failed: ${error.message}`);
  }
  return (data as unknown as MyAskRow[])
    .filter((r) => r.classes)
    .map((r) => ({
      ...toClaim(r),
      classTitle: r.classes!.title,
      classStyle: r.classes!.style,
      classShareSlug: r.classes!.share_slug,
      tenantName: r.classes!.tenants?.name ?? "",
      startsAt:
        [...(r.classes!.class_sessions ?? [])]
          .map((s) => s.starts_at)
          .sort((a, b) => a.localeCompare(b))[0] ?? null,
    }));
}
