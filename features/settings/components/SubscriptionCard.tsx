"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { cancelSubscriptionAction } from "@/features/payments/server-actions/subscriptions";
import { SUB } from "@/lib/design/tokens";
import { priceWords } from "@/repositories/plans";
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
}: {
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

  /* the button's words when there is nothing left to stop */
  const notRenewing = !s || !live ? null : s.granted ? "Granted — nothing renews" : s.cancelAtPeriodEnd || s.status === "canceled" ? `Cancelled — ends ${until ?? ""}`.trim() : null;

  return (
    <ToolCard testId={testId} edge={standing.tone}>
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
                { label: "Price", value: s.granted ? "₹0 · granted" : priceWords(s.priceInr, s.period) },
                { label: "Billing", value: s.period === "yearly" ? "Yearly" : "Monthly" },
                { label: "Started", value: s.currentPeriodStart ? dateWords(s.currentPeriodStart) : "—" },
              ]}
            />
            <ToolFacts
              tint={tint}
              style={{ marginTop: 6 }}
              items={[
                { label: "Paid through", value: until ?? "—", testId: "plan-until" },
                { label: "Next charge", value: s.renews ? (s.nextChargeOn ? dateWords(s.nextChargeOn) : until ?? "—") : "None" },
                { label: "Attempt", value: s.attempt > 0 ? s.attempt : "—" },
              ]}
            />
            <div style={{ marginTop: 10, display: "grid", gap: 4, fontSize: 11.5 }}>
              <Detail label="Paid by">{s.granted ? "Granted by DanceOS — nothing is charged" : "UPI AutoPay or card mandate through Cashfree"}</Detail>
              {s.cfSubscriptionId || s.providerSubscriptionId ? <Detail label="Reference">{s.cfSubscriptionId ?? s.providerSubscriptionId}</Detail> : null}
              {s.failureReason ? <Detail label="Last failure">{s.failureReason}</Detail> : null}
            </div>
          </>
        ) : null}
        <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5, marginTop: s ? 10 : 0 }}>{standing.line}</div>
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
            aria-label={s.renews ? `Cancel ${name}'s subscription` : notRenewing ?? "Nothing to cancel"}
            style={{ ...toolBtn("danger", tint), opacity: s.renews ? 1 : 0.55, cursor: s.renews ? "pointer" : "default" }}
          >
            {s.renews ? "Cancel subscription" : notRenewing}
          </button>
        ) : null}
      </ToolActions>

      {asking && s ? (
        <ConfirmDialog
          title="Cancel this subscription?"
          body={`It stays on until ${until ?? "the end of this period"} — that is paid for. Nothing more is charged after it.`}
          keepWord="Keep it"
          goWord={pending ? "Cancelling…" : "Cancel subscription"}
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

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <span style={{ width: 82, flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", color: "var(--muted)" }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{children}</span>
    </div>
  );
}
