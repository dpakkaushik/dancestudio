"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimPersonAction, setClaimPowersAction, withdrawClaimAction } from "@/features/claims/server-actions/claims";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import type { ClassClaim } from "@/types/claim";

/** THE CLASS TEAM, EDITED ON THE CLASS PAGE (18 Sep 2026). Assistants left the
 *  class form — the user: "Assistants should be removed from form and should be
 *  able to add from the manage inside the class section which should send
 *  request to the person" — and "both teacher and studio can add assistants".
 *  So the dashed "Add someone" row is a real control here: the app's one people
 *  search, anyone on DanceOS, and the person is ASKED (their Inbox says so). The
 *  jobs an assistant holds — attendance, refunds — stay the OWNER's to hand out
 *  (set_class_person_powers refuses anybody else), and a teacher may take back
 *  an assistant they asked for. The RPCs decide all of it; these only ask. */

const pill = (on: boolean, col: string): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 800,
  padding: "5px 10px",
  borderRadius: 999,
  cursor: "pointer",
  border: `1px solid ${on ? col : "var(--el)"}`,
  background: on ? `${col}22` : "var(--card)",
  color: on ? col : "var(--sub)",
  fontFamily: "inherit",
});

export function AddAssistant({ classId, col, exclude }: { classId: string; col: string; exclude: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div style={{ padding: "9px 0 3px" }}>
      <button
        type="button"
        aria-label="Add someone to the team"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", color: col, fontFamily: "inherit", textAlign: "left" }}
      >
        <span style={{ width: 34, height: 34, borderRadius: 11, border: "1.5px dashed var(--el)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5.5v13M5.5 12h13" />
          </svg>
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800 }}>Add someone to the team</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)" }}>{open ? "Close" : "Search ›"}</span>
      </button>
      {open ? (
        <div style={{ marginTop: 8 }}>
          <PeoplePicker
            title="SEARCH DANCEOS, THEN ASK THEM"
            ariaLabel="Search DanceOS for an assistant"
            actionWord="Ask ›"
            actionColor={col}
            exclude={exclude}
            pickLabel={(p) => `Ask ${p.fullName} to assist on this class`}
            onPick={(p) =>
              start(async () => {
                setErr(null);
                const res = await claimPersonAction({ classId, userId: p.id, kind: "assistant" });
                if (res.error) setErr(res.error);
                else {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          />
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.45 }}>
            {pending ? "Asking…" : "They are asked, and answer in their Inbox. Nobody is added by this."}
          </div>
          {err ? <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 6 }}>{err}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/** the owner's controls on one assistant: the two jobs, and Remove; a teacher
 *  who asked them gets Remove alone */
export function AssistantControls({ claim, isOwner, col }: { claim: ClassClaim; isOwner: boolean; col: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res.error) setErr(res.error);
      else router.refresh();
    });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {isOwner && claim.status === "confirmed"
        ? (
            [
              ["canAttendance", "Attendance"],
              ["canRefunds", "Refunds"],
            ] as Array<["canAttendance" | "canRefunds", string]>
          ).map(([job, word]) => {
            const has = claim[job];
            return (
              <button
                key={job}
                type="button"
                disabled={pending}
                aria-pressed={has}
                aria-label={`${claim.personName} holds ${word}`}
                onClick={() =>
                  run(() =>
                    setClaimPowersAction({
                      claimId: claim.id,
                      canAttendance: job === "canAttendance" ? !claim.canAttendance : claim.canAttendance,
                      canRefunds: job === "canRefunds" ? !claim.canRefunds : claim.canRefunds,
                    })
                  )
                }
                style={pill(has, col)}
              >
                {word}
                {has ? " ✓" : ""}
              </button>
            );
          })
        : null}
      <button type="button" disabled={pending} aria-label={`Remove ${claim.personName} from this class`} onClick={() => run(() => withdrawClaimAction({ claimId: claim.id }))} style={{ ...pill(false, col), color: "#F87171" }}>
        Remove
      </button>
      {err ? <span role="alert" style={{ fontSize: 10.5, color: "#F87171", flexBasis: "100%", textAlign: "right" }}>{err}</span> : null}
    </div>
  );
}
