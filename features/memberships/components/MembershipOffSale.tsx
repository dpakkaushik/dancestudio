"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteMembershipAction } from "@/features/memberships/server-actions/memberships";
import { CENTER_CARD, CENTER_SCRIM } from "@/components/ui/centerModal";
import { Portal } from "@/components/ui/Portal";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { SUB } from "@/lib/design/tokens";

/** DELETE A MEMBERSHIP (28 Sep 2026 as "Take it off sale"; 4 Oct 2026, the user:
 *  *"take it off sale to be on top right as a chip and renamed to delete"*).
 *
 *  ⚠ THE WORD CHANGED AND THE ACT DID NOT. `delete_membership`'s own comment:
 *  *"taking it off sale is not taking it back: every pass already bought keeps its
 *  units and keeps working."* So the chip says Delete, and the confirm still says
 *  what the database promises — a seller with live holders deserves to know that
 *  before pressing rather than after.
 *
 *  ⚠ A CHIP ON THE CARD'S TOP RIGHT, and the question in a centred dialog — the
 *  card's head has no room for a second paragraph, and the confirm is portalled
 *  so no panel can clip it (the 16 Sep stacking lesson). */
export function MembershipOffSale({ membershipId, name, active, backTo = "/memberships" }: { membershipId: string; name: string; active: number; backTo?: string }) {
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
       more, so staying on its page would be a screen about a thing gone.
       ⚠ The dialog closes FIRST, which spends its own history entry on a
       microtask; the replace is a beat behind it, the way the other sheets
       here do it (600 ms), or the replace would land on the dialog's entry and
       leave this page's live underneath it. */
    setAsk(false);
    setTimeout(() => {
      router.replace(backTo);
      router.refresh();
    }, 600);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAsk(true)}
        aria-label={`Delete ${name}`}
        style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 0.7, padding: "4px 9px", borderRadius: 999, background: "#F871711c", color: "#F87171", border: "1.5px solid #F8717155", cursor: "pointer", fontFamily: "inherit", pointerEvents: "auto" }}
      >
        DELETE
      </button>
      {ask ? <Confirm name={name} active={active} busy={busy} err={err} onKeep={() => setAsk(false)} onGo={go} /> : null}
    </>
  );
}

function Confirm({ name, active, busy, err, onKeep, onGo }: { name: string; active: number; busy: boolean; err: string | null; onKeep: () => void; onGo: () => void }) {
  useCloseOnBack(onKeep);
  return (
    <Portal>
      <div onClick={onKeep} style={CENTER_SCRIM}>
        <div role="alertdialog" aria-modal="true" aria-label={`Delete ${name}?`} onClick={(e) => e.stopPropagation()} style={{ ...CENTER_CARD, padding: "18px 16px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>Delete {name}?</div>
          <div style={{ fontSize: 11.5, color: SUB, lineHeight: 1.5, margin: "6px 0 14px" }}>
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
              onClick={onKeep}
              disabled={busy}
              autoFocus
              style={{ flex: 1, padding: "11px 12px", borderRadius: 12, background: "var(--el)", border: "none", color: "var(--text)", fontSize: 12.5, fontWeight: 900, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={onGo}
              disabled={busy}
              aria-label={`Confirm — delete ${name}`}
              style={{ flex: 1, padding: "11px 12px", borderRadius: 12, background: "#DC2626", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 900, cursor: busy ? "not-allowed" : "pointer", fontFamily: "inherit" }}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
