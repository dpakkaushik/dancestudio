import type { SupabaseClient } from "@supabase/supabase-js";

/** Invoices (prototype S_invoices 16691-16720): a row per payment — who paid,
 *  for what, how much, its state. A person's ledger is the payments THEY made
 *  (`user_id = auth.uid()` out loud); a business's is the payments it took.
 *  Both read Step 9's `payments` under the RLS it set: the payer their own, the
 *  tenant's members their studio's. Nothing is invented — a captured payment is
 *  PAID, a refunded one says so. */

export type InvoiceStatus = "paid" | "refunded";

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
  classShareSlug: string | null;
}

interface PaymentRow {
  id: string;
  amount_inr: number;
  method: string | null;
  status: "captured" | "failed" | "refunded";
  created_at: string;
  profiles: { full_name: string } | null;
  orders: { classes: { title: string; style: string; share_slug: string } | null; tenants: { name: string } | null } | null;
}

const SELECT = "id, amount_inr, method, status, created_at, profiles (full_name), orders!inner (classes (title, style, share_slug), tenants (name))";

const numberOf = (id: string, iso: string) => `INV-${new Date(iso).getFullYear()}-${id.replace(/-/g, "").slice(-4).toUpperCase()}`;

const toRow = (r: PaymentRow, side: "mine" | "tenant"): InvoiceRow => ({
  id: r.id,
  number: numberOf(r.id, r.created_at),
  who: side === "mine" ? (r.orders?.tenants?.name ?? "A business") : (r.profiles?.full_name ?? "Someone"),
  what: r.orders?.classes ? `${r.orders.classes.style} · ${r.orders.classes.title}` : "Class booking",
  amountInr: r.amount_inr,
  method: r.method,
  status: r.status === "refunded" ? "refunded" : "paid",
  paidAt: r.created_at,
  classShareSlug: r.orders?.classes?.share_slug ?? null,
});

/** the payments I made — my invoices */
export async function findMyInvoices(supabase: SupabaseClient): Promise<InvoiceRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("payments")
    .select(SELECT)
    .eq("user_id", user.id)
    .in("status", ["captured", "refunded"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    throw new Error(`invoices.mine failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as PaymentRow[]).map((r) => toRow(r, "mine"));
}

/** the payments a business took — its ledger (members, by RLS) */
export async function findTenantInvoices(supabase: SupabaseClient, tenantId: string): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(SELECT)
    .eq("tenant_id", tenantId)
    .in("status", ["captured", "refunded"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    throw new Error(`invoices.tenant failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as PaymentRow[]).map((r) => toRow(r, "tenant"));
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
