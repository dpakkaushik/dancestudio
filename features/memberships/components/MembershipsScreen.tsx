"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { confirmCheckoutAction, startMembershipCheckoutAction } from "@/features/payments/server-actions/payments";
import { openCashfreeCheckout } from "@/lib/cashfree/checkout-client";
import { DeskHero } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { money as rupees } from "@/features/payouts/components/earnings-kit";
import type { MembershipWithUsage, MyPass } from "@/repositories/memberships";
import { saveMembershipAction } from "@/features/memberships/server-actions/memberships";

/** MEMBERSHIPS (19 Sep 2026, the user: "Users should be able to buy from Studio
 *  and Artist Profile Pages and track from memberships section in tools. Artist
 *  should be able to create and track usage of memberships they have created
 *  and memberships they have purchased").
 *
 *  So this one screen has two sides, and an artist is the account that has
 *  both: YOURS — the passes you hold, each with the progress bar that is the
 *  whole point of a membership — and ON SALE, what your studio or your page
 *  sells, each with how many went and how much of what was sold has actually
 *  been danced. A plain user sees only the first; a studio owner only the
 *  second; an artist both, which is why they are segments of one page rather
 *  than two tiles.
 *
 *  THE FOUR THINGS AND NOTHING ELSE (the user's own list): a name, classes or
 *  hours with how many, a price, and how many may be sold. */

const card: CSSProperties = { background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--solid)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "11px 12px", fontSize: 13, color: INK, outline: "none", marginBottom: 8, fontFamily: "inherit", textTransform: "none" };
const eyebrow: CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", margin: "4px 0 6px" };
const btn = (on: boolean): CSSProperties => ({ flex: 1, textAlign: "center", padding: "12px", borderRadius: 999, cursor: "pointer", fontWeight: 900, fontSize: 12.5, fontFamily: "inherit", border: on ? "none" : "1px solid var(--el)", background: on ? INK : "var(--card)", color: on ? LILAC : INK });

/** HOW FAR THROUGH — the one thing a membership is for (the user: "progress bar
 *  for completion"). Drawn from two real numbers, never a stored percentage. */
export function ProgressBar({ used, total, tint = "#22C55E", testId }: { used: number; total: number; tint?: string; testId?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div data-testid={testId} data-pct={pct} aria-label={`${used} of ${total} used`} style={{ marginTop: 6 }}>
      <div style={{ height: 6, borderRadius: 999, background: "var(--el)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: tint }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: SUB, marginTop: 4 }}>
        <span>
          {used} of {total} used
        </span>
        <span>{total - used} left</span>
      </div>
    </div>
  );
}

const unitWord = (unit: "classes" | "hours", n: number) => (unit === "hours" ? `${n} ${n === 1 ? "hour" : "hours"}` : `${n} ${n === 1 ? "class" : "classes"}`);

export function MembershipsScreen({
  passes,
  selling,
  sellerId,
  sellerName,
  canSell,
}: {
  /** what this person HOLDS */
  passes: MyPass[];
  /** what their studio or artist page SELLS — empty for a plain user */
  selling: MembershipWithUsage[];
  sellerId: string | null;
  sellerName: string | null;
  canSell: boolean;
}) {
  const router = useRouter();
  const [seg, setSeg] = useState<"mine" | "selling">(passes.length === 0 && canSell ? "selling" : "mine");
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name: "", unit: "classes" as "classes" | "hours", units: "10", price: "", total: "20" });
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };

  const save = () => {
    const units = Number(f.units);
    const price = Number(f.price);
    const total = Number(f.total);
    if (!f.name.trim()) return fire("Name the membership");
    if (!Number.isFinite(units) || units <= 0) return fire("Say how many classes or hours it is worth");
    if (!Number.isFinite(price) || price < 0) return fire("Put a price on it — ₹0 is allowed");
    if (!Number.isFinite(total) || total < 1) return fire("Say how many of these may be sold");
    if (!sellerId) return fire("No business to sell it from");
    start(async () => {
      const out = await saveMembershipAction({ membershipId: null, businessId: sellerId, name: f.name, unit: f.unit, units, priceInr: price, totalCount: total, status: "live" });
      if (out.error) return fire(out.error);
      setOpen(false);
      setF({ name: "", unit: "classes", units: "10", price: "", total: "20" });
      fire("🎟 Membership on sale");
      router.refresh();
    });
  };

  /* A PASS TAKEN BUT NOT PAID FOR — the checkout picks up where it left off, on
     the event page's own pattern: open Cashfree's window, then ask OUR server
     what happened on OUR order. The browser's word is never the answer. */
  const payFor = (p: MyPass) =>
    start(async () => {
      const res = await startMembershipCheckoutAction({ passId: p.passId, businessName: p.businessName, description: p.name });
      if (res.error || !res.checkout) return fire(res.error ?? "Could not start the payment");
      try {
        const result = await openCashfreeCheckout(res.checkout.paymentSessionId, res.checkout.mode);
        if (result.error) return fire(result.error.message ?? "The payment window closed before the payment finished");
      } catch (openError: unknown) {
        return fire(openError instanceof Error ? openError.message : "Could not open the payment window");
      }
      const out = await confirmCheckoutAction({ orderId: res.checkout.orderId });
      if (out.error) return fire(out.error);
      fire("🎟 Membership is yours");
      router.refresh();
    });

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      <DeskHero tool="memberships" as="h1" margin="0 0 10px" />

      {canSell ? (
        <div role="group" aria-label="Show" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {/* BOOKED · MANAGE (19 Sep 2026, the user: "membership columns should be
              Booked and Manage") — the same two sides, in the words the Classes
              desk already uses: what you hold, and what you sell */}
          {([["mine", `Booked · ${passes.length}`], ["selling", `Manage · ${selling.length}`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setSeg(k)} aria-pressed={seg === k} style={{ flex: 1, padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, border: "none", cursor: "pointer", fontFamily: "inherit", background: seg === k ? "var(--solid)" : "transparent", color: seg === k ? INK : SUB }}>
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {seg === "mine" ? (
        <>
          {passes.map((p) => (
            <div key={p.passId} style={card} data-testid="my-pass">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 900 }}>{p.name}</span>
                  <Link href={p.businessType === "studio" ? `/studio/${p.businessId}` : "/memberships"} style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2, textDecoration: "none" }}>
                    {p.businessName} · {unitWord(p.unit, p.unitsTotal)}
                  </Link>
                </span>
                <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 999, background: p.status === "active" ? "rgba(34,197,94,.16)" : "var(--el)", color: p.status === "active" ? "#22C55E" : SUB }}>
                  {p.status === "pending_payment" ? "UNPAID" : p.status === "used_up" ? "USED UP" : p.status === "cancelled" ? "CANCELLED" : "ACTIVE"}
                </span>
              </div>
              {p.status === "pending_payment" ? (
                <button type="button" disabled={pending} onClick={() => payFor(p)} style={{ ...btn(true), width: "100%", marginTop: 9 }}>
                  Pay {rupees(p.priceInr)}
                </button>
              ) : (
                <ProgressBar used={p.unitsUsed} total={p.unitsTotal} testId="pass-progress" />
              )}
            </div>
          ))}
          {passes.length === 0 ? (
            <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
              No memberships yet. A studio or an artist sells them on their profile page —{" "}
              <Link href="/discover" style={{ color: "#5AC8FA", fontWeight: 800 }}>
                find one
              </Link>
              .
            </div>
          ) : null}
        </>
      ) : (
        <>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} style={{ ...btn(true), width: "100%", marginBottom: 11, padding: 13 }}>
            ＋ New membership
          </button>
          {open ? (
            <div style={card}>
              <div style={{ ...eyebrow, marginTop: 0 }}>NEW MEMBERSHIP{sellerName ? ` · ${sellerName.toUpperCase()}` : ""}</div>
              <input aria-label="Membership name" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} placeholder="e.g. 10 classes" style={input} />
              <div style={eyebrow}>WHAT IT IS WORTH</div>
              <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
                {([["classes", "Classes"], ["hours", "Hours"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setF((x) => ({ ...x, unit: k }))} aria-pressed={f.unit === k} style={{ flex: 1, padding: 9, borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", border: "none", background: f.unit === k ? INK : "var(--el)", color: f.unit === k ? LILAC : SUB }}>
                    {l}
                  </button>
                ))}
              </div>
              <input aria-label={f.unit === "hours" ? "How many hours" : "How many classes"} inputMode="decimal" value={f.units} onChange={(e) => setF((x) => ({ ...x, units: e.target.value }))} placeholder={f.unit === "hours" ? "How many hours" : "How many classes"} style={input} />
              <div style={eyebrow}>PRICE</div>
              <input aria-label="Price" inputMode="numeric" value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} placeholder="₹ — 0 for a free one" style={input} />
              <div style={eyebrow}>HOW MANY MAY BE SOLD</div>
              <input aria-label="Total memberships" inputMode="numeric" value={f.total} onChange={(e) => setF((x) => ({ ...x, total: e.target.value }))} placeholder="e.g. 20" style={input} />
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button type="button" onClick={() => setOpen(false)} style={btn(false)}>
                  Cancel
                </button>
                <button type="button" disabled={pending} onClick={save} style={{ ...btn(true), flex: 1.4 }}>
                  {pending ? "Saving…" : "Put it on sale"}
                </button>
              </div>
            </div>
          ) : null}

          {selling.map((m) => (
            <Link key={m.id} href={`/memberships/${m.id}`} aria-label={`Open ${m.name}`} style={{ ...card, display: "block", textDecoration: "none", color: INK }} data-testid="selling-membership">
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 900 }}>
                    {m.name}
                    {m.status === "draft" ? <span style={{ marginLeft: 7, fontSize: 8.5, fontWeight: 900, padding: "2px 7px", borderRadius: 999, background: "var(--el)", color: SUB }}>DRAFT</span> : null}
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 2 }}>
                    {unitWord(m.unit, m.units)} · {m.priceInr === 0 ? "Free" : rupees(m.priceInr)}
                  </span>
                </span>
                <span style={{ flexShrink: 0, textAlign: "right" }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 900 }} data-testid="membership-sold">
                    {m.sold}
                    <span style={{ fontSize: 10, color: SUB, fontWeight: 700 }}>/{m.totalCount}</span>
                  </span>
                  <span style={{ display: "block", fontSize: 9, color: SUB }}>sold</span>
                </span>
              </div>
              {/* how much of what was SOLD has actually been danced — the seller's own bar */}
              {m.unitsSold > 0 ? <ProgressBar used={m.unitsUsed} total={m.unitsSold} tint="#8B5CF6" testId="selling-progress" /> : null}
              <div style={{ fontSize: 10.5, color: SUB, marginTop: 7 }}>
                {rupees(m.revenueInr)} taken · {m.active} active ›
              </div>
            </Link>
          ))}
          {selling.length === 0 && !open ? (
            <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)", lineHeight: 1.5 }}>
              Nothing on sale yet. A membership is four things — a name, how many classes or hours, a price, and how many you will sell.
            </div>
          ) : null}
        </>
      )}

      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "#241B33", color: "#fff", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 40 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
