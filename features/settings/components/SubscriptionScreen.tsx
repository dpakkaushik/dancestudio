"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { WelcomeFromUrl } from "@/components/ui/WelcomeBow";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { PlanRights } from "@/features/settings/components/PlanRights";
import { activateArtistPlanAction } from "@/features/settings/server-actions/plans";
import { StudioSubscriptionStrip } from "@/features/businesses/components/StudioSubscriptionStrip";
import { priceWords, type PlanCatalogRow } from "@/repositories/plans";
import type { StudioSubscriptionState, Subscription } from "@/repositories/subscriptions";
import { BizPage, BizToast, dateWords, rupees } from "./settings-kit";
import { SubscriptionCard } from "./SubscriptionCard";
import { FigureHead } from "@/components/ui/FigureHead";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";

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

/** what becoming an artist unlocks, named off the tile table so the bow and
 *  the grid cannot disagree (2 Oct 2026) */
const ARTIST_TOOLS = ["classes", "routines", "students", "earn"] as const;

const head = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: "var(--muted)" } as const;

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
  person,
  subscription,
  catalog,
  studioPrice,
  businesses = [],
}: {
  /** whose Artist plan — its card leads with them */
  person: { id: string; name: string; photoPath: string | null };
  subscription: Subscription | null;
  /** the artist plans on offer, from the price list */
  catalog: PlanCatalogRow[];
  /** what one studio costs, or null when none is on offer */
  studioPrice: PlanCatalogRow | null;
  /** ⚠ the studios this person OWNS, each with its standing and its control:
   *  this screen holds the app's one Stop renewing, so it must list everything
   *  that renews. `orgPrice` and the organizations went on 29 Sep 2026. */
  businesses?: Array<{ id: string; name: string; photoPath?: string | null; kind: "studio"; verified: boolean; state: StudioSubscriptionState | null }>;
}) {
  const router = useRouter();
  const offers = catalog.filter((p) => p.kind === "artist" && p.active);
  const [pickKey, setPickKey] = useState<string>(offers[0]?.key ?? "");
  const pick = offers.find((p) => p.key === pickKey) ?? offers[0] ?? null;
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  /* THE BOW ON BECOMING AN ARTIST (2 Oct 2026, the user: "same should be once
     converted and subscribed for being an artist"). `?welcome=artist` on THIS
     address, set only once the plan is ACTIVE — a paid mandate the server has
     confirmed, or the free path's own success — and the bow below reads it.
     A replace, so back does not re-open it. */
  const welcomeArtist = () => router.replace("/subscription?welcome=artist", { scroll: false });
  const takeFree = (p: PlanCatalogRow) =>
    start(async () => {
      const out = await activateArtistPlanAction({ plan: p.period });
      if (out.error) return fire(out.error);
      fire("👩‍🏫 Artist tools on — same profile, now with teaching, classes & earnings");
      router.refresh();
      welcomeArtist();
    });

  const live = subscription && subscription.hasAccess ? subscription : null;
  const studios = businesses.filter((b) => b.kind === "studio");
  const TINT = DOS_TOOLS.subscription.c;

  /* ⚠ THE MIDDLE SECTION (4 Oct 2026) — counted off the cards below: how many
     subscriptions are live, how many renew on their own, and what they cost a
     month together (a yearly plan counted at a twelfth) */
  const all = [live, ...studios.map((b) => (b.state?.subscription?.hasAccess ? b.state.subscription : null))].filter((x): x is Subscription => Boolean(x));
  const renewing = all.filter((x) => x.renews);
  const monthly = renewing.reduce((n, x) => n + (x.period === "yearly" ? x.priceInr / 12 : x.priceInr), 0);

  return (
    <BizPage
      title="Subscription"
      tool="subscription"
      middle={
        <ToolFacts
          tint={TINT}
          items={[
            { label: all.length === 1 ? "Subscription" : "Subscriptions", value: all.length, testId: "subscriptions-live" },
            { label: "Renewing", value: renewing.length, testId: "subscriptions-renewing" },
            { label: "A month", value: rupees(monthly), testId: "subscriptions-monthly" },
          ]}
        />
      }
    >
      <FigureHead margin="0 2px 8px" title={<span style={head}>ARTIST PLAN</span>} />
      {live ? (
        (() => {
          const w = subscriptionWords(live);
          return (
            <SubscriptionCard
              testId="subscription-card"
              tint={TINT}
              name={person.name}
              photoPath={person.photoPath}
              eyebrow="Artist plan"
              href={`/person/${person.id}`}
              hrefLabel={`${person.name} — your profile`}
              plan="DanceOS Pro · Artist"
              subscription={live}
              standing={{ word: w.title.toUpperCase(), tone: w.tone, line: w.line }}
              cancelledWords={(u) => (u ? `Cancelled — the tools stay on until ${u}` : "Cancelled")}
            />
          );
        })()
      ) : (
        /* NOT AN ARTIST YET (or no longer) — the same card, holding the offer */
        <ToolCard testId="artist-offer" edge="#EC4899">
          <ToolHead
            tint={TINT}
            name={person.name}
            photoPath={person.photoPath}
            eyebrow="Artist plan"
            sub="DanceOS Pro · Artist"
            right={<ToolChip word="NOT ACTIVE" fg="#F59E0B" bg="#F59E0B1f" />}
          />
          <ToolBody>
            {offers.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "#F87171" }}>No artist plan is on offer right now.</div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                {offers.map((p) => (
                  <button type="button" key={p.key} aria-pressed={pick?.key === p.key} onClick={() => setPickKey(p.key)} style={{ flex: 1, padding: "10px 11px", borderRadius: 14, cursor: "pointer", textAlign: "left", background: pick?.key === p.key ? `${TINT}1f` : "transparent", border: `1.5px solid ${pick?.key === p.key ? TINT : "var(--el)"}`, color: "var(--text)", fontFamily: "inherit" }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: DOS_MONO, letterSpacing: -0.4 }} data-testid="artist-price">
                      {p.priceInr === 0 ? "Free" : `₹${p.priceInr.toLocaleString("en-IN")}`}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 2 }}>/{p.period === "monthly" ? "month" : "year"} · renews on its own</div>
                  </button>
                ))}
              </div>
            )}
            {subscription && !subscription.hasAccess && subscription.currentPeriodEnd ? (
              <div style={{ fontSize: 11, color: "#F87171", marginTop: 10 }}>Your last plan ended on {dateWords(subscription.currentPeriodEnd)} — the tools are locked until you subscribe again.</div>
            ) : null}
          </ToolBody>
          {pick ? (
            <ToolActions>
              {pick.priceInr > 0 ? (
                <span style={{ flex: "1 1 0", minWidth: 0, display: "grid" }}>
                  <SubscribeButton planKey={pick.key} label={`Subscribe · ${priceWords(pick.priceInr, pick.period)}`} onDone={fire} onSubscribed={welcomeArtist} style={{ ...toolBtn("primary", TINT), flex: "none", width: "100%" }} />
                </span>
              ) : (
                <button type="button" disabled={pending} onClick={() => takeFree(pick)} style={toolBtn("primary", TINT)}>
                  {pending ? "Starting…" : "Start — this plan is free right now"}
                </button>
              )}
            </ToolActions>
          ) : null}
        </ToolCard>
      )}
      {!live ? <PlanRights kind="artist" /> : null}

      {/* ⚠ A PERSON'S OWN STUDIOS, UNDER THEIR OWN PLAN (26 Sep 2026) — one mandate
          per studio, each its own card with its own Cancel. Drawn only when there
          is one. */}
      {studios.length > 0 ? (
        <div style={{ marginTop: 14 }}>
          <FigureHead margin="0 2px 8px" title={<span style={head}>YOUR STUDIOS</span>} />
          {/* the price is on each card's own Subscribe button; what is left here is
              the one case where there IS no button */}
          {studioPrice ? null : (
            <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.55, padding: "0 2px 10px" }}>No studio plan is on offer right now.</div>
          )}
          {studios.map((t) =>
            t.state ? (
              <StudioSubscriptionStrip key={t.id} businessId={t.id} businessName={t.name} photoPath={t.photoPath ?? null} state={t.state} studioPrice={studioPrice} />
            ) : null
          )}
        </div>
      ) : null}
      <BizToast msg={toast} />
      {/* the bow `welcomeArtist` opens (2 Oct 2026) — the tools the plan unlocks
          as its pills, in their own tile colours */}
      <WelcomeFromUrl
        kind="artist"
        label="You're an artist on DanceOS"
        emoji="👩‍🏫"
        title="You're an artist on DanceOS!"
        subtitle="Same profile — now with the artist tools."
        pills={ARTIST_TOOLS.map((k) => ({ label: DOS_TOOLS[k].name, color: DOS_TOOLS[k].c }))}
        pillsCaption="unlocked on your Home"
        note={
          <>
            ⭐ Teach your own <b style={{ color: "#F5F2FA" }}>Classes</b>, build <b style={{ color: "#F5F2FA" }}>Routines</b>, see your <b style={{ color: "#F5F2FA" }}>Students</b> and what you <b style={{ color: "#F5F2FA" }}>earn</b> — every tile is on Home.
          </>
        }
        secondary={{ label: "Open Home ›", href: "/" }}
      />
    </BizPage>
  );
}
