"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { cancelSubscriptionAction } from "@/features/payments/server-actions/subscriptions";
import { priceWords } from "@/repositories/plans";
import type { PlanKind } from "@/features/settings/planRights";
import { PlanRightsList } from "./PlanRights";
import type { Subscription } from "@/repositories/subscriptions";
import { dateWords } from "./settings-kit";

/** ONE SUBSCRIPTION, AS A CARD (4 Oct 2026, the user: *"Subscription- new page
 *  design according to others - Subscription card with full details of every
 *  subscription, cancel button for all new design for it"*).
 *
 *  The app's own card anatomy, on the person's Artist plan and on every studio
 *  they own alike: the profile it pays for, big, with its standing as a chip;
 *  then every fact the row holds — price, billing, started, paid through, next
 *  charge, how it is paid and its reference — and the one sentence that says
 *  what happens next; then a Cancel button on EVERY card. ⚠ Cancel is "stop
 *  renewing" (10 Sep 2026): what was paid for stays. A subscription that does not
 *  renew — a grant, or one already ending — still draws the button, disabled,
 *  with the reason as its words, so no card is the one without it.
 *
 *  ⚠ Rule 9 (money): this is the app's Stop renewing, through the same
 *  `cancelSubscriptionAction` both old screens called, behind a centred confirm. */

export interface Standing {
  word: string;
  tone: string;
  line: string;
}

export function SubscriptionCard({
  testId,
  tint,
  name,
  photoPath,
  eyebrow,
  href,
  hrefLabel,
  plan,
  subscription,
  standing,
  subscribe,
  cancelledWords,
  rights,
}: {
  /** what the plan buys, listed inside the card (4 Oct 2026) */
  rights?: PlanKind;
  testId: string;
  tint: string;
  /** whose subscription — the person or the studio */
  name: string;
  photoPath: string | null | undefined;
  eyebrow: string;
  href?: string;
  hrefLabel?: string;
  /** the plan's own name — "DanceOS Pro · Artist", "Studio plan" */
  plan: string;
  subscription: Subscription | null;
  standing: Standing;
  /** the Subscribe control, drawn when there is nothing live to cancel — handed
   *  this card's toast, so what Cashfree answered is said here */
  subscribe?: (say: (m: string) => void) => ReactNode;
  /** the toast after a cancel, given the date it stays on until */
  cancelledWords: (until: string | null) => string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const s = subscription;
  const live = Boolean(s?.hasAccess);
  const until = s?.currentPeriodEnd ? dateWords(s.currentPeriodEnd) : null;

  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };

  const stop = () =>
    start(async () => {
      if (!s) return;
      const out = await cancelSubscriptionAction({ subscriptionId: s.id });
      if (out.error) {
        setErr(out.error);
        return;
      }
      setAsking(false);
      say(cancelledWords(out.until ? dateWords(out.until) : null));
      router.refresh();
    });

  /* ⚠⚠ SHORTER, AND THE DATES APART (4 Oct 2026, the user: "remove line on left
     for subscription card. details and text below written shorter and in better
     font … start and end date written separately. cancel button should only have
     Cancel Subscription"). Two rows of boxes — what it costs, then when it
     started and when it ends — and one plain sentence; the Attempt counter, the
     "paid by" line and the provider reference are gone. */
  const startWords = s?.currentPeriodStart ? dateWords(s.currentPeriodStart) : "—";
  const endWords = s ? (s.renews ? (s.nextChargeOn ? dateWords(s.nextChargeOn) : until ?? "—") : until ?? "—") : "—";

  return (
    <ToolCard testId={testId}>
      <ToolHead
        tint={tint}
        name={name}
        photoPath={photoPath}
        eyebrow={eyebrow}
        href={href}
        hrefLabel={hrefLabel}
        sub={plan}
        right={<ToolChip word={standing.word} fg={standing.tone} bg={`${standing.tone}1f`} testId={`${testId}-state`} />}
      />
      <ToolBody>
        {s ? (
          <>
            <ToolFacts
              tint={tint}
              items={[
                { label: "Price", value: s.granted ? "Free" : priceWords(s.priceInr, s.period) },
                { label: "Billing", value: s.granted ? "Granted" : s.period === "yearly" ? "Yearly" : "Monthly" },
              ]}
            />
            <ToolFacts
              tint={tint}
              style={{ marginTop: 6 }}
              items={[
                { label: "Start date", value: startWords, testId: "plan-start" },
                { label: s.renews ? "Renews on" : "End date", value: endWords, testId: "plan-until" },
              ]}
            />
            {s.failureReason ? <div style={{ fontSize: 12, fontWeight: 700, color: "#F87171", marginTop: 8 }}>Last charge failed: {s.failureReason}</div> : null}
          </>
        ) : null}
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.45, marginTop: s ? 10 : 0 }}>{standing.line}</div>
        {rights ? <PlanRightsList kind={rights} /> : null}
      </ToolBody>
      <ToolActions>
        {!live && subscribe ? <span style={{ flex: "1 1 0", minWidth: 0, display: "grid" }}>{subscribe(say)}</span> : null}
        {s && live ? (
          <button
            type="button"
            data-testid="cancel-subscription"
            disabled={!s.renews}
            onClick={() => {
              setErr(null);
              setAsking(true);
            }}
            /* the chip on the head already says why it cannot (GRANTED, ENDING) */
            title={s.renews ? undefined : "Nothing renews, so there is nothing to cancel"}
            style={{ ...toolBtn("danger", tint), opacity: s.renews ? 1 : 0.55, cursor: s.renews ? "pointer" : "default" }}
          >
            Cancel Subscription
          </button>
        ) : null}
      </ToolActions>

      {asking && s ? (
        <ConfirmDialog
          title="Cancel this subscription?"
          body={`It stays on until ${until ?? "the end of this period"} — that is paid for. Nothing more is charged after it.`}
          keepWord="Keep it"
          goWord={pending ? "Cancelling…" : "Cancel Subscription"}
          busy={pending}
          err={err}
          onKeep={() => setAsking(false)}
          onGo={stop}
        />
      ) : null}

      {toast ? (
        <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, zIndex: 700, maxWidth: 360, textAlign: "center", boxShadow: "0 6px 24px rgba(0,0,0,.45)" }}>
          {toast}
        </div>
      ) : null}
    </ToolCard>
  );
}
