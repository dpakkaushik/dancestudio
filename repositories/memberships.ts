import type { SupabaseClient } from "@supabase/supabase-js";

/** MEMBERSHIPS (19 Sep 2026). Four things are sold — a name, a unit with how
 *  many of it, a price, and how many may be sold — and everything else on these
 *  screens is counted from the passes people bought and the uses they spent.
 *
 *  Every read here is one of the migration's definer functions, because who
 *  holds a membership and how far through it they are is the seller's and the
 *  holder's business and nobody else's. */

export interface Membership {
  id: string;
  name: string;
  unit: "classes" | "hours";
  units: number;
  priceInr: number;
  totalCount: number;
  status: "live" | "draft";
}

/** a membership as its seller sees it: what it has done */
export interface MembershipWithUsage extends Membership {
  sold: number;
  active: number;
  unitsSold: number;
  unitsUsed: number;
  revenueInr: number;
}

/** a membership as a shopper sees it on a public page */
export interface MembershipOnSale extends Omit<Membership, "status"> {
  leftCount: number;
}

export interface MembershipHolder {
  passId: string;
  userId: string;
  name: string;
  avatarPath: string | null;
  unit: "classes" | "hours";
  unitsTotal: number;
  unitsUsed: number;
  status: "active" | "used_up" | "cancelled";
  boughtAt: string | null;
}

/** one of MY memberships — the Memberships tile's list */
export interface MyPass {
  passId: string;
  membershipId: string;
  name: string;
  businessId: string;
  businessName: string;
  businessType: "studio" | "artist_page" | "org";
  unit: "classes" | "hours";
  unitsTotal: number;
  unitsUsed: number;
  status: "pending_payment" | "active" | "used_up" | "cancelled";
  priceInr: number;
  boughtAt: string | null;
}

export interface MembershipClassUse {
  classId: string;
  shareSlug: string;
  style: string;
  level: string;
  businessName: string;
  uses: number;
  units: number;
  people: number;
}

export interface PassUse {
  classId: string;
  shareSlug: string;
  style: string;
  level: string;
  businessName: string;
  startsAt: string;
  units: number;
}

/** a pass this session will take, and what it would cost off it */
export interface PassForSession {
  passId: string;
  membershipName: string;
  businessName: string;
  unit: "classes" | "hours";
  unitsTotal: number;
  unitsUsed: number;
  unitsNeeded: number;
  enough: boolean;
}

const n = (v: unknown): number => Number(v ?? 0);

export async function findBusinessMemberships(supabase: SupabaseClient, businessId: string): Promise<MembershipWithUsage[]> {
  const { data, error } = await supabase.rpc("business_memberships", { p_business_id: businessId });
  if (error) throw new Error(`memberships.business failed: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    unit: r.unit as Membership["unit"],
    units: n(r.units),
    priceInr: n(r.price_inr),
    totalCount: n(r.total_count),
    status: r.status as Membership["status"],
    sold: n(r.sold),
    active: n(r.active),
    unitsSold: n(r.units_sold),
    unitsUsed: n(r.units_used),
    revenueInr: n(r.revenue_inr),
  }));
}

/** what a listed studio or artist page has on sale — readable by anybody */
export async function findMembershipsOnSale(supabase: SupabaseClient, businessId: string): Promise<MembershipOnSale[]> {
  const { data, error } = await supabase.rpc("public_memberships", { p_business_id: businessId });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    unit: r.unit as Membership["unit"],
    units: n(r.units),
    priceInr: n(r.price_inr),
    totalCount: n(r.total_count),
    leftCount: n(r.left_count),
  }));
}

export async function findMembershipHolders(supabase: SupabaseClient, membershipId: string): Promise<MembershipHolder[]> {
  const { data, error } = await supabase.rpc("membership_holders", { p_membership_id: membershipId });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    passId: String(r.pass_id),
    userId: String(r.user_id),
    name: String(r.full_name ?? "Someone"),
    avatarPath: (r.profile_photo_path as string | null) ?? null,
    unit: r.unit as Membership["unit"],
    unitsTotal: n(r.units_total),
    unitsUsed: n(r.units_used),
    status: r.status as MembershipHolder["status"],
    boughtAt: (r.bought_at as string | null) ?? null,
  }));
}

export async function findMembershipClassUsage(supabase: SupabaseClient, membershipId: string): Promise<MembershipClassUse[]> {
  const { data, error } = await supabase.rpc("membership_class_usage", { p_membership_id: membershipId });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    classId: String(r.class_id),
    shareSlug: String(r.share_slug),
    style: String(r.style),
    level: String(r.level),
    businessName: String(r.business_name ?? ""),
    uses: n(r.uses),
    units: n(r.units),
    people: n(r.people),
  }));
}

export async function findMyMemberships(supabase: SupabaseClient): Promise<MyPass[]> {
  const { data, error } = await supabase.rpc("my_memberships");
  if (error) throw new Error(`memberships.mine failed: ${error.message}`);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    passId: String(r.pass_id),
    membershipId: String(r.membership_id),
    name: String(r.name),
    businessId: String(r.business_id),
    businessName: String(r.business_name ?? ""),
    businessType: r.business_type as MyPass["businessType"],
    unit: r.unit as Membership["unit"],
    unitsTotal: n(r.units_total),
    unitsUsed: n(r.units_used),
    status: r.status as MyPass["status"],
    priceInr: n(r.price_inr),
    boughtAt: (r.bought_at as string | null) ?? null,
  }));
}

export async function findPassUses(supabase: SupabaseClient, passId: string): Promise<PassUse[]> {
  const { data, error } = await supabase.rpc("pass_uses", { p_pass_id: passId });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    classId: String(r.class_id),
    shareSlug: String(r.share_slug),
    style: String(r.style),
    level: String(r.level),
    businessName: String(r.business_name ?? ""),
    startsAt: String(r.starts_at),
    units: n(r.units),
  }));
}

/** which of my passes this session takes — the booking sheet's one question */
export async function findPassesForSession(supabase: SupabaseClient, sessionId: string): Promise<PassForSession[]> {
  const { data, error } = await supabase.rpc("passes_for_session", { p_session_id: sessionId });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    passId: String(r.pass_id),
    membershipName: String(r.membership_name),
    businessName: String(r.business_name ?? ""),
    unit: r.unit as Membership["unit"],
    unitsTotal: n(r.units_total),
    unitsUsed: n(r.units_used),
    unitsNeeded: n(r.units_needed),
    enough: Boolean(r.enough),
  }));
}

/* ── writes: every rule is the RPC's ── */

export interface MembershipInput {
  membershipId?: string | null;
  businessId: string;
  name: string;
  unit: "classes" | "hours";
  units: number;
  priceInr: number;
  totalCount: number;
  status: "live" | "draft";
}

export async function saveMembership(supabase: SupabaseClient, input: MembershipInput): Promise<string> {
  const { data, error } = await supabase.rpc("save_membership", {
    p_membership_id: input.membershipId ?? null,
    p_business_id: input.businessId,
    p_name: input.name,
    p_unit: input.unit,
    p_units: input.units,
    p_price_inr: input.priceInr,
    p_total_count: input.totalCount,
    p_status: input.status,
  });
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

const rpcVoid = async (supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<void> => {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
};

export const deleteMembership = (supabase: SupabaseClient, membershipId: string) => rpcVoid(supabase, "delete_membership", { p_membership_id: membershipId });

/** Buy one. A free membership comes back ACTIVE; a priced one comes back
 *  `pending_payment` and the caller takes it to the checkout. */
export async function buyMembership(supabase: SupabaseClient, membershipId: string): Promise<{ passId: string; status: string; priceInr: number }> {
  const { data, error } = await supabase.rpc("buy_membership", { p_membership_id: membershipId });
  if (error) throw new Error(error.message);
  const row = data as { id: string; status: string; price_inr: number };
  return { passId: row.id, status: row.status, priceInr: n(row.price_inr) };
}

export async function bookWithMembership(supabase: SupabaseClient, sessionId: string, passId: string): Promise<string> {
  const { data, error } = await supabase.rpc("book_with_membership", { p_session_id: sessionId, p_pass_id: passId });
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

/** the sentence between somebody and a membership, or null when they may have it */
export async function findWhyNoMembership(supabase: SupabaseClient, membershipId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("why_no_membership", { p_membership_id: membershipId });
  if (error) return null;
  return (data as string | null) ?? null;
}
