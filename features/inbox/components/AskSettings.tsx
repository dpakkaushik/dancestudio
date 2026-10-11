"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { setInboxOffAction, setRoomRequestsAction } from "@/features/inbox/server-actions/askSettings";
import { Switch } from "@/features/profiles/components/ContactEditor";
import { fieldLabel } from "@/features/profiles/components/profile-kit";
import { MUTED, SUB } from "@/lib/design/tokens";
import type { AskKind } from "@/repositories/askSettings";

/** ⚠ REQUEST AND INVITE SETTINGS (3 Oct 2026, the user: "request and invite
 *  settings for inbox"), and their own answer when asked what they control:
 *  WHICH KINDS YOU ACCEPT, refused in the database. A disclosure on the column it
 *  governs — the same treatment Enquiry settings got on 27 Sep — closed it is one
 *  line saying the state, which is all a desk needs when nothing is changing.
 *
 *  ⚠ A CREW'S PRACTICE ASKS ARE NOT HERE, deliberately: a practice asks every
 *  confirmed member at once and its register is built from who was asked, so
 *  refusing them would quietly take somebody off their own crew's register. */

function Shell({ title, summary, testId, children, startOpen = false }: { title: string; summary: string; testId: string; children: ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    /* it stands in the Inbox's TOP squircle since 3 Oct 2026, under the columns,
       so the gap is above it rather than below */
    <div data-testid={testId} style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "12px 14px", marginTop: 12 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={title}
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "var(--text)", textAlign: "left" }}
      >
        {/* ⚠ ONE HEADING (3 Oct 2026, the user: "settings for enquiry requests
            and invites should not have the second heading") — the state line
            moved inside the opened panel */}
        <span style={{ ...fieldLabel, margin: 0, flex: 1, minWidth: 0 }}>{title}</span>
        <span aria-hidden="true" style={{ fontSize: 15, color: MUTED, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
          ›
        </span>
      </button>
      {open ? (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: SUB, marginTop: 8 }}>{summary}</div>
          {children}
        </>
      ) : null}
    </div>
  );
}

const WORDS: Record<AskKind, { label: string; note: string }> = {
  teach: { label: "Asks to take a class", note: "A studio or an artist naming you as the person teaching" },
  assist: { label: "Asks to assist on a class", note: "Being put on a class as an assistant" },
  team: { label: "Invitations to join a team", note: "A studio or an artist page asking you onto its team" },
  crew: { label: "Invitations to join a crew", note: "A crew leader asking you onto their roster" },
};

/** ⚠ THE CLASSES GEAR'S OWN WORDS (11 Oct 2026, the user: "settings for classes
 *  should be redesigned with better wording and shorter. dont need so many
 *  descriptions"). In the gear's sheet the sheet IS the heading, so `compact`
 *  drops the card, its heading, the note under every switch and the paragraph
 *  at the foot: two switches and one line. */
const SHORT: Record<AskKind, string> = { teach: "Asks to teach", assist: "Asks to assist", team: "Team invites", crew: "Crew invites" };
const OFF_LINE = "Off turns new asks away.";

/** a person's switches for the kinds one column holds */
export function PersonAskSettings({
  section,
  off,
  startOpen = false,
  compact = false,
  only,
}: {
  section: "requests" | "invites";
  off: AskKind[];
  startOpen?: boolean;
  compact?: boolean;
  /** ONE KIND, for a hub's gear (11 Oct 2026): the Studios hub carries "team",
   *  the Crews hub "crew" — the invitations left the Inbox for those two tiles */
  only?: AskKind[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState<AskKind[]>(off);
  const kinds: AskKind[] = only ?? (section === "requests" ? ["teach", "assist"] : ["team", "crew"]);
  const taking = kinds.filter((k) => !now.includes(k)).length;

  const flip = (k: AskKind) => {
    const next = now.includes(k) ? now.filter((x) => x !== k) : [...now, k];
    setNow(next);
    setErr(null);
    start(async () => {
      const out = await setInboxOffAction({ off: next });
      if (out.error) {
        setErr(out.error);
        setNow(now);
        return;
      }
      router.refresh();
    });
  };

  if (compact) {
    return (
      <div data-testid={section === "requests" ? "request-settings" : "invite-settings"} style={{ marginTop: 8 }}>
        {kinds.map((k) => (
          <div key={k} style={{ opacity: pending ? 0.7 : 1 }}>
            <Switch on={!now.includes(k)} label={SHORT[k]} onClick={() => flip(k)} />
          </div>
        ))}
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>{OFF_LINE}</div>
        {err ? (
          <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 6 }}>
            {err}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Shell
      title={section === "requests" ? "Request settings" : "Invite settings"}
      testId={section === "requests" ? "request-settings" : "invite-settings"}
      startOpen={startOpen}
      summary={taking === kinds.length ? "Taking every kind" : taking === 0 ? `Not taking ${section}` : `Taking ${taking} of ${kinds.length} kinds`}
    >
      {kinds.map((k) => (
        <div key={k} style={{ opacity: pending ? 0.7 : 1 }}>
          <Switch on={!now.includes(k)} label={WORDS[k].label} onClick={() => flip(k)} />
          <div style={{ fontSize: 10.5, color: MUTED, margin: "-2px 0 4px" }}>{WORDS[k].note}</div>
        </div>
      ))}
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>
        Switched off, the ask is refused when it is made, and the person asking is told you are not taking it.
      </div>
      {err ? (
        <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 6 }}>
          {err}
        </div>
      ) : null}
    </Shell>
  );
}

/** a studio's one switch: whether artists may ask it for a room */
export function RoomRequestSettings({ businessId, on, owner, startOpen = false, compact = false }: { businessId: string; on: boolean; owner: boolean; startOpen?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(on);

  const flip = () => {
    const next = !now;
    setNow(next);
    setErr(null);
    start(async () => {
      const out = await setRoomRequestsAction({ businessId, on: next });
      if (out.error) {
        setErr(out.error);
        setNow(!next);
        return;
      }
      router.refresh();
    });
  };

  if (compact) {
    return (
      <div data-testid="request-settings" style={{ marginTop: 8 }}>
        {owner ? (
          <div style={{ opacity: pending ? 0.7 : 1 }}>
            <Switch on={now} label="Room requests" onClick={flip} />
          </div>
        ) : (
          <div style={{ fontSize: 12, color: SUB, marginTop: 8 }}>{now ? "Taking room requests" : "Not taking room requests"} · the owner decides</div>
        )}
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>{OFF_LINE}</div>
        {err ? (
          <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 6 }}>
            {err}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Shell title="Request settings" testId="request-settings" startOpen={startOpen} summary={now ? "Taking room requests" : "Not taking room requests"}>
      {owner ? (
        <div style={{ opacity: pending ? 0.7 : 1 }}>
          <Switch on={now} label="Room requests from artists" onClick={flip} />
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 8 }}>Only the owner switches room requests.</div>
      )}
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>
        Switched off, an artist asking for one of your rooms is told the studio is not taking requests. Requests already made are untouched.
      </div>
      {err ? (
        <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 6 }}>
          {err}
        </div>
      ) : null}
    </Shell>
  );
}
