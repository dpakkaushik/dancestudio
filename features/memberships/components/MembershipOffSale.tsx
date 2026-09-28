"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMembershipAction } from "@/features/memberships/server-actions/memberships";
import { SUB } from "@/lib/design/tokens";

/** TAKE IT OFF SALE (28 Sep 2026, the user: "option to take membership of
 *  sale").
 *
 *  ⚠ THE WHOLE DOOR ALREADY EXISTED AND NOTHING OPENED IT. `delete_membership`
 *  has been on the database since 19 Sep, `deleteMembership` in the repository
 *  and `deleteMembershipAction` as a server action — and no screen offered any
 *  of them, so a membership, once created, was on its seller's public page for
 *  ever. The dead-code sweep earlier today found the action unused and KEPT it
 *  deliberately for exactly this reason: an export nothing calls is sometimes a
 *  feature nobody can reach.
 *
 *  ⚠⚠ AND "OFF SALE" IS WHAT THE RPC ALREADY DOES, WHICH IS WHY THE WORDS HERE
 *  ARE NOT "DELETE". Its own comment: *"taking it off sale is not taking it
 *  back: every pass already bought keeps its units and keeps working."* So the
 *  sentence under the button is a promise the database keeps, not reassurance —
 *  and the confirm says it, because a seller with live holders deserves to know
 *  before pressing rather than after.
 *
 *  ⚠ It is on the membership's OWN page rather than on its row in the list: the
 *  row is a full-card `<Link>`, and a button inside an anchor is interactive
 *  inside interactive — the same thing C49 refused on the studio Team desk. */
export function MembershipOffSale({ membershipId, name, active }: { membershipId: string; name: string; active: number }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const out = await deleteMembershipAction({ membershipId });
    if (out.error) {
      setBusy(false);
      setErr(out.error);
      return;
    }
    /* back to the desk it was opened from — the membership is not there any
       more, so staying on its page would be a screen about a thing off sale */
    router.replace("/memberships");
    router.refresh();
  };

  if (!ask) {
    return (
      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() => setAsk(true)}
          aria-label={`Take ${name} off sale`}
          style={{ width: "100%", padding: "11px 12px", borderRadius: 12, background: "transparent", border: "1.5px solid var(--el)", color: "#F87171", fontSize: 12.5, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
        >
          Take it off sale
        </button>
        <div style={{ fontSize: 10.5, color: SUB, lineHeight: 1.5, margin: "6px 2px 0" }}>
          It stops being offered on your page. Every pass already bought keeps its units and keeps working.
        </div>
      </div>
    );
  }

  return (
    <div role="group" aria-label="Take it off sale?" style={{ marginTop: 14, background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px" }}>
      <div style={{ fontSize: 12.5, fontWeight: 900 }}>Take {name} off sale?</div>
      <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, margin: "4px 0 10px" }}>
        {active > 0
          ? `${active} ${active === 1 ? "person holds" : "people hold"} one. Theirs keep working — this only stops new ones being bought.`
          : "Nobody holds one. It simply stops being offered."}
      </div>
      {err ? (
        <div role="alert" style={{ fontSize: 11, color: "#F87171", fontWeight: 700, marginBottom: 8 }}>
          {err}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => setAsk(false)}
          disabled={busy}
          style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "var(--el)", border: "none", color: "var(--text)", fontSize: 12, fontWeight: 900, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={go}
          disabled={busy}
          aria-label={`Confirm — take ${name} off sale`}
          style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: "#F87171", border: "none", color: "#fff", fontSize: 12, fontWeight: 900, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}
        >
          {busy ? "Taking it off…" : "Take it off sale"}
        </button>
      </div>
    </div>
  );
}
