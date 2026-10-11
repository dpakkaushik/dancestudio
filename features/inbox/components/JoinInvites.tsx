"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Portal } from "@/components/ui/Portal";
import { ToolActions, ToolCard, ToolChip, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { respondToCrewAskAction } from "@/features/crews/server-actions/crews";
import { PersonAskSettings } from "@/features/inbox/components/AskSettings";
import { acceptInviteAction, declineInviteAction } from "@/features/staff/server-actions/staff";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DOS_UI, SUB } from "@/lib/design/tokens";
import type { AskKind } from "@/repositories/askSettings";
import { MEMBER_LABEL, MEMBER_ROLE_WORD } from "@/types/staff";
import type { MemberRole } from "@/repositories/businesses";

/** ⚠⚠ THE INVITATIONS TO JOIN LEFT THE INBOX (11 Oct 2026, the user: "handle
 *  invites to join a team and crew from the crew and studio tabs at home.
 *  remove from inbox do it similar to how we did for classes", and "only
 *  enquiries to be handled from inbox and rest all from their respective home
 *  tile section"). The class asks went to Classes' To do the same day; a team
 *  invitation is answered at the top of the Studios hub's Team column, a crew
 *  ask at the top of the Crews hub's Member column, and the Inbox keeps one
 *  pointer line for each.
 *
 *  The card is the app's own `ToolCard`, and the buttons read what the Inbox's
 *  join card read — **Decline · Join**, with the same accessible names — so one
 *  invitation is answered one way wherever it is drawn. A no cannot be taken
 *  back, so it asks first (the class card's B17 rule). */

const TEAM_TINT = "#0EA5E9";
const CREW_TINT_JOIN = "#DC2626";

export interface TeamInviteRow {
  inviteId: string;
  businessId: string;
  businessName: string;
  memberRole: string;
  code: string;
  createdAt: string;
  photoPath: string | null;
}

export interface CrewInviteRow {
  id: string;
  crewId: string;
  crewName: string;
  crewCity: string;
  leaderName: string;
  crewPhoto: string | null;
}

/* the seat an invite offers, in the app's own word ("Faculty", never "trainer") */
const seatOf = (r: string): { word: string; colour: string } => {
  const k = r as MemberRole;
  return MEMBER_ROLE_WORD[k] ? { word: MEMBER_ROLE_WORD[k], colour: MEMBER_LABEL[k].colour } : { word: r, colour: "#64748B" };
};

const head: React.CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: SUB, textTransform: "uppercase", margin: "4px 2px 9px" };

function InviteCard({
  testId,
  tint,
  name,
  photoPath,
  eyebrow,
  sub,
  seat,
  joinWord,
  declineBody,
  onAnswer,
  stayOn,
}: {
  stayOn: string;
  testId: string;
  tint: string;
  name: string;
  photoPath: string | null;
  eyebrow: string;
  sub: ReactNode;
  seat: { word: string; colour: string };
  joinWord: string;
  declineBody: string;
  onAnswer: (accept: boolean) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const answer = async (accept: boolean) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const out = await onAnswer(accept);
    setBusy(false);
    if (out.error) {
      setErr(out.error);
      return;
    }
    setDeclining(false);
    /* ⚠ STAY ON THIS COLUMN, BY ADDRESS (11 Oct 2026). The hub opens on this
       column only while an invitation waits, so a plain refresh after the last
       one flipped the screen to Manage and the studio just joined was out of
       sight — the To do bug of the same day in a second place. The address
       says which column; a refresh is only needed when it already does. */
    if (`${window.location.pathname}${window.location.search}` === stayOn) router.refresh();
    else router.replace(stayOn, { scroll: false });
  };
  return (
    <ToolCard testId={testId}>
      <ToolHead
        tint={tint}
        name={name}
        photoPath={photoPath}
        eyebrow={eyebrow}
        sub={sub}
        right={<ToolChip word={seat.word.toUpperCase()} fg={seat.colour} bg={`${seat.colour}1e`} />}
      />
      <ToolActions>
        <button type="button" disabled={busy} aria-label={`Decline ${name}`} data-testid={`${testId}-decline`} onClick={() => setDeclining(true)} style={toolBtn("secondary", tint)}>
          Decline
        </button>
        <button type="button" disabled={busy} aria-label={`Join ${name}`} data-testid={`${testId}-join`} onClick={() => void answer(true)} style={toolBtn("primary", tint, { flex: "1.3 1 0" })}>
          {busy && !declining ? "…" : joinWord}
        </button>
      </ToolActions>
      {err && !declining ? (
        <div role="alert" style={{ fontSize: 11.5, color: "#F87171", padding: "0 14px 12px" }}>
          {err}
        </div>
      ) : null}
      {declining ? (
        <ConfirmDialog
          title={`Decline ${name}?`}
          body={declineBody}
          keepWord="Keep it"
          goWord="Decline"
          busy={busy}
          err={err}
          onKeep={() => setDeclining(false)}
          onGo={() => void answer(false)}
        />
      ) : null}
    </ToolCard>
  );
}

/** the team invitations waiting on this person — the top of the Studios hub's
 *  Team column (11 Oct 2026). Not drawn when there are none. */
export function TeamInvites({ invites }: { invites: TeamInviteRow[] }) {
  if (invites.length === 0) return null;
  return (
    <div data-testid="team-invites" style={{ marginBottom: 6 }}>
      <div style={head}>Invitations · {invites.length}</div>
      {invites.map((i) => (
        <InviteCard
          key={i.inviteId}
          testId="team-invite"
          stayOn="/business?show=team"
          tint={TEAM_TINT}
          name={i.businessName}
          photoPath={i.photoPath}
          eyebrow="Invitation · Team"
          sub="wants you on its team"
          seat={seatOf(i.memberRole)}
          joinWord="Join"
          declineBody="They are told you said no. You cannot take it back — they would have to invite you again."
          onAnswer={(accept) => (accept ? acceptInviteAction({ code: i.code }) : declineInviteAction({ code: i.code }))}
        />
      ))}
    </div>
  );
}

/** the crew asks waiting on this person — the top of the Crews hub's Member
 *  column (11 Oct 2026). Not drawn when there are none. */
export function CrewInvites({ asks }: { asks: CrewInviteRow[] }) {
  if (asks.length === 0) return null;
  return (
    <div data-testid="crew-invites" style={{ marginBottom: 6 }}>
      <div style={head}>Invitations · {asks.length}</div>
      {asks.map((a) => (
        <InviteCard
          key={a.id}
          testId="crew-invite"
          stayOn="/crews?show=in"
          tint={CREW_TINT_JOIN}
          name={a.crewName}
          photoPath={a.crewPhoto}
          eyebrow="Invitation · Crew"
          sub={
            <>
              invited by <b style={{ color: "var(--text)" }}>{a.leaderName}</b>
              {a.crewCity ? ` · ${a.crewCity}` : ""}
            </>
          }
          seat={{ word: "Member", colour: CREW_TINT_JOIN }}
          joinWord="Join"
          declineBody="The leader is told you said no. Joining puts you on the crew's public roster, so it is your call."
          onAnswer={(accept) => respondToCrewAskAction({ memberId: a.id, accept })}
        />
      ))}
    </div>
  );
}

const GearIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

function GearSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useCloseOnBack(onClose);
  return (
    <Portal>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 640 }}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          style={{ background: "var(--solid)", color: "var(--text)", borderRadius: "24px 24px 0 0", padding: "14px 16px 28px", width: "100%", maxWidth: 430, boxSizing: "border-box", animation: "dosSheetUp .22s ease-out" }}
        >
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
          <div style={{ fontSize: 16, fontWeight: 900, fontFamily: DOS_UI }}>{title}</div>
          {children}
          <button type="button" onClick={onClose} style={{ marginTop: 14, width: "100%", padding: 12, borderRadius: 999, border: "none", background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Done
          </button>
        </div>
      </div>
    </Portal>
  );
}

/** THE HUB'S GEAR (11 Oct 2026) — the one request switch this tile governs, the
 *  same `profiles.inbox_off` kind the Inbox's invite settings carried: "team" on
 *  the Studios hub, "crew" on the Crews hub. It sits in the hero's top right,
 *  the Classes screen's own gear. */
export function JoinSettingsGear({ testId, kind, off, title }: { testId: string; kind: Extract<AskKind, "team" | "crew">; off: AskKind[]; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={title}
        data-testid={testId}
        onClick={() => setOpen(true)}
        style={{ position: "absolute", right: 12, top: 12, width: 38, height: 38, borderRadius: 19, border: "none", background: "rgba(255,255,255,.22)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0, zIndex: 1 }}
      >
        <GearIcon />
      </button>
      {open ? (
        <GearSheet title={title} onClose={() => setOpen(false)}>
          <PersonAskSettings section="invites" off={off} only={[kind]} compact />
        </GearSheet>
      ) : null}
    </>
  );
}
