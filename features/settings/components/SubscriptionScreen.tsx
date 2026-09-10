"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { cancelSubscriptionAction } from "@/features/payments/server-actions/subscriptions";
import { activateArtistPlanAction } from "@/features/settings/server-actions/plans";
import { priceWords, type PlanCatalogRow } from "@/repositories/plans";
import type { Subscription } from "@/repositories/subscriptions";
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
 *  An ORGANIZATION has no artist plan: its subscriptions are per studio and live
 *  on the business hub, so this screen sends it there. */

const FEATURES: Array<[string, string, string]> = [
  ["🏠", "Business home", "earnings, sessions & student metrics at a glance"],
  ["🗓", "Publish classes & events", "create, share, manage attendance and check-in"],
  ["👥", "Students & rosters", "track retention, packs and assistants"],
  ["💰", "Earnings & payouts", "per-session fees, settlements, refunds · 0.9% payments"],
  ["📩", "Gig enquiries", "quotes, advances and bookings in your Inbox"],
];

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
  isOrg,
  studioPrice,
}: {
  subscription: Subscription | null;
  /** the artist plans on offer, from the price list */
  catalog: PlanCatalogRow[];
  isOrg: boolean;
  /** for an organization: what one studio costs, or null when none is on offer */
  studioPrice: PlanCatalogRow | null;
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

  if (isOrg) {
    return (
      <BizPage title="Subscription" sub="DanceOS Pro for organizations — one subscription per studio" grad="linear-gradient(135deg,#0E7490,#22D3EE)">
        <div style={{ ...bizCard, borderLeft: "3px solid #0E7490" }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>Each studio has its own subscription</div>
          <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 4, lineHeight: 1.55 }}>
            {studioPrice ? (
              <>
                <b style={{ color: "var(--text)", fontFamily: DOS_MONO }}>{priceWords(studioPrice.priceInr, studioPrice.period)}</b> per studio, renewing on
                its own until you cancel. Two studios need two subscriptions, each linked to its studio. A studio you have not
                subscribed stays private — nothing in it is lost, it is just not on Discover yet.
              </>
            ) : (
              "No studio plan is on offer right now — message DanceOS from Home."
            )}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 9, lineHeight: 1.5 }}>
            You subscribe each studio from its row on <b>Your business</b>, where it also says exactly where each one stands.
          </div>
        </div>
        <Link href="/business" style={bizBtn}>
          Open Your business ›
        </Link>
        <BizToast msg={toast} />
      </BizPage>
    );
  }

  const live = subscription && subscription.hasAccess ? subscription : null;

  return (
    <BizPage title="Subscription" sub="DanceOS Pro · Artist — one profile, more tools" grad="linear-gradient(135deg,#F59E0B,#EC4899)">
      {live ? (
        <>
          {(() => {
            const w = subscriptionWords(live);
            return (
              <div style={{ ...bizCard, borderLeft: `3px solid ${w.tone}` }} data-testid="subscription-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 900 }}>DanceOS Pro · Artist</div>
                    <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>teaching tools on your own profile · 0.9% payments</div>
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
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
                  Classes and events can be scheduled up to the date you are paid through.
                </div>
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
                  <button type="button" onClick={() => setConfirmCancel(false)} style={{ ...bizBtn, flex: 1, width: "auto", background: "var(--card)", color: "var(--text)", border: "1px solid var(--el)" }}>
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
            <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2 }}>Same profile, same followers, same stats — plus everything you need to teach and get paid.</div>
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
          {pick ? (
            pick.priceInr > 0 ? (
              <SubscribeButton planKey={pick.key} label={`Subscribe · ${priceWords(pick.priceInr, pick.period)}`} onDone={fire} style={{ width: "100%", padding: 13, fontSize: 13.5, borderRadius: 999, display: "block" }} />
            ) : (
              <button type="button" disabled={pending} onClick={() => takeFree(pick)} style={bizBtn}>
                {pending ? "Starting…" : "Start — this plan is free right now"}
              </button>
            )
          ) : null}
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>
            UPI AutoPay or card, set up once through Cashfree. The first month is paid when you authorise; every renewal is
            notified a day before. Cancel any time — you keep what you paid for.
          </div>
        </>
      )}
      <BizToast msg={toast} />
    </BizPage>
  );
}
