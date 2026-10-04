"use client";

import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { SubscribeButton } from "@/features/payments/components/SubscribeButton";
import { SubscriptionCard, type Standing } from "@/features/settings/components/SubscriptionCard";
import { dateWords } from "@/features/settings/components/settings-kit";
import { toolBtn } from "@/components/ui/ToolCard";
import { priceWords, type PlanCatalogRow } from "@/repositories/plans";
import type { StudioSubscriptionState } from "@/repositories/subscriptions";

/** WHAT A STUDIO'S SUBSCRIPTION IS DOING — the standing, the date, and the one
 *  control (15 Sep 2026).
 *
 *  ⚠ IT HAS MOVED TWICE, AND BOTH MOVES WERE THE SAME RISK (Rule 9: money). It
 *  began as a second card under the studio's row on the hub; the hub collapsed to
 *  ONE card per studio (15 Sep), so it moved to the studio's own home rather than
 *  being lost; on 20 Sep it moved to `/subscription`. **There is exactly one Stop
 *  renewing in this app; it must always have a screen.**
 *
 *  ⚠ A CARD SINCE 4 Oct 2026 (the user: "Subscription card with full details of
 *  every subscription, cancel button for all new design for it") — the shared
 *  `SubscriptionCard`, the studio's face and name a door to its page. The words
 *  NOT LIVE / PAYMENT PROBLEM / ENDING / GRANTED / RENEWS and the test id are
 *  kept, so every check that read the strip reads the card.
 *
 *  Drawn for the OWNER only — a trainer neither pays nor cancels. */
export function StudioSubscriptionStrip({
  businessId,
  businessName,
  photoPath,
  state,
  studioPrice,
}: {
  businessId: string;
  businessName: string;
  photoPath?: string | null;
  state: StudioSubscriptionState;
  studioPrice: PlanCatalogRow | null;
  /** kept for callers; the card always names the studio now */
  heading?: string;
}) {
  const s = state.subscription;
  const live = Boolean(s?.hasAccess);
  const until = s?.currentPeriodEnd ? dateWords(s.currentPeriodEnd) : null;

  const standing: Standing = !s || !live
    ? { word: "NOT LIVE", tone: "#F59E0B", line: state.whyNotPublic ?? "Not on Discover yet." }
    : s.status === "past_due"
      ? { word: "PAYMENT PROBLEM", tone: "#EF4444", line: `The renewal did not go through — Cashfree is retrying; you keep Discover for three days past ${until}.` }
      : s.cancelAtPeriodEnd || s.status === "canceled"
        ? { word: "ENDING", tone: "#F59E0B", line: `Stays on Discover until ${until}, then stops. Nothing more will be charged.` }
        : s.granted
          ? { word: "GRANTED", tone: "#22C55E", line: `DanceOS set this up until ${until}. It does not renew on its own.` }
          : { word: "RENEWS", tone: "#22C55E", line: `Renews ${s.nextChargeOn ? dateWords(s.nextChargeOn) : until ?? ""} at ${priceWords(s.priceInr, s.period)} — you are told a day before each charge.` };

  return (
    <SubscriptionCard
      testId="studio-subscription"
      tint={DOS_TOOLS.subscription.c}
      name={businessName}
      photoPath={photoPath}
      eyebrow="Studio"
      href={`/studio/${businessId}`}
      hrefLabel={`${businessName} — open the studio's page`}
      plan="Studio plan"
      subscription={s}
      standing={standing}
      cancelledWords={(u) => (u ? `${businessName} stays on Discover until ${u}, then stops` : "Cancelled")}
      subscribe={
        studioPrice
          ? (say) => (
              <SubscribeButton
                planKey={studioPrice.key}
                businessId={businessId}
                label={`Subscribe · ${priceWords(studioPrice.priceInr, studioPrice.period)}`}
                onDone={say}
                style={{ ...toolBtn("primary", DOS_TOOLS.subscription.c), flex: "none", width: "100%" }}
              />
            )
          : undefined
      }
    />
  );
}
