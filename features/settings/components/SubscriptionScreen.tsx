"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { activateArtistPlanAction, endArtistPlanAction } from "@/features/settings/server-actions/plans";
import { PLAN_PRICE, type ArtistPlan, type ArtistPlanKind } from "@/repositories/plans";
import { BizPage, BizToast, bizBtn, bizCard, dateWords, ghostBtn } from "./settings-kit";

/** S_subscr (16935-16990) — DanceOS Pro · Artist, "one profile, more tools".
 *  Active: the plan card with its period, "+1 month · ₹799" / "+1 year ·
 *  ₹7,999", and "End subscription now — tools lock, your profile stays". Locked:
 *  the pitch, the two prices, the five features, and Subscribe. The record is
 *  real (artist_plans); the CHARGE is a Cashfree order when the account is live,
 *  so during the pilot the period is granted at ₹0 and the card says so — a
 *  price shown as paid when nothing was would be a fake receipt. */

const FEATURES: Array<[string, string, string]> = [
  ["🏠", "Business home", "earnings, sessions & student metrics at a glance"],
  ["🗓", "Publish classes & events", "create, share, manage attendance and check-in"],
  ["👥", "Students & rosters", "track retention, packs and assistants"],
  ["💰", "Earnings & payouts", "per-session fees, settlements, refunds · 0.9% payments"],
  ["📩", "Gig enquiries", "quotes, advances and bookings in your Inbox"],
];

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export function SubscriptionScreen({ plan, isStudioOwner }: { plan: ArtistPlan | null; isStudioOwner: boolean }) {
  const router = useRouter();
  const [pick, setPick] = useState<ArtistPlanKind>("monthly");
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  const activate = (k: ArtistPlanKind, said: string) =>
    start(async () => {
      const out = await activateArtistPlanAction({ plan: k });
      if (out.error) return fire(out.error);
      fire(said);
      router.refresh();
    });
  const active = Boolean(plan?.active);

  return (
    <BizPage title="Subscription" sub={isStudioOwner ? "DanceOS Pro for studios" : "DanceOS Pro · Artist — one profile, more tools"} grad="linear-gradient(135deg,#F59E0B,#EC4899)">
      {active && plan ? (
        <>
          {/* the active plan — the end date is the rule: nothing schedules past it (16951-16967) */}
          <div style={{ ...bizCard, borderLeft: "3px solid #F59E0B" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900 }}>DanceOS Pro · Artist</div>
                <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>teaching tools on your own profile · 0.9% payments</div>
              </div>
              <span style={{ fontSize: 9.5, fontWeight: 900, padding: "3px 10px", borderRadius: 999, background: "rgba(245,158,11,.16)", color: "#F59E0B" }}>ACTIVE</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 12.5 }}>
              <span style={{ color: "var(--sub)" }}>Plan</span>
              <b style={{ textTransform: "capitalize" }}>
                {plan.plan} · {PLAN_PRICE[plan.plan].words}
              </b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12.5 }}>
              <span style={{ color: "var(--sub)" }}>Active until</span>
              <b style={{ fontFamily: DOS_MONO }} data-testid="plan-until">{dateWords(plan.until)}</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12.5 }}>
              <span style={{ color: "var(--sub)" }}>Charged</span>
              <b style={{ fontFamily: DOS_MONO }}>{plan.amountInr === 0 ? "₹0 · pilot" : `₹${plan.amountInr.toLocaleString("en-IN")}`}</b>
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 9, lineHeight: 1.5 }}>
              Classes and events can only be scheduled up to this date — extend the subscription to schedule further out.
              {plan.amountInr === 0 ? " During the pilot the period is granted free; the price shown is what the plan will cost once billing starts." : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={pending} onClick={() => activate("monthly", "Extended 1 month")} style={{ ...bizBtn, flex: 1, marginBottom: 8, width: "auto" }}>
              +1 month · ₹799
            </button>
            <button type="button" disabled={pending} onClick={() => activate("yearly", "Extended 1 year")} style={{ ...ghostBtn, flex: 1, marginBottom: 8, width: "auto" }}>
              +1 year · ₹7,999
            </button>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const out = await endArtistPlanAction();
                if (out.error) return fire(out.error);
                fire("Subscription ended — tools lock, your profile stays");
                router.refresh();
              })
            }
            style={{ display: "block", width: "100%", textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#F87171", padding: 10, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}
          >
            End subscription now — tools lock, your profile stays
          </button>
        </>
      ) : (
        <>
          {/* locked — the artist plan pitch on your one profile (16973-16990) */}
          <div style={{ ...bizCard, borderLeft: "3px solid #EC4899" }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>DanceOS Pro · Artist</div>
            <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>Same profile, same followers, same stats — plus everything you need to teach and get paid.</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {(
                [
                  ["monthly", "₹799", "/month"],
                  ["yearly", "₹7,999", "/year · 2 months free"],
                ] as Array<[ArtistPlanKind, string, string]>
              ).map(([k, p, s2]) => (
                <button type="button" key={k} aria-pressed={pick === k} onClick={() => setPick(k)} style={{ flex: 1, padding: "10px 11px", borderRadius: 14, cursor: "pointer", textAlign: "left", background: pick === k ? "var(--el)" : "transparent", border: `1.5px solid ${pick === k ? "var(--text)" : "var(--el)"}`, color: "var(--text)", fontFamily: "inherit" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: DOS_MONO, letterSpacing: -0.4 }}>{p}</div>
                  <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>{s2}</div>
                </button>
              ))}
            </div>
            {plan && !plan.active ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 10 }}>Your last plan ended on {dateWords(plan.until)} — the tools are locked until you renew.</div> : null}
          </div>
          <div style={bizCard}>
            {FEATURES.map(([ic, t, s2], i) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: i === FEATURES.length - 1 ? "none" : "1px solid var(--el)" }}>
                <span style={{ fontSize: 17, flexShrink: 0 }}>{ic}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{t}</div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>{s2}</div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" disabled={pending} onClick={() => activate(pick, "👩‍🏫 Artist tools on — same profile, now with teaching, classes & earnings")} style={bizBtn}>
            {pending ? "Starting…" : `Subscribe · ${PLAN_PRICE[pick].words} — free during the pilot`}
          </button>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>Billing starts when DanceOS leaves the pilot; you will be asked before anything is charged.</div>
        </>
      )}
      <BizToast msg={toast} />
    </BizPage>
  );
}
