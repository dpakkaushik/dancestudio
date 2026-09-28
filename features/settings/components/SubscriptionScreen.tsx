"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { cancelSubscriptionAction } from "@/features/payments/server-actions/subscriptions";
import { PlanRights } from "@/features/settings/components/PlanRights";
import { activateArtistPlanAction } from "@/features/settings/server-actions/plans";
import { StudioSubscriptionStrip } from "@/features/tenants/components/StudioSubscriptionStrip";
import { priceWords, type PlanCatalogRow } from "@/repositories/plans";
import type { StudioSubscriptionState, Subscription } from "@/repositories/subscriptions";
import { BizPage, BizToast, bizBtn, bizCard, dateWords } from "./settings-kit";

/** S_subscr (16935-16990) — DanceOS Pro · Artist, "one profile, more tools".
 *
 *  Since 10 Sep 2026 this is a real recurring subscription: the price is a row
 *  an admin sets (₹700 a month, the user's number), Subscribe sets up a UPI
 *  AutoPay or card mandate through Cashfree that pays the first period on the
 *  spot and renews on its own, and Cancel means STOP RENEWING — what was paid
 *  for stays until the period ends, which is how every real subscription
 *  behaves and the opposite of the old "End now". A failed renewal is three
 *  days of grace, not a locked door. A plan the admin has priced at ₹0 is
 *  started without a payment and the button says so.
 *
 *  ⚠ THERE IS NO ORGANIZATION BRANCH SINCE 26 Sep 2026: the organization login
 *  is retired, so every reader of this screen is a person. What they OWN —
 *  each studio and each organization, with its own mandate — is listed under
 *  their plan, priced by kind. */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** The one-line truth about a subscription's state, in the words a person uses. */
export function subscriptionWords(s: Subscription): { title: string; tone: string; line: string } {
  const until = s.currentPeriodEnd ? dateWords(s.currentPeriodEnd) : null;
  if (s.status === "pending_auth") return { title: "Not set up yet", tone: "#F59E0B", line: "The mandate was started but not authorised — finish it below." };
  if (!s.hasAccess) return { title: "Ended", tone: "var(--muted)", line: until ? `Ended on ${until}.` : "Ended." };
  if (s.status === "past_due") return { title: "Payment problem", tone: "#EF4444", line: `The renewal did not go through${s.failureReason ? ` (${s.failureReason})` : ""}. Cashfree is retrying; you keep access for three days past ${until}.` };
  if (s.cancelAtPeriodEnd || s.status === "canceled") return { title: "Active · ending", tone: "#F59E0B", line: `Stays on until ${until}, then stops. Nothing more will be charged.` };
  if (s.granted) return { title: "Active · granted", tone: "#22C55E", line: `DanceOS set this up for you until ${until}. It does not renew on its own.` };
  return { title: "Active · renews", tone: "#22C55E", line: `Renews on ${s.nextChargeOn ? dateWords(s.nextChargeOn) : until} at ₹${s.priceInr.toLocaleString("en-IN")} — you will be notified a day before each charge.` };
}

export function SubscriptionScreen({
  subscription,
  catalog,
  studioPrice,
  businesses = [],
}: {
  subscription: Subscription | null;
  /** the artist plans on offer, from the price list */
  catalog: PlanCatalogRow[];
  /** what one studio costs, or null when none is on offer */
  studioPrice: PlanCatalogRow | null;
  /** ⚠ the studios this person OWNS, each with its standing and its control:
   *  this screen holds the app's one Stop renewing, so it must list everything
   *  that renews. `orgPrice` and the organizations went on 29 Sep 2026. */
  businesses?: Array<{ id: string; name: string; kind: "studio"; verified: boolean; state: StudioSubscriptionState | null }>;
}) {
  const router = useRouter();
  const offers = catalog.filter((p) => p.kind === "artist" && p.active);
  const [pickKey, setPickKey] = useState<string>(offers[0]?.key ?? "");
  const pick = offers.find((p) => p.key === pickKey) ?? offers[0] ?? null;
  const [toast, setToast] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  const takeFree = (p: PlanCatalogRow) =>
    start(async () => {
      const out = await activateArtistPlanAction({ plan: p.period });
      if (out.error) return fire(out.error);
      fire("👩‍🏫 Artist tools on — same profile, now with teaching, classes & earnings");
      router.refresh();
    });
  const cancel = (s: Subscription) =>
    start(async () => {
      const out = await cancelSubscriptionAction({ subscriptionId: s.id });
      if (out.error) return fire(out.error);
      setConfirmCancel(false);
      fire(out.until ? `Cancelled — the tools stay on until ${dateWords(out.until)}` : "Cancelled");
      router.refresh();
    });

  const live = subscription && subscription.hasAccess ? subscription : null;
  const studios = businesses.filter((b) => b.kind === "studio");

  return (
    <BizPage title="Subscription" tool="subscription">
      {live ? (
        <>
          {(() => {
            const w = subscriptionWords(live);
            return (
              <div style={{ ...bizCard, borderLeft: `3px solid ${w.tone}` }} data-testid="subscription-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900 }}>DanceOS Pro · Artist</div>
                  </div>
                  <span style={{ fontSize: 9.5, fontWeight: 900, padding: "3px 10px", borderRadius: 999, background: `${w.tone}22`, color: w.tone, whiteSpace: "nowrap" }}>{w.title.toUpperCase()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 12.5 }}>
                  <span style={{ color: "var(--sub)" }}>Plan</span>
                  <b style={{ textTransform: "capitalize" }}>{live.period} · {live.granted ? "granted" : priceWords(live.priceInr, live.period)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 12.5 }}>
                  <span style={{ color: "var(--sub)" }}>Paid through</span>
                  <b style={{ fontFamily: DOS_MONO }} data-testid="plan-until">{live.currentPeriodEnd ? dateWords(live.currentPeriodEnd) : "—"}</b>
                </div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 9, lineHeight: 1.5 }}>{w.line}</div>
              </div>
            );
          })()}

          {live.renews ? (
            confirmCancel ? (
              <div style={{ ...bizCard, borderLeft: "3px solid #F59E0B" }}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>Stop renewing?</div>
                <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 3, lineHeight: 1.5 }}>
                  The tools stay on until {live.currentPeriodEnd ? dateWords(live.currentPeriodEnd) : "the end of this period"} — you have paid for that. Nothing more is charged after it.
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button type="button" disabled={pending} onClick={() => cancel(live)} style={{ ...bizBtn, flex: 1, width: "auto", background: "#EF4444" }}>
                    {pending ? "Cancelling…" : "Yes, stop renewing"}
                  </button>
                  <button type="button" onClick={() => setConfirmCancel(false)} style={{ ...bizBtn, flex: 1, width: "auto", background: "var(--card)", color: "var(--text)", border: "1.5px solid var(--el)" }}>
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmCancel(true)} style={{ display: "block", width: "100%", textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "#F87171", padding: 10, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>
                Cancel subscription — stays on until {live.currentPeriodEnd ? dateWords(live.currentPeriodEnd) : "the period ends"}
              </button>
            )
          ) : live.granted || live.cancelAtPeriodEnd || live.status === "canceled" ? (
            <div style={{ fontSize: 10.5, color: "var(--muted)", textAlign: "center", padding: 10, lineHeight: 1.5 }}>
              This period does not renew. Once it ends you can subscribe again from here.
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div style={{ ...bizCard, borderLeft: "3px solid #EC4899" }}>
            <div style={{ fontSize: 15, fontWeight: 900 }}>DanceOS Pro · Artist</div>
            {offers.length === 0 ? (
              <div style={{ fontSize: 11, color: "#F87171", marginTop: 10 }}>No artist plan is on offer right now.</div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {offers.map((p) => (
                  <button type="button" key={p.key} aria-pressed={pick?.key === p.key} onClick={() => setPickKey(p.key)} style={{ flex: 1, padding: "10px 11px", borderRadius: 14, cursor: "pointer", textAlign: "left", background: pick?.key === p.key ? "var(--el)" : "transparent", border: `1.5px solid ${pick?.key === p.key ? "var(--text)" : "var(--el)"}`, color: "var(--text)", fontFamily: "inherit" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: DOS_MONO, letterSpacing: -0.4 }} data-testid="artist-price">
                      {p.priceInr === 0 ? "Free" : `₹${p.priceInr.toLocaleString("en-IN")}`}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>/{p.period === "monthly" ? "month" : "year"} · renews on its own</div>
                  </button>
                ))}
              </div>
            )}
            {subscription && !subscription.hasAccess && subscription.currentPeriodEnd ? (
              <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 10 }}>Your last plan ended on {dateWords(subscription.currentPeriodEnd)} — the tools are locked until you subscribe again.</div>
            ) : null}
          </div>
          <PlanRights kind="artist" />
          {pick ? (
            pick.priceInr > 0 ? (
              <SubscribeButton planKey={pick.key} label={`Subscribe · ${priceWords(pick.priceInr, pick.period)}`} onDone={fire} style={{ width: "100%", padding: 13, fontSize: 13.5, borderRadius: 999, display: "block" }} />
            ) : (
              <button type="button" disabled={pending} onClick={() => takeFree(pick)} style={bizBtn}>
                {pending ? "Starting…" : "Start — this plan is free right now"}
              </button>
            )
          ) : null}
        </>
      )}

      {/* ⚠ A PERSON'S OWN STUDIOS, UNDER THEIR OWN PLAN (26 Sep 2026, the user:
          "can see verification progress and future subscription for the studio
          from there"). A user or an artist who opened a studio pays for it —
          one mandate per studio — so each of theirs gets the same strip, with
          the same Stop renewing, below the Artist plan that is the account's.
          Drawn only when there is one. */}
      {studios.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "var(--muted)", padding: "0 2px 8px" }}>YOUR STUDIOS</div>
          {/* the price is on each strip's own Subscribe button; what is left
              here is the one case where there IS no button */}
          {studioPrice ? null : (
            <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.55, padding: "0 2px 10px" }}>No studio plan is on offer right now.</div>
          )}
          {studios.map((t) =>
            t.state ? (
              <StudioSubscriptionStrip key={t.id} tenantId={t.id} tenantName={t.name} state={t.state} studioPrice={studioPrice} heading={t.name} />
            ) : null
          )}
        </div>
      ) : null}
      {/* ⚠ THE ORGANIZATIONS BLOCK WENT WITH ORGANIZATIONS (29 Sep 2026). It
          listed each one's ₹5,000 mandate beside the studios' ₹1,200 ones, and
          `org_monthly` is a plan nothing can buy now — the six live org
          subscriptions on production are the sweep's, not this screen's. */}
      <BizToast msg={toast} />
    </BizPage>
  );
}
