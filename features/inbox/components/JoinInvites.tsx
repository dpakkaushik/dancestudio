"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AnsweredButton, AnsweredSheet, GearButton, HeadCorner, RequestSettingsSheet, SETTING_ICONS, SettingRow } from "@/components/ui/RequestSettingsSheet";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { respondToCrewAskAction } from "@/features/crews/server-actions/crews";
import { setInboxOffAction } from "@/features/inbox/server-actions/askSettings";
import { acceptInviteAction, declineInviteAction } from "@/features/staff/server-actions/staff";
import { MUTED, SUB } from "@/lib/design/tokens";
import type { AskKind } from "@/repositories/askSettings";
import { teamSeatOf, type AnsweredInviteRow, type InviteReply } from "@/features/inbox/inviteRows";

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
 *  back, so it asks first (the class card's B17 rule).
 *
 *  ⚠⚠ AND AN ANSWERED ONE DOES NOT VANISH (11 Oct 2026, the user: "after
 *  declining or withdrawing, invite cards vanish — should be handled like
 *  Classes' Answered"). The hub's head carries an Answered button beside the
 *  gear, Classes' own, opening the same card with its reply on it — Joined ·
 *  Declined · Withdrawn · Left. The Team desks carry the same button for the
 *  invitations they SENT. */

const TEAM_TINT = "#0EA5E9";
const CREW_TINT_JOIN = "#DC2626";

export interface TeamInviteRow {
  inviteId: string;
  businessId: string;
  businessName: string;
  /** studio or artist_page — an artist's team reads "Artist" on the card */
  businessType?: string | null;
  memberRole: string;
  code: string;
  createdAt: string;
  photoPath: string | null;
  /** who sent it (`20261019090000`) — null before that migration lands */
  inviterName?: string | null;
}

export interface CrewInviteRow {
  id: string;
  crewId: string;
  crewName: string;
  crewCity: string;
  leaderName: string;
  crewPhoto: string | null;
}

export type { AnsweredInviteRow, InviteReply };

const REPLY: Record<InviteReply, { word: string; colour: string; line: string }> = {
  joined: { word: "Joined", colour: "#22C55E", line: "Said yes" },
  declined: { word: "Declined", colour: "#F87171", line: "Said no" },
  withdrawn: { word: "Withdrawn", colour: "#94A3B8", line: "Taken back before it was answered" },
  left: { word: "Left", colour: "#94A3B8", line: "Joined, and has since left" },
};

const seatOf = teamSeatOf;

/** "Artist" for an artist page's team, "Studio" otherwise */
const teamKindWord = (type: string | null | undefined) => (type === "artist_page" ? "Artist" : "Studio");

const head: React.CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: SUB, textTransform: "uppercase", margin: "4px 2px 9px" };

const dayWords = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(d);
};

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

/** AN ANSWERED INVITATION — the same card, no buttons, the reply on it */
export function AnsweredInviteCard({ row }: { row: AnsweredInviteRow }) {
  const tint = row.kind === "team" ? TEAM_TINT : CREW_TINT_JOIN;
  const r = REPLY[row.reply];
  const when = dayWords(row.at);
  return (
    <ToolCard testId="invite-answered" dim={row.reply !== "joined"}>
      <ToolHead
        tint={tint}
        name={row.name}
        photoPath={row.photoPath}
        eyebrow={`${row.eyebrow} · ${row.seatWord}`}
        sub={row.sub}
        right={<ToolChip word={r.word.toUpperCase()} fg={r.colour} bg={`${r.colour}1e`} testId="invite-reply" />}
      />
      <ToolBody style={{ paddingTop: 9, paddingBottom: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: r.colour }}>
          {r.line}
          {when ? <span style={{ color: MUTED, fontWeight: 700 }}> · {when}</span> : null}
        </div>
      </ToolBody>
    </ToolCard>
  );
}

/** the team invitations waiting on this person — the top of the Studios hub's
 *  Team column (11 Oct 2026). Not drawn when there are none.
 *
 *  ⚠ IT READS AS A TEAM INVITATION (11 Oct 2026, the user: "should be managed
 *  from team member section not studio"): headed INVITED TO A TEAM, an artist's
 *  page said "Artist" rather than "Studio", the face the artist's OWN picture
 *  (`business_face_path`), and who sent it on the line under the name. */
export function TeamInvites({ invites }: { invites: TeamInviteRow[] }) {
  if (invites.length === 0) return null;
  return (
    <div data-testid="team-invites" style={{ marginBottom: 6 }}>
      <div style={head}>Invited to a team · {invites.length}</div>
      {invites.map((i) => (
        <InviteCard
          key={i.inviteId}
          testId="team-invite"
          stayOn="/business?show=team"
          tint={TEAM_TINT}
          name={i.businessName}
          photoPath={i.photoPath}
          eyebrow={`${teamKindWord(i.businessType)} · Team invitation`}
          sub={
            i.inviterName ? (
              <>
                Invited by <b style={{ color: "var(--text)" }}>{i.inviterName}</b>
              </>
            ) : (
              "wants you on its team"
            )
          }
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
      <div style={head}>Invited to a crew · {asks.length}</div>
      {asks.map((a) => (
        <InviteCard
          key={a.id}
          testId="crew-invite"
          stayOn="/crews?show=in"
          tint={CREW_TINT_JOIN}
          name={a.crewName}
          photoPath={a.crewPhoto}
          eyebrow="Crew invitation"
          sub={
            <>
              Invited by <b style={{ color: "var(--text)" }}>{a.leaderName}</b>
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

const JOIN_WORDS: Record<"team" | "crew", { label: string; note: string; tint: string }> = {
  team: { label: "Team invites", note: "A studio or an artist asking you onto its team", tint: TEAM_TINT },
  crew: { label: "Crew invites", note: "A crew leader asking you onto their roster", tint: CREW_TINT_JOIN },
};

/** the one `profiles.inbox_off` kind a hub governs, as the shared settings row */
function JoinSwitch({ kind, off }: { kind: "team" | "crew"; off: AskKind[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState<AskKind[]>(off);
  const flip = () => {
    const next = now.includes(kind) ? now.filter((x) => x !== kind) : [...now, kind];
    const before = now;
    setNow(next);
    setErr(null);
    start(async () => {
      const out = await setInboxOffAction({ off: next });
      if (out.error) {
        setErr(out.error);
        setNow(before);
        return;
      }
      router.refresh();
    });
  };
  const w = JOIN_WORDS[kind];
  return (
    <div data-testid="invite-settings">
      <SettingRow icon={SETTING_ICONS[kind]} tint={w.tint} label={w.label} note={w.note} on={!now.includes(kind)} busy={pending} onClick={flip} />
      {err ? (
        <div role="alert" style={{ fontSize: 11.5, color: "#F87171", marginTop: 6 }}>
          {err}
        </div>
      ) : null}
    </div>
  );
}

/** THE HEAD'S BUTTONS (11 Oct 2026) — Answered beside the gear, in the hero's
 *  top right, exactly where Classes draws its own. The hero must be
 *  `position: relative`. Without `settings` it is the Answered button alone
 *  (the Team desks, which govern no switch). */
export function InviteHeadButtons({
  answered,
  answeredTestId,
  answeredListTestId,
  answeredLabel = "Answered invitations",
  settings,
}: {
  answered: AnsweredInviteRow[];
  answeredTestId: string;
  answeredListTestId: string;
  answeredLabel?: string;
  settings?: { testId: string; kind: Extract<AskKind, "team" | "crew">; off: AskKind[]; title: string } | null;
}) {
  const [showAnswered, setShowAnswered] = useState(false);
  const [gear, setGear] = useState(false);
  return (
    <>
      <HeadCorner>
        <AnsweredButton count={answered.length} label={answeredLabel} testId={answeredTestId} onClick={() => setShowAnswered(true)} />
        {settings ? <GearButton testId={settings.testId} onClick={() => setGear(true)} /> : null}
      </HeadCorner>
      {showAnswered ? (
        <AnsweredSheet count={answered.length} listTestId={answeredListTestId} onClose={() => setShowAnswered(false)}>
          {answered.map((r) => (
            <AnsweredInviteCard key={r.key} row={r} />
          ))}
        </AnsweredSheet>
      ) : null}
      {gear && settings ? (
        <RequestSettingsSheet title={settings.title} onClose={() => setGear(false)}>
          <JoinSwitch kind={settings.kind} off={settings.off} />
        </RequestSettingsSheet>
      ) : null}
    </>
  );
}
