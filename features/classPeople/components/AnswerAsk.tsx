"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { respondToClassAskAction } from "@/features/classPeople/server-actions/classPeople";
import { INK, LILAC, SUB } from "@/lib/design/tokens";

const EL = "var(--el)";

const pill = (danger: boolean): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 800,
  padding: "6px 11px",
  borderRadius: 999,
  cursor: "pointer",
  border: "none",
  background: danger ? "rgba(239,68,68,.14)" : EL,
  color: danger ? "#F87171" : INK,
});

/** ANSWER AN ASK WHERE THE CLASS IS (30 Sep 2026).
 *
 *  ⚠⚠ THE DOOR ALREADY EXISTED AND WAS NEVER SIGNPOSTED. The class page has
 *  carried the gold "you've been asked" card with Accept / Reject since Step 11
 *  — and `/my-classes` listed only CONFIRMED classes, so an unanswered ask was
 *  nowhere in the Classes section at all, and both of its empty states told
 *  people to go and say yes *in your Inbox*. That sentence had been untrue for
 *  three weeks. This is the same action, in the section the class belongs to.
 *
 *  ⚠ ONE ACTION, NOT A SECOND RULE: `respond_to_class_ask` refuses anybody but
 *  the person asked, exactly as it does from the Inbox and from the class page.
 *  This is a second DOOR onto one subject, which is the thing this app allows —
 *  never a second decision about who may.
 *
 *  ⚠ Drawn inside `ClassTile`'s actions slot so an ask wears the app's own class
 *  card, which is what the Inbox's Requests desk has done since 27 Sep. */
export function AnswerAsk({
  classPersonId,
  line,
}: {
  classPersonId: string;
  /** what was asked, in words — the card above says which class */
  line: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answer = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    const out = await respondToClassAskAction({ classPersonId, accept });
    setBusy(false);
    if (out.error) setError(out.error);
    else router.refresh();
  };

  return (
    <>
      <span style={{ flexBasis: "100%", fontSize: 10.5, color: SUB, lineHeight: 1.45 }}>{line}</span>
      <button type="button" disabled={busy} onClick={() => answer(false)} style={pill(true)}>
        {busy ? "…" : "Reject"}
      </button>
      <button type="button" disabled={busy} onClick={() => answer(true)} style={{ ...pill(false), background: INK, color: LILAC }}>
        {busy ? "…" : "Accept"}
      </button>
      {error ? (
        <span role="alert" style={{ flexBasis: "100%", fontSize: 10.5, fontWeight: 700, color: "#EF4444" }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
