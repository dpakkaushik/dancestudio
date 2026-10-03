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
  /** days a pass lasts from purchase; null = never expires (3 Oct 2026) */
  validityDays: number | null;
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
  /** the caller holds a live pass of this one — Buy is not offered (2 Oct 2026) */
  held: boolean;
}

export interface MembershipHolder extends PassExpiry {
  passId: string;
  userId: string;
  name: string;
  avatarPath: string | null;
  unit: "classes" | "hours";
  unitsTotal: number;
  unitsUsed: number;
  status: "active" | "used_up" | "cancelled";
  boughtAt: string | null;
  /** what this holder was charged — the pass's own snapshot of the price */
  pricePaidInr: number;
}

/** one of MY memberships — the Memberships tile's list */
export interface MyPass extends PassExpiry {
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

/** HOW LONG A MEMBERSHIP LASTS (3 Oct 2026, the user: "membership should have a
 *  validity date in no. of days to use it from 30days, 60 days, 90 days"). Days
 *  from PURCHASE; null on a membership made before validity existed, which never
 *  expires. */
export type ValidityDays = 30 | 60 | 90;
export const VALIDITY_CHOICES: ValidityDays[] = [30, 60, 90];

/** a pass's expiry as every screen reads it — the date, and whether it has passed.
 *  "Expired" is DERIVED from the date; there is no status for it and no job. */
export interface PassExpiry {
  validityDays: number | null;
  expiresAt: string | null;
  expired: boolean;
}

const expiryOf = (validity: unknown, expires: unknown, now = Date.now()): PassExpiry => {
  const expiresAt = (expires as string | null) ?? null;
  return { validityDays: validity == null ? null : n(validity), expiresAt, expired: expiresAt != null && new Date(expiresAt).getTime() <= now };
};

/** ⚠ THE EXTRA READS ARE SEPARATE AND SOFT on purpose: the definer functions'
 *  RETURNS TABLE shapes are unchanged (a new column there is a drop-and-recreate
 *  that loses an ACL), and both tables are readable directly by exactly the
 *  people these screens are for — a membership by anyone while it is live on a
 *  listed page or by its business, a pass by its holder or the people running the
 *  business. A refusal, or a column not yet there, reads as "no validity". */
export async function findMembershipValidity(supabase: SupabaseClient, ids: string[]): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from("memberships").select("id, validity_days").in("id", ids.slice(0, 200));
  if (error) return out;
  for (const r of (data ?? []) as Array<{ id: string; validity_days: number | null }>) out.set(r.id, r.validity_days == null ? null : n(r.validity_days));
  return out;
}

export async function findPassExpiry(supabase: SupabaseClient, passIds: string[]): Promise<Map<string, PassExpiry>> {
  const out = new Map<string, PassExpiry>();
  if (passIds.length === 0) return out;
  const { data, error } = await supabase.from("membership_passes").select("id, validity_days, expires_at").in("id", passIds.slice(0, 400));
  if (error) return out;
  const now = Date.now();
  for (const r of (data ?? []) as Array<{ id: string; validity_days: number | null; expires_at: string | null }>) out.set(r.id, expiryOf(r.validity_days, r.expires_at, now));
  return out;
}

const NO_EXPIRY: PassExpiry = { validityDays: null, expiresAt: null, expired: false };

export async function findBusinessMemberships(supabase: SupabaseClient, businessId: string): Promise<MembershipWithUsage[]> {
  const { data, error } = await supabase.rpc("business_memberships", { p_business_id: businessId });
  if (error) throw new Error(`memberships.business failed: ${error.message}`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const validity = await findMembershipValidity(supabase, rows.map((r) => String(r.id)));
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    unit: r.unit as Membership["unit"],
    units: n(r.units),
    priceInr: n(r.price_inr),
    totalCount: n(r.total_count),
    status: r.status as Membership["status"],
    validityDays: validity.get(String(r.id)) ?? null,
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
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  /* ⚠ WHICH OF THESE YOU ALREADY HOLD (2 Oct 2026, the user: "should not be able
     to buy twice and should not show option to buy it if already active"). The
     database refuses a second live pass (`why_no_membership`) and the page went
     on drawing Buy now over it. The caller's OWN passes, said out loud — RLS
     admits their own rows, and that is the scope, not a ceiling to lean on. A
     signed-out visitor holds nothing, so the read is not made for one. */
  const ids = rows.map((r) => String(r.id));
  const held = new Set<string>();
  const validity = await findMembershipValidity(supabase, ids);
  if (ids.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: mine } = await supabase
        .from("membership_passes")
        .select("membership_id, units_used, units_total, expires_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("membership_id", ids)
        .is("deleted_at", null);
      const now = Date.now();
      /* ⚠ an EXPIRED pass is not held — the database lets them buy another (3 Oct) */
      for (const p of (mine ?? []) as Array<{ membership_id: string; units_used: number; units_total: number; expires_at?: string | null }>) {
        const live = !p.expires_at || new Date(p.expires_at).getTime() > now;
        if (Number(p.units_used) < Number(p.units_total) && live) held.add(p.membership_id);
      }
    }
  }
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    unit: r.unit as Membership["unit"],
    units: n(r.units),
    priceInr: n(r.price_inr),
    totalCount: n(r.total_count),
    validityDays: validity.get(String(r.id)) ?? null,
    leftCount: n(r.left_count),
    held: held.has(String(r.id)),
  }));
}

export async function findMembershipHolders(supabase: SupabaseClient, membershipId: string): Promise<MembershipHolder[]> {
  const { data, error } = await supabase.rpc("membership_holders", { p_membership_id: membershipId });
  if (error) return [];
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  /* the expiry AND what each holder paid, in one soft read of the pass rows —
     the seller reads its own passes (`20261003110000`); a refusal reads as no
     validity and nothing paid, never as an error (3 Oct 2026) */
  const ids = rows.map((r) => String(r.pass_id));
  const expiry = new Map<string, PassExpiry>();
  const paid = new Map<string, number>();
  if (ids.length > 0) {
    const { data: passData } = await supabase.from("membership_passes").select("id, validity_days, expires_at, price_inr").in("id", ids.slice(0, 400));
    const now = Date.now();
    for (const p of (passData ?? []) as Array<{ id: string; validity_days: number | null; expires_at: string | null; price_inr: number | null }>) {
      expiry.set(p.id, expiryOf(p.validity_days, p.expires_at, now));
      paid.set(p.id, n(p.price_inr));
    }
  }
  return rows.map((r) => ({
    ...(expiry.get(String(r.pass_id)) ?? NO_EXPIRY),
    pricePaidInr: paid.get(String(r.pass_id)) ?? 0,
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
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const expiry = await findPassExpiry(supabase, rows.map((r) => String(r.pass_id)));
  return rows.map((r) => ({
    ...(expiry.get(String(r.pass_id)) ?? NO_EXPIRY),
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

/** EVERY SESSION ONE PASS HAS BEEN SPENT ON (`pass_uses`, 19 Sep 2026 — with
 *  no caller until 30 Sep). The holder's own history, and the seller's answer
 *  to "which classes did THIS person spend theirs on": the class-wise and the
 *  student-wise lists on the usage page each answered half of that, and the
 *  question a seller actually asks is the cross of the two. The RPC admits the
 *  holder and the seller's team and nobody else; a refusal reads as nothing. */
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

/** the uses of several passes at once, keyed by pass — ONE call per pass that
 *  has spent anything, in parallel, never one for a pass that has spent nothing */
export async function findPassUsesMany(supabase: SupabaseClient, passes: Array<{ passId: string; unitsUsed: number }>): Promise<Record<string, PassUse[]>> {
  const spent = passes.filter((p) => p.unitsUsed > 0).slice(0, 60);
  const lists = await Promise.all(spent.map((p) => findPassUses(supabase, p.passId)));
  const out: Record<string, PassUse[]> = {};
  spent.forEach((p, i) => {
    out[p.passId] = lists[i];
  });
  return out;
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
  /** 30 · 60 · 90 days from purchase (3 Oct 2026) */
  validityDays: ValidityDays;
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
    /* ⚠ needs `20261003160000` — PostgREST resolves an RPC by its argument
       NAMES, so this key is a PGRST202 until that migration is applied */
    p_validity_days: input.validityDays,
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

