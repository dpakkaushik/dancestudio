import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { INK, SUB } from "@/lib/design/tokens";

/** FIRST-MONTH REFUNDS THAT ARE NOT DONE (10 Oct 2026). A studio rejected at
 *  verification gets its first period back through Cashfree; the refund is
 *  PENDING until Cashfree says the money moved, and FAILED if it says it did
 *  not. ⚠ This block exists because the failure notification goes to platform
 *  admins WITH A PROFILE, and the admin account is admin-only with none — so a
 *  failed refund would otherwise be noticed by nobody. Drawn on the money desk
 *  only when there is something on it.
 *
 *  Read with the service role: the page is behind `requireAdmin()`, and a
 *  business that is not listed (a rejected studio never is) is not one an admin
 *  reads through `businesses` RLS — its NAME is the point of the row. */

interface Row {
  id: string;
  amount_inr: number;
  status: "pending" | "failed";
  provider_refund_id: string;
  created_at: string;
  subscriptions: { kind: string; businesses: { name: string } | null } | null;
}

export async function FirstMonthRefunds() {
  let rows: Row[] = [];
  try {
    const { data } = await createSupabaseAdminClient()
      .from("subscription_refunds")
      .select("id, amount_inr, status, provider_refund_id, created_at, subscriptions (kind, businesses (name))")
      .in("status", ["pending", "failed"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    rows = (data ?? []) as unknown as Row[];
  } catch {
    return null;
  }
  if (rows.length === 0) return null;
  return (
    <section data-testid="first-month-refunds" style={{ margin: "6px 16px 0", padding: "12px 13px", borderRadius: 16, border: "1.5px solid var(--el)", background: "var(--card)" }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", marginBottom: 8 }}>FIRST-MONTH REFUNDS NOT DONE · {rows.length}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {rows.map((r) => (
          <div key={r.id} data-status={r.status} style={{ display: "flex", alignItems: "center", gap: 10, borderLeft: `4px solid ${r.status === "failed" ? "#EF4444" : "#F59E0B"}`, paddingLeft: 9 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.subscriptions?.businesses?.name ?? "A subscription"} · ₹{r.amount_inr.toLocaleString("en-IN")}
              </div>
              <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>
                {r.status === "failed"
                  ? `Cashfree did not send it back — refund it from the Cashfree dashboard (${r.provider_refund_id})`
                  : `With Cashfree, not yet paid out (${r.provider_refund_id})`}
              </div>
            </div>
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.5, padding: "2px 6px", borderRadius: 5, background: r.status === "failed" ? "#FEE2E2" : "#FEF3C7", color: r.status === "failed" ? "#B42318" : "#92400E" }}>
              {r.status === "failed" ? "FAILED" : "PROCESSING"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
