import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";

/** Invoices (prototype S_invoices 16691-16720): a row per payment — who paid,
 *  for what, how much, its state. A person's ledger is the payments THEY made
 *  (`user_id = auth.uid()` out loud); a business's is the payments it took.
 *  Both read Step 9's `payments` under the RLS it set: the payer their own, the
 *  tenant's members their studio's. Nothing is invented — a captured payment is
 *  PAID, a refunded one says so.
 *
 *  THREE KINDS OF ROW since 17 Sep 2026: a class seat, an event ticket or
 *  entry (an order names a class session OR an event now), and — on a
 *  person's own ledger — the subscription payments they made: the Artist
 *  plan, or a studio's ₹1,200 a month. A studio's ledger lists only what it
 *  TOOK; what it PAID DanceOS is the owner's own invoice, not the studio's
 *  income. */

export type InvoiceStatus = "paid" | "refunded";
export type InvoiceKind = "class" | "event" | "subscription";

export interface InvoiceRow {
  id: string;
  /** INV-{yyyy}-{last 4 of the id} — a printable number derived from the row, so it is stable */
  number: string;
  who: string;
  what: string;
  amountInr: number;
  method: string | null;
  status: InvoiceStatus;
  paidAt: string;
  kind: InvoiceKind;
  /** where the row opens — the class page, the event page, the plan */
  href: string | null;
}

interface OrderPaymentRow {
  id: string;
  amount_inr: number;
  method: string | null;
  status: "captured" | "failed" | "refunded";
  created_at: string;
  profiles: { full_name: string } | null;
  orders: {
    classes: { style: string; level: string; share_slug: string } | null;
    events: { title: string; share_slug: string } | null;
    businesses: { name: string } | null;
  } | null;
}

interface SubscriptionPaymentRow {
  id: string;
  amount_inr: number;
  method: string | null;
  status: "captured" | "failed" | "refunded";
  created_at: string;
  kind: "subscription_auth" | "subscription_charge";
  subscriptions: { kind: "artist" | "studio"; businesses: { name: string } | null } | null;
}

const ORDER_SELECT =
  "id, amount_inr, method, status, created_at, profiles (full_name), orders!inner (classes (style, level, share_slug), events (title, share_slug), businesses (name))";
const SUBSCRIPTION_SELECT = "id, amount_inr, method, status, created_at, kind, subscriptions (kind, businesses (name))";

const numberOf = (id: string, iso: string) => `INV-${new Date(iso).getFullYear()}-${id.replace(/-/g, "").slice(-4).toUpperCase()}`;

const toOrderRow = (r: OrderPaymentRow, side: "mine" | "tenant"): InvoiceRow => {
  const cls = r.orders?.classes ?? null;
  const ev = r.orders?.events ?? null;
  return {
    id: r.id,
    number: numberOf(r.id, r.created_at),
    who: side === "mine" ? (r.orders?.businesses?.name ?? "A business") : (r.profiles?.full_name ?? "Someone"),
    /* a class row reads "{style} · {level}" — the label, once; it used to print the
       style AND a typed title, which since the form lost its name field would have
       read "Bollywood · Bollywood · All levels" */
    what: cls ? dosClassLabel(cls.style, cls.level) : ev ? `Ticket · ${ev.title}` : "Booking",
    amountInr: r.amount_inr,
    method: r.method,
    status: r.status === "refunded" ? "refunded" : "paid",
    paidAt: r.created_at,
    kind: ev ? "event" : "class",
    href: cls ? `/c/${cls.share_slug}` : ev ? `/e/${ev.share_slug}` : null,
  };
};

const toSubscriptionRow = (r: SubscriptionPaymentRow): InvoiceRow => {
  const artist = r.subscriptions?.kind === "artist";
  const period = r.kind === "subscription_auth" ? "first period" : "renewal";
  return {
    id: r.id,
    number: numberOf(r.id, r.created_at),
    who: "DanceOS",
    what: artist ? `Artist plan · ${period}` : `Studio subscription · ${r.subscriptions?.businesses?.name ?? "a studio"} · ${period}`,
    amountInr: r.amount_inr,
    method: r.method,
    status: r.status === "refunded" ? "refunded" : "paid",
    paidAt: r.created_at,
    kind: "subscription",
    href: artist ? "/subscription" : "/business",
  };
};

const newestFirst = (a: InvoiceRow, b: InvoiceRow) => b.paidAt.localeCompare(a.paidAt);

/** the payments I made — my invoices: seats, tickets, and my subscriptions */
export async function findMyInvoices(supabase: SupabaseClient): Promise<InvoiceRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const [orders, subs] = await Promise.all([
    supabase
      .from("payments")
      .select(ORDER_SELECT)
      .eq("user_id", user.id)
      .eq("kind", "order")
      .in("status", ["captured", "refunded"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("payments")
      .select(SUBSCRIPTION_SELECT)
      .eq("user_id", user.id)
      .in("kind", ["subscription_auth", "subscription_charge"])
      .in("status", ["captured", "refunded"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (orders.error) {
    throw new Error(`invoices.mine failed: ${orders.error.message}`);
  }
  if (subs.error) {
    throw new Error(`invoices.mine(subscriptions) failed: ${subs.error.message}`);
  }
  return [
    ...((orders.data ?? []) as unknown as OrderPaymentRow[]).map((r) => toOrderRow(r, "mine")),
    ...((subs.data ?? []) as unknown as SubscriptionPaymentRow[]).map(toSubscriptionRow),
  ].sort(newestFirst);
}

/** the payments a business took — its ledger (members, by RLS). Seats and,
 *  for an organization's hosting row, tickets; never its own subscription,
 *  which is money it paid, not money it took. */
export async function findTenantInvoices(supabase: SupabaseClient, tenantId: string): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(ORDER_SELECT)
    .eq("business_id", tenantId)
    .eq("kind", "order")
    .in("status", ["captured", "refunded"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    throw new Error(`invoices.tenant failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as OrderPaymentRow[]).map((r) => toOrderRow(r, "tenant"));
}

/** How the money moved, per method (S_payments' YOUR METHODS 16594): counted
 *  off the invoice rows, most used first. A refunded payment still PAID by that
 *  method, so it counts; the sum is what went through it. */
export interface MethodUse {
  method: string;
  count: number;
  totalInr: number;
  lastAt: string;
}

export function methodUsesOf(rows: InvoiceRow[]): MethodUse[] {
  const by = new Map<string, MethodUse>();
  for (const r of rows) {
    const method = r.method?.trim() || "Cashfree";
    const cur = by.get(method);
    if (cur) {
      cur.count += 1;
      cur.totalInr += r.amountInr;
      if (r.paidAt > cur.lastAt) cur.lastAt = r.paidAt;
    } else {
      by.set(method, { method, count: 1, totalInr: r.amountInr, lastAt: r.paidAt });
    }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.totalInr - a.totalInr);
}
