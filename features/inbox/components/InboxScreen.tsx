"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { respondToClassAskAction, withdrawClassAskAction } from "@/features/classPeople/server-actions/classPeople";
import { respondToVenueRequestAction } from "@/features/classes/server-actions/classes";
import { respondToCrewAskAction, withdrawCrewAskAction } from "@/features/crews/server-actions/crews";
import { respondToPracticeAction } from "@/features/crews/server-actions/practices";
import { acceptInviteAction, declineInviteAction, revokeInviteAction } from "@/features/staff/server-actions/staff";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { DeskHero } from "@/features/businesses/components/biz-kit";
import { DOS_DISPLAY, DOS_UI, LILAC, SKY } from "@/lib/design/tokens";
import type { DanceClass } from "@/types/class";
import {
  ENQ_STAGES,
  ENQ_STAGE_WORD,
  ENQ_TINT,
  ENQ_TYPES,
  enquiryStage,
  enquiryTypeOf,
  enquiryValueInr,
  liveQuoteOf,
  type Enquiry,
  type EnquiryStatus,
  type EnquiryTypeKey,
} from "@/types/enquiry";
import { DOS_MONO, EnqIcon, agoWords, dateWords, initialsOf, moneyShort, pressKey } from "./inbox-kit";

/** The Inbox, lifted from prototype S_chats (5617-6098) after internal chat was
 *  removed from the product: "what remains is the work — something somebody has
 *  asked of you, and something somebody wants to book. The badge counts only
 *  what waits on YOU." THREE desks (27 Sep 2026) — **Requests** (what somebody
 *  wants you FOR: a class, a room, a duet), **Invites** (what somebody wants
 *  you to BELONG to: a team, a crew, an organization) and **Enquiries**
 *  (somebody wanting to book you).
 *
 *  Requests and Invites are rows that already exist: class classPeople (Step 11),
 *  team invites (Step 12b), crew and duet asks (Step 22), room asks (18 Sep),
 *  organization asks (push 2). Each has two sides: RECEIVED is somebody asking
 *  YOU; SENT is what you or your business asked of other people and are still
 *  waiting on. Enquiries are Step 18's own rows. Left out, tracked in the backlog: studio
 *  rental requests (S_rentals), the Remind button (needs notifications, Step
 *  24), and the inline quote controls on the list card — the prototype's own
 *  detail page supersedes them ("A QUOTE IS A CONVERSATION, NOT A FIELD"). */

export interface RequestItem {
  /** Step 22 added crew asks and duet-partner asks to the two Step 18 kinds;
   *  18 Sep 2026 added the VENUE ask — an artist asking a studio for a room;
   *  push 2 (19 Sep 2026) the ORGANIZATION TEAM ask — a label on its public page */
  /** ⚠ and 27 Sep 2026 the PRACTICE ask — a crew's rehearsal, which is about ONE
   *  OCCASION and so falls in the Accept · Reject group rather than the
   *  invitations one; `JOIN_KINDS` leaves it out by omission */
  /** ⚠ `partner` (a duet entry) and `orgteam` (an organization's label) went on
   *  29 Sep 2026 with events and organizations */
  kind: "classPerson" | "invite" | "crew" | "venue" | "practice";
  id: string;
  dir: "in" | "out";
  /** in: who is asking; out: who is being asked */
  who: string;
  /** DOS_LINK_WHAT (1805): the role in words */
  what: string;
  /** DOS_LINK_WHAT verb: "list you as the artist on" */
  verb: string;
  subjectKind: "CLASS" | "STUDIO" | "CREW" | "PRACTICE";
  subjectTitle: string;
  when: string | null;
  href: string | null;
  at: string;
  note: string | null;
  classPersonId?: string;
  inviteCode?: string;
  inviteId?: string;
  businessId?: string;
  /** crew asks (crew_members.id) and duet-partner asks (event_bookings.id) */
  memberId?: string;
  crewId?: string;
  bookingId?: string;
  /** a venue ask is keyed on the CLASS that wants the room */
  classId?: string;
  /** a practice ask is keyed on the practice (27 Sep 2026) */
  practiceId?: string;
  /** THE ASK'S OWN STATE (19 Sep 2026, the user: "enquiries and requests don't
   *  get removed after accepting"): an answered ask stays on the desk with its
   *  answer on it; only an `asked` row carries the buttons. Absent = asked. */
  status?: "asked" | "confirmed" | "rejected";
  /** ⚠ THE THING ITSELF, SO THE DESK CAN DRAW ITS OWN CARD (27 Sep 2026, the
   *  user: *"event and class request cards should also look like class and
   *  event cards on discover with accept and reject buttons"*). A class ask and
   *  a room ask carry the CLASS — the same object Discover draws, through the
   *  same component — so an ask about a class cannot end up describing it
   *  differently from the shelf it came off. Absent only when the row could not
   *  be read, and then the card falls back to the plain row.
   *  ⚠ `event` was its twin, for a duet ask, and went on 29 Sep 2026. */
  danceClass?: DanceClass | null;
}

/* ⚠ A `Record` KEYED ON THE UNION, which is the point: adding `practice` to
   `RequestItem["kind"]` made this line fail to COMPILE until the word was
   written, so a kind the desk cannot name cannot ship. That is the `GLYPH`
   lesson of the same morning working the right way round. */
const KIND_WORD: Record<RequestItem["kind"], string> = { classPerson: "class", invite: "team", crew: "crew", venue: "room", practice: "practice" };

/** ⚠⚠ TWO KINDS OF THING WERE WEARING ONE CARD (27 Sep 2026, the user:
 *  *"class and event requests should have same cards with accept and reject
 *  buttons"* and *"other team join, crew join, studio join, organization join
 *  for invites should also be different in style and should be card style but
 *  segregated in a different section now"*).
 *
 *  All six kinds drew the same violet row with the same Confirm/Reject pair, and
 *  they are not the same question:
 *
 *  · **AN ASK is about ONE OCCASION** — a class you are being put on, a room
 *    somebody wants for one afternoon, a duet for one battle. Answering yes
 *    commits you to that thing and nothing else, and saying no costs nothing.
 *  · **A JOIN is about BELONGING** — a studio's team, a crew's roster, an
 *    organization's page. Answering yes puts your name somewhere for as long as
 *    the seat lasts, and it is the answer this app has always taken most care
 *    over ("nobody is put on a roster without saying yes", 1792).
 *
 *  So they are two sections with two cards now: an ask keeps the violet row with
 *  its meta table and reads **Accept · Reject**; a join is a WIDER, quieter card
 *  in the ENTITY'S OWN colour, leading with what you would be joining rather
 *  than with who is asking, and reads **Join · Decline** — because "confirm" is
 *  not what a person does with an invitation. */
/* ⚠ `orgteam` was the third and went with organizations (29 Sep 2026) */
const JOIN_KINDS: ReadonlySet<RequestItem["kind"]> = new Set(["invite", "crew"]);
const isJoin = (r: RequestItem) => JOIN_KINDS.has(r.kind);

const REQ_TINT = "#8B5CF6";
/* a join wears the colour of the thing you would be joining, so the three
   sections of the app it can come from are told apart at a glance */
const JOIN_TINT: Partial<Record<RequestItem["kind"], string>> = { invite: "#0EA5E9", crew: "#DC2626" };

const Row = ({ children, c, testId }: { children: React.ReactNode; c: string; testId?: string }) => (
  <div data-testid={testId} style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderLeft: `4px solid ${c}`, borderRadius: 16, padding: "12px 14px", marginBottom: 10 }}>{children}</div>
);

const pillBtn = (on: boolean): React.CSSProperties => ({
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 15px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: -0.2,
  whiteSpace: "nowrap",
  background: on ? "var(--text)" : "var(--card)",
  color: on ? "var(--solid)" : "var(--sub)",
  border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}`,
  transition: "background .16s",
});

const emptyBox: React.CSSProperties = { background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 16, padding: "22px 16px", textAlign: "center" };

export function InboxScreen({
  accent,
  requestsIn,
  requestsOut,
  enquiriesIn,
  enquiriesOut,
  nowIso,
  desk = "inbox",
  deskSub = null,
  settings = null,
}: {
  /** the profile-tinted wash the rest of the app opens on (5681) */
  accent: string;
  requestsIn: RequestItem[];
  requestsOut: RequestItem[];
  enquiriesIn: Enquiry[];
  enquiriesOut: Enquiry[];
  nowIso: string;
  /** ⚠⚠ WHICH DESK THIS IS (27 Sep 2026, the user: *"only enquiry becomes a new
   *  option in tab and is removed from inbox"*).
   *
   *  Enquiries were the Inbox's third section. They are a TAB of their own now,
   *  and the Inbox keeps what somebody has asked OF you. The two screens share
   *  this component rather than forking it — the cards, the sides, the Done
   *  treatment and the answer paths are identical, and a second copy is the bill
   *  this repo has paid three times (`linkChip` twice, the figure row three
   *  times, three identity bands). What differs is which pills are drawn. */
  desk?: "inbox" | "enquiries";
  /** ⚠ WHOSE DESK THIS IS, when a tool tile named one (27 Sep 2026). The
   *  Enquiries tile on a studio's, an organization's or a crew's grid carries
   *  `?as=`, and the heading has to say which — a list narrowed to one subject
   *  with nothing on screen naming it reads as a list that lost rows. Null is
   *  the account's whole desk, which needs no sub-line. */
  deskSub?: string | null;
  /** ⚠ WHAT YOU TAKE, SET FROM HERE (27 Sep 2026, the user: *"with its setting
   *  as well manged from there"*) — a slot rather than a component, because the
   *  Inbox desk has no settings and this file should not learn what an
   *  `enquiry_types` column is to draw one. */
  settings?: ReactNode;
}) {
  const router = useRouter();
  const [sect, setSect] = useState<"req" | "join" | "enq" | "done">(desk === "enquiries" ? "enq" : "req");
  const [rqSide, setRqSide] = useState<"in" | "out">("in");
  const [enqSide, setEnqSide] = useState<"in" | "out">("in");
  const [enqType, setEnqType] = useState<"all" | EnquiryTypeKey>("all");
  const [enqSt, setEnqSt] = useState<"all" | EnquiryStatus>("all");
  const [brkOpen, setBrkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2300);
  };
  const run = async (op: () => Promise<{ error: string | null }>, doneMsg: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const out = await op();
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    fire(doneMsg);
    router.refresh();
  };

  const newIn = enquiriesIn.filter((e) => enquiryStage(e) === "new");
  /** ⚠⚠ THREE COLUMNS, AND NO "ALL" (27 Sep 2026, the user: *"fix inbox —
   *  different columns for join team requests … remove column with all request
   *  and enquiries together"*).
   *
   *  All was a fourth list that held a flattened copy of the other two, one row
   *  shape for four different objects, and no way to answer anything from it —
   *  you pressed a row to be taken to the desk that could. A desk you cannot
   *  act on is a table of contents, and the three pills above it already are
   *  one. **Requests** is what somebody wants you FOR (a class, a room, a
   *  duet); **Invites** is what somebody wants you to BELONG to; **Enquiries**
   *  is somebody wanting to book you. */
  /** ⚠⚠ AND A FOURTH SECTION FOR WHAT IS OVER (27 Sep 2026, the user:
   *  *"sepreate section request , invites and enquiries which are already
   *  completed"*).
   *
   *  Since 19 Sep an answered ask STAYS on the desk wearing its answer — the
   *  user's own rule then ("enquiries and requests don't get removed after
   *  accepting"), and the right one: a decision you made is a record. What it
   *  cost is that the live desks filled with rows carrying no buttons, so the
   *  three lists stopped being lists of things to DO. Both rules hold if the
   *  answered rows move rather than vanish: **Done** is where they go, and
   *  nothing is deleted. */
  const isDone = (r: RequestItem) => Boolean(r.status && r.status !== "asked");
  const askIn = requestsIn.filter((r) => !isJoin(r) && !isDone(r));
  const askOut = requestsOut.filter((r) => !isJoin(r) && !isDone(r));
  const joinIn = requestsIn.filter((r) => isJoin(r) && !isDone(r));
  const joinOut = requestsOut.filter((r) => isJoin(r) && !isDone(r));
  /* both directions in one list: what is over is over, and "who asked whom" is
     already on every card */
  /* ⚠ each desk's Done holds its OWN kind. An answered class ask is not a
     closed enquiry, and one "Done" list spanning two tabs would be a third
     place to look for either. */
  const onEnq = desk === "enquiries";
  const doneReq = onEnq ? [] : [...requestsIn, ...requestsOut].filter(isDone);
  const doneEnq = onEnq ? [...enquiriesIn, ...enquiriesOut].filter((e) => ["won", "lost"].includes(enquiryStage(e))) : [];
  const doneN = doneReq.length + doneEnq.length;
  const SECT: Array<["req" | "join" | "enq" | "done", string, number, string]> = onEnq
    ? [
        ["enq", "Enquiries", newIn.length, "#EC4899"],
        ["done", "Done", doneN, "#22C55E"],
      ]
    : [
        ["req", "Requests", askIn.length, "#DC2626"],
        ["join", "Invites", joinIn.length, JOIN_TINT.invite ?? SKY],
        /* ⚠ its badge counts what is IN it, not what waits on you — nothing here
           waits on anybody, and a red 0 beside "Done" would say the opposite */
        ["done", "Done", doneN, "#22C55E"],
      ];
  const owed = onEnq ? newIn.length : requestsIn.length;

  /* one answer per kind — the RPC behind each decides who may give it */
  const answer = (r: RequestItem, accept: boolean) =>
    r.kind === "classPerson"
      ? respondToClassAskAction({ classPersonId: r.classPersonId!, accept })
      : r.kind === "invite"
        ? accept
          ? acceptInviteAction({ code: r.inviteCode! })
          : declineInviteAction({ code: r.inviteCode! })
        : r.kind === "crew"
          ? respondToCrewAskAction({ memberId: r.memberId!, accept })
          : r.kind === "venue"
            ? respondToVenueRequestAction({ classId: r.classId!, accept })
            : respondToPracticeAction({ practiceId: r.practiceId!, accept, crewId: r.crewId });
  const withdraw = (r: RequestItem) =>
    r.kind === "classPerson"
      ? withdrawClassAskAction({ classPersonId: r.classPersonId! })
      : r.kind === "invite"
        ? revokeInviteAction({ businessId: r.businessId!, inviteId: r.inviteId! })
        : r.kind === "crew"
          ? withdrawCrewAskAction({ memberId: r.memberId!, crewId: r.crewId })
          : Promise.resolve({ error: "Pick another studio or room from the class's Edit form — that is the withdrawal" });

  /** THE TWO ANSWERS, AS AN ACTION ROW UNDER A CARD (27 Sep 2026) — the same
   *  buttons the row card carries, lifted out so the class card and the event
   *  card can wear them without a third copy. */
  const askActions = (r: RequestItem) => {
    if (r.status && r.status !== "asked") {
      /** ⚠⚠ A STAMP, NOT A SENTENCE WHERE THE BUTTONS WERE (27 Sep 2026, the
       *  user: *"change the way accepted looks like on cards for all these"*).
       *  It was a line of green text sitting in the action row's slot — so an
       *  answered card looked like a card whose buttons had failed to load, and
       *  on the Done desk every row was a paragraph. A filled pill in the
       *  answer's own colour reads as what it is: a decision, already made.
       *  ⚠ The WORDS are unchanged, because they carry who answered — "you said
       *  yes" and "Accepted by {who}" are two different facts and the desk shows
       *  both directions in one list. */
      const yes = r.status === "confirmed";
      return (
        <div style={{ flex: 1, display: "flex", padding: "2px 0" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 900,
              letterSpacing: 0.2,
              background: yes ? "rgba(34,197,94,.15)" : "rgba(248,113,113,.14)",
              color: yes ? "#22C55E" : "#F87171",
              border: `1.5px solid ${yes ? "rgba(34,197,94,.4)" : "rgba(248,113,113,.36)"}`,
            }}
          >
            <span aria-hidden="true">{yes ? "✓" : "✕"}</span>
            {yes ? (r.dir === "in" ? "Accepted — you said yes" : `Accepted by ${r.who}`) : r.dir === "in" ? "Rejected — you said no" : `Rejected by ${r.who}`}
          </span>
        </div>
      );
    }
    if (r.dir === "in") {
      return (
        <>
          <button
            type="button"
            disabled={busy}
            aria-label={`Reject ${r.subjectTitle}`}
            onClick={() => void run(() => answer(r, false), `Rejected · ${r.who} has been told`)}
            style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
          >
            Reject
          </button>
          <button
            type="button"
            disabled={busy}
            aria-label={`Accept ${r.subjectTitle}`}
            onClick={() => void run(() => answer(r, true), `✅ Accepted · you are ${r.what} on ${r.subjectTitle}`)}
            style={{ flex: 1.3, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
          >
            Accept
          </button>
        </>
      );
    }
    return (
      <>
        <div style={{ flex: 1, fontSize: 10.5, color: "#F59E0B", fontWeight: 800, alignSelf: "center" }}>⏳ Waiting on {r.who}</div>
        <button
          type="button"
          disabled={busy}
          aria-label={`Withdraw ${r.subjectTitle}`}
          onClick={() => void run(() => withdraw(r), `Withdrawn — ${r.who} is no longer being asked`)}
          style={{ flexShrink: 0, textAlign: "center", padding: "11px 16px", borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
        >
          Withdraw
        </button>
      </>
    );
  };

  /** THE LINE THAT SAYS WHOSE ASK IT IS, over the card — a card says what the
   *  class or the event IS and cannot say who is asking you to be on it. */
  const askWho = (r: RequestItem) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
      <span style={{ width: 26, height: 26, borderRadius: 9, flexShrink: 0, background: "linear-gradient(135deg,#8B5CF6,#EC4899)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10.5, fontWeight: 900 }}>{initialsOf(r.who)}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--sub)", lineHeight: 1.4 }}>
        {r.dir === "in" ? (
          <>
            <b style={{ color: "var(--text)" }}>{r.who}</b> wants you as <b style={{ color: REQ_TINT }}>{r.what}</b>
          </>
        ) : (
          <>
            you asked <b style={{ color: "var(--text)" }}>{r.who}</b> as <b style={{ color: REQ_TINT }}>{r.what}</b>
          </>
        )}
      </span>
      <span style={{ flexShrink: 0, fontSize: 9.5, color: "var(--muted)" }}>{agoWords(r.at, nowIso)}</span>
    </div>
  );

  /** ⚠⚠ A CLASS ASK IS A CLASS CARD AND AN EVENT ASK IS AN EVENT CARD (27 Sep
   *  2026, the user's own words). They were a violet row of the Inbox's own
   *  invention — a meta table of What / When / Asked by — describing a thing
   *  the app already knows how to draw. So the desk draws `ClassTile` and
   *  `EventCard`, the same two components Discover uses, with Accept and
   *  Reject as their action row. An ask about a class can no longer describe it
   *  differently from the shelf it came off.
   *  ⚠ The plain row survives as the FALLBACK for a card that could not be
   *  read — never as the normal case. */
  const askCard = (r: RequestItem) => {
    if (r.danceClass) {
      return (
        <div key={`${r.kind}-${r.id}`} data-testid="request-row" style={{ marginBottom: 12 }}>
          {askWho(r)}
          <ClassTile danceClass={r.danceClass} href={r.href ?? undefined} roleLabel={r.what.toUpperCase()} actions={askActions(r)} />
          {r.note ? <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "2px 2px 0", lineHeight: 1.45 }}>{r.note}</div> : null}
        </div>
      );
    }
    /* ⚠ the EVENT CARD branch (a duet ask) went on 29 Sep 2026 */
    return requestCard(r);
  };

  const requestCard = (r: RequestItem) => {
    const c = REQ_TINT;
    const meta: Array<[string, string]> = [
      ["What", r.what],
      ...(r.when ? ([["When", r.when]] as Array<[string, string]>) : []),
      ["Asked by", r.dir === "in" ? r.who : "you"],
    ];
    return (
      /* ⚠ ADDRESSABLE AS A ROW (20 Sep 2026). Every answered ask wears the SAME
         sentence ("✅ Confirmed — you said yes"), so with two answered asks on one
         desk that text names neither of them: an assertion on it passes off
         somebody else's row and synchronises nothing. A test that means "THIS ask
         was answered" has to scope to the row, and nothing else here identifies
         one. */
      <Row key={`${r.kind}-${r.id}`} c={c} testId="request-row">
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, padding: "3px 8px", borderRadius: 999, background: `${c}22`, color: c }}>{r.subjectKind}</span>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--muted)", textTransform: "capitalize" }}>{KIND_WORD[r.kind]}</span>
          <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--muted)" }}>{agoWords(r.at, nowIso)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: "linear-gradient(135deg,#8B5CF6,#EC4899)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 900 }}>
            {initialsOf(r.who)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 900 }}>{r.who}</div>
            <div style={{ fontSize: 11, color: "var(--sub)" }}>{r.dir === "in" ? `wants to ${r.verb} ${r.subjectTitle}` : `asked to be ${r.what} on ${r.subjectTitle}`}</div>
          </div>
          {r.href ? (
            <Link href={r.href} aria-label={`View ${r.subjectTitle}`} style={{ fontSize: 10, fontWeight: 800, color: c, textDecoration: "none", flexShrink: 0 }}>
              View ›
            </Link>
          ) : null}
        </div>
        <div style={{ background: "var(--el)", borderRadius: 12, padding: "9px 11px" }}>
          {meta.map(([k2, v]) => (
            <div key={k2} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "3px 0", fontSize: 11.5 }}>
              <span style={{ color: "var(--sub)" }}>{k2}</span>
              <b style={{ textAlign: "right" }}>{v}</b>
            </div>
          ))}
        </div>
        {r.note ? <div style={{ fontSize: 10.5, color: "var(--muted)", margin: "7px 0 0", lineHeight: 1.45 }}>{r.note}</div> : null}

        {/* AN ANSWERED ASK STAYS (19 Sep 2026): its answer on it, no buttons */}
        {r.status && r.status !== "asked" ? (
          <div style={{ marginTop: 10, fontSize: 11, fontWeight: 900, color: r.status === "confirmed" ? "#22C55E" : "#F87171" }}>
            {r.status === "confirmed" ? (r.dir === "in" ? "✅ Confirmed — you said yes" : `✅ Confirmed by ${r.who}`) : r.dir === "in" ? "✕ Declined — you said no" : `✕ Declined by ${r.who}`}
          </div>
        ) : r.dir === "in" ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              disabled={busy}
              aria-label={`Reject ${r.subjectTitle}`}
              onClick={() =>
                void run(
                  () => answer(r, false),
                  `Rejected · ${r.who} has been told`
                )
              }
              style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              Reject
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Accept ${r.subjectTitle}`}
              onClick={() =>
                void run(
                  () => answer(r, true),
                  `✅ Accepted · you are ${r.what} on ${r.subjectTitle}`
                )
              }
              style={{ flex: 1.3, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              Accept
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10.5, color: "#F59E0B", margin: "9px 0 0", fontWeight: 800 }}>
              ⏳ Waiting on {r.who}
              {r.kind === "classPerson" || r.kind === "venue" ? <span style={{ color: "var(--sub)", fontWeight: 700 }}> — this class stays a draft until they {r.kind === "venue" ? "accept" : "confirm"}</span> : null}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
              <button
                type="button"
                disabled={busy}
                aria-label={`Withdraw ${r.subjectTitle}`}
                onClick={() =>
                  void run(
                    () => withdraw(r),
                    `Withdrawn — ${r.who} is no longer being asked`
                  )
                }
                style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
              >
                Withdraw
              </button>
            </div>
          </>
        )}
      </Row>
    );
  };

  /** THE JOIN CARD — an invitation to belong somewhere, not an ask about an
   *  occasion. Deliberately a different shape from the row above: the thing you
   *  would be joining LEADS, in its own colour, at display size; who asked is
   *  the line under it; there is no meta table, because a seat has no "when".
   *  ⚠ Same test id — a request is a request to the harness, and scoping to a
   *  row is what `request-row` is for (20 Sep). */
  const joinCard = (r: RequestItem) => {
    const c = JOIN_TINT[r.kind] ?? REQ_TINT;
    const answered = r.status && r.status !== "asked";
    return (
      <div
        key={`${r.kind}-${r.id}`}
        data-testid="request-row"
        style={{ background: "var(--card)", border: `1.5px solid ${c}55`, borderRadius: 18, padding: "13px 14px", marginBottom: 10, boxShadow: `0 2px 10px ${c}14` }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: `${c}1f`, border: `1.5px solid ${c}66`, color: c, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900 }}>+</span>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.9, color: c, textTransform: "uppercase" }}>Invitation · {r.subjectKind}</span>
          <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--muted)" }}>{agoWords(r.at, nowIso)}</span>
        </div>

        {/* WHAT YOU WOULD BE JOINING, first and biggest */}
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.15, fontFamily: DOS_DISPLAY, overflowWrap: "anywhere" }}>{r.subjectTitle}</div>
        {/* ⚠ THE ROLE IS A CHIP, NOT A CLAUSE. `RequestItem.what` is the app's
            one vocabulary for these labels and two of its five values are not
            grammatical inside a sentence ("on the team", "its event team") —
            writing "join as its event team" to make the others read well would
            be the kind of near-English this file has had to undo before. A chip
            is a label, so every value fits without rewording the source. */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 5 }}>
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.4, padding: "3px 9px", borderRadius: 999, background: `${c}1e`, border: `1.5px solid ${c}55`, color: c, textTransform: "uppercase" }}>{r.what}</span>
          <span style={{ fontSize: 11.5, color: "var(--sub)" }}>
            {r.dir === "in" ? (
              <>
                invited by <b style={{ color: "var(--text)" }}>{r.who}</b>
              </>
            ) : (
              <>
                you invited <b style={{ color: "var(--text)" }}>{r.who}</b>
              </>
            )}
          </span>
        </div>
        {r.note ? <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.45 }}>{r.note}</div> : null}
        {r.href ? (
          <Link href={r.href} aria-label={`View ${r.subjectTitle}`} style={{ display: "inline-block", marginTop: 7, fontSize: 10.5, fontWeight: 800, color: c, textDecoration: "none" }}>
            Have a look first ›
          </Link>
        ) : null}

        {answered ? (
          /* ⚠ THE SAME STAMP THE ASK CARD WEARS (27 Sep 2026, the user: "change
             the way accepted looks like on cards for ALL THESE") — a filled pill
             in the answer's own colour, not a line of green text where the
             buttons used to be. `askActions` carries the whole reason. */
          <div style={{ marginTop: 11, display: "flex" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 900,
                letterSpacing: 0.2,
                background: r.status === "confirmed" ? "rgba(34,197,94,.15)" : "rgba(248,113,113,.14)",
                color: r.status === "confirmed" ? "#22C55E" : "#F87171",
                border: `1.5px solid ${r.status === "confirmed" ? "rgba(34,197,94,.4)" : "rgba(248,113,113,.36)"}`,
              }}
            >
              <span aria-hidden="true">{r.status === "confirmed" ? "✓" : "✕"}</span>
              {r.status === "confirmed" ? (r.dir === "in" ? "Joined — you said yes" : `Joined by ${r.who}`) : r.dir === "in" ? "Declined — you said no" : `Declined by ${r.who}`}
            </span>
          </div>
        ) : r.dir === "in" ? (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              disabled={busy}
              aria-label={`Decline ${r.subjectTitle}`}
              onClick={() => void run(() => answer(r, false), `Declined · ${r.who} has been told`)}
              style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: 999, background: "transparent", color: "var(--sub)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "1.5px solid var(--el)", fontFamily: "inherit" }}
            >
              Decline
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={`Join ${r.subjectTitle}`}
              onClick={() => void run(() => answer(r, true), `✅ Joined ${r.subjectTitle} — ${r.what}`)}
              style={{ flex: 1.3, textAlign: "center", padding: 11, borderRadius: 999, background: c, color: "#fff", fontWeight: 900, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
            >
              Join
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 10.5, color: "#F59E0B", margin: "10px 0 0", fontWeight: 800 }}>⏳ Waiting on {r.who}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
              <button
                type="button"
                disabled={busy}
                aria-label={`Withdraw ${r.subjectTitle}`}
                onClick={() => void run(() => withdraw(r), `Withdrawn — ${r.who} is no longer being asked`)}
                style={{ flex: 1, textAlign: "center", padding: 11, borderRadius: 999, background: "var(--el)", color: "var(--text)", fontWeight: 800, fontSize: 12.5, cursor: "pointer", border: "none", fontFamily: "inherit" }}
              >
                Withdraw
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  /** RECEIVED · SENT, written once for the two columns that have two sides.
   *  ⚠ `rqSide` is deliberately SHARED between Requests and Invites: they are
   *  the same question about two kinds of thing, and a person reading their
   *  sent asks who switches to Invites means the sent ones there too. */
  const sideSwitch = (cur: "in" | "out", set: (s: "in" | "out") => void, nIn: number, nOut: number, noun: string, tint: string) => (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      {(
        [
          ["in", "Received", nIn],
          ["out", "Sent", nOut],
        ] as Array<["in" | "out", string, number]>
      ).map(([k, l, n]) => (
        <div key={k} role="button" tabIndex={0} aria-pressed={cur === k} aria-label={`${l} ${noun}`} onKeyDown={pressKey(() => set(k))} onClick={() => set(k)} style={{ flex: 1, textAlign: "center", padding: "9px 6px", borderRadius: 12, cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: cur === k ? "var(--text)" : "var(--card)", color: cur === k ? "var(--solid)" : "var(--sub)", border: "1.5px solid var(--el)" }}>
          {l}
          {n > 0 ? <span style={{ marginLeft: 5, fontSize: 8.5, fontWeight: 900, padding: "1px 6px", borderRadius: 999, fontFamily: DOS_MONO, background: cur === k ? "var(--solid)" : tint, color: cur === k ? "var(--text)" : "#fff" }}>{n}</span> : null}
        </div>
      ))}
    </div>
  );

  /** ⚠⚠ AN ENQUIRY IS A CARD TOO (27 Sep 2026, the user: *"enquiries cards to
   *  be also made in similar design"*), on the JOIN card's anatomy rather than
   *  the class card's — because there IS no enquiry card elsewhere in the app
   *  to borrow, and an enquiry is the same shape of thing as an invitation: a
   *  proposal, in somebody's own words, that leads with WHAT and says who
   *  underneath.
   *
   *  What it drops from the old row, deliberately: the **meta table of every
   *  field**. An enquiry carries up to five, so the row was a wall of
   *  label/value pairs on a list that is meant to be scanned — and the detail
   *  page one tap away has WHAT THEY ASKED FOR in full, which is where a table
   *  belongs. The card keeps the ONE field that says what this is (the first,
   *  which every type makes its occasion) as the headline, and the rest as a
   *  quiet line.
   *  ⚠ The accessible name is unchanged, so every locator that found the old
   *  row finds this. */
  const enquiryCard = (e: Enquiry) => {
    const stage = enquiryStage(e);
    const tc = ENQ_TINT[e.typeKey];
    const c = stage === "won" || stage === "confirmed" || stage === "advance_paid" ? "#22C55E" : stage === "lost" ? "#F87171" : stage === "quoted" ? "#F59E0B" : "#3B82F6";
    const label = enquiryTypeOf(e.typeKey)?.label ?? e.typeKey;
    const who = enqSide === "out" ? e.businessName : e.fromName;
    const value = enquiryValueInr(e);
    /* the occasion — every type's first field is what the thing IS ("Wedding",
       "Brand shoot", "One-on-one"); a type with none falls back to its label */
    const fields = e.fields.filter(([k]) => k !== "Enquiry");
    const headline = fields[0]?.[1] ?? label;
    const rest = fields.slice(1).map(([k, v]) => `${k}: ${v}`);
    const when = e.dates.length ? `${dateWords(e.dates[0])}${e.dates.length > 1 ? ` +${e.dates.length - 1}` : ""}` : null;
    return (
      <Link
        key={e.id}
        href={`/inbox/enquiries/${e.id}`}
        aria-label={`${label} enquiry ${enqSide === "out" ? "to" : "from"} ${who}`}
        style={{ display: "block", background: "var(--card)", border: `1.5px solid ${tc}55`, borderRadius: 18, padding: "13px 14px", marginBottom: 10, boxShadow: `0 2px 10px ${tc}14`, color: "var(--text)", textDecoration: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: `${tc}1f`, border: `1.5px solid ${tc}66`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <EnqIcon k={e.typeKey} size={15} color={tc} sw={2} />
          </span>
          <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.9, color: tc, textTransform: "uppercase" }}>Enquiry · {label}</span>
          <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--muted)" }}>{agoWords(e.createdAt, nowIso)}</span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.15, fontFamily: DOS_DISPLAY, overflowWrap: "anywhere" }}>{headline}</div>
            <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 4 }}>
              {enqSide === "out" ? "you asked " : "from "}
              <b style={{ color: "var(--text)" }}>{who}</b>
            </div>
          </div>
          {/* WHAT IT IS WORTH AND WHERE IT STANDS — the two figures a desk of
              these is scanned for, set like figures (10683) */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 900, fontFamily: DOS_MONO, color: value ? c : "var(--muted)" }}>{value ? moneyShort(value) : "—"}</div>
            <span style={{ display: "inline-block", marginTop: 3, fontSize: 9, fontWeight: 900, letterSpacing: 0.4, padding: "3px 8px", borderRadius: 999, background: `${c}1e`, border: `1.5px solid ${c}55`, color: c, textTransform: "uppercase" }}>{ENQ_STAGE_WORD[stage]}</span>
          </div>
        </div>

        {when || e.whereText || rest.length ? (
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 7, lineHeight: 1.5 }}>{[when, e.whereText, ...rest].filter(Boolean).join(" · ")}</div>
        ) : null}
        <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 7, lineHeight: 1.45, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>“{e.message}”</div>
        <span style={{ display: "inline-block", marginTop: 8, fontSize: 10.5, fontWeight: 800, color: tc }}>Open the conversation ›</span>
      </Link>
    );
  };

  /* ── enquiries desk ── */
  const side = enqSide === "out" ? enquiriesOut : enquiriesIn;
  const st = (e: Enquiry) => enquiryStage(e);
  const open2 = side.filter((e) => ["new", "in_talks", "quoted"].includes(st(e)));
  const won = side.filter((e) => ["won", "confirmed", "advance_paid"].includes(st(e)));
  const lost = side.filter((e) => st(e) === "lost");
  const sum = (a: Enquiry[]) => a.reduce((x, e) => x + enquiryValueInr(e), 0);
  const byType = ENQ_TYPES.map((t) => ({ k: t.k, label: t.label, rows: side.filter((e) => e.typeKey === t.k) })).filter((x) => x.rows.length);
  const tiles: Array<[string, string, string, string]> =
    enqSide === "out"
      ? [
          [String(open2.length), "Waiting", moneyShort(sum(open2)), "#3B82F6"],
          [String(won.length), "Accepted", moneyShort(sum(won)), "#22C55E"],
          [String(side.filter((e) => liveQuoteOf(e)).length), "Quoted back", `${lost.length} declined`, "#F59E0B"],
        ]
      : [
          [String(open2.length), "Open", moneyShort(sum(open2)), "#3B82F6"],
          [String(won.length), "Won", moneyShort(sum(won)), "#22C55E"],
          [`${Math.round((100 * won.length) / Math.max(1, won.length + lost.length))}%`, "Win rate", `${lost.length} lost`, "#F59E0B"],
        ];
  const filtered = side.filter((e) => enqType === "all" || e.typeKey === enqType).filter((e) => enqSt === "all" || st(e) === enqSt);

  return (
    <div style={{ position: "relative", background: LILAC, color: "var(--text)", maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      {/* ⚠ NO WASH ON THE ENQUIRIES DESK (29 Sep 2026, the user: *"enquiries page
          should not have the pink background on top, should be like other pages
          in home tab"*).
          Enquiries stopped being a tab and became a TOOL on all four grids on
          27 Sep (C70), and every other tool's page — Classes, Events, Rooms,
          Team, Students, Earnings — opens on the page's own ground under its
          `DeskHero`. This screen kept the profile-tinted wash it wore as a tab,
          so the one tool page that had been a tab was the one that did not look
          like a tool page; on an artist's account that tint is `#EC4899`, which
          is the pink.
          ⚠ THE INBOX KEEPS ITS OWN, and that is the same rule rather than an
          exception: `/inbox` IS a tab, the chrome draws the wordmark over it, and
          the wash is what a tab opens on (5681). This is the C83 cut — "the hero's
          ground is the page's own" — applied where the screen changed category. */}
      {!onEnq ? <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 230, pointerEvents: "none", background: `linear-gradient(180deg, ${accent}5c 0%, ${accent}20 44%, transparent 100%)` }} /> : null}
      {/* ⚠⚠ THE HEADING WAS MISSING (27 Sep 2026, the user: "inbox heading is
          missing"). The three-desk re-cut earlier the same day took the title
          out with the paragraph beside it, and `/inbox` is a TAB — so the chrome
          draws the wordmark rather than a drill title and nothing named the
          screen at all. That is **no `<h1>` on the page**, the fourth time this
          repo has found that exact shape (the desks 18 Sep, the studio Team desk
          21 Sep, `EventForm` and `/rooms` 22 Sep), and the one thing a screen
          reader has to move by. Discover's own head is the model: a display
          heading with the count as its sub-line. */}
      {/* ⚠ AND ENQUIRIES IS A TOOL, SO IT IS HEADED LIKE ONE (28 Sep 2026, the
          user: "all tools heading should be done in the same way like classes
          and events, not happening for subscriptions, enquiries"). Enquiries
          stopped being a tab and became a tile on all four grids on 27 Sep
          (C70), and a tile's page wears `DeskHero` — the same object Classes and
          Events wear — so the tile and the screen it opens agree. ⚠ THE INBOX
          KEEPS ITS OWN `<h1>`: it is a TAB, the chrome draws the wordmark over
          it, and a tool hero there would name a tool that is on no grid. */}
      <div style={{ padding: "12px 16px 0", position: "relative" }}>
        {onEnq ? (
          <DeskHero tool="enquiries" as="h1" margin="0 0 2px" />
        ) : (
          <h1 style={{ margin: 0, fontFamily: DOS_DISPLAY, fontSize: 27, fontWeight: 900, letterSpacing: -0.6, lineHeight: 1.08 }}>Inbox</h1>
        )}
        {/* ⚠ WHOSE DESK, when a tool tile named one (27 Sep 2026). A list
            narrowed to one studio with nothing on screen saying so reads as a
            list that has lost rows — the same reason every tool hero names the
            business an organization is standing in. */}
        <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.45, color: "var(--sub)", margin: "4px 0 12px" }}>
          {deskSub ? `${deskSub} · ` : ""}
          {owed > 0 ? `${owed} waiting on you` : "Nothing waiting on you"}
        </div>
      </div>
      <div style={{ display: "flex", gap: 7, overflowX: "auto", scrollbarWidth: "none", padding: "0 16px 12px", position: "relative" }}>
        {SECT.map(([k, l, n, tint]) => {
          const on = sect === k;
          return (
            <div key={k} role="button" tabIndex={0} aria-pressed={on} aria-label={`${l} — ${n} waiting`} onKeyDown={pressKey(() => setSect(k))} onClick={() => setSect(k)} style={pillBtn(on)}>
              {l}
              {n > 0 ? (
                <span style={{ fontSize: 9.5, fontWeight: 900, fontFamily: DOS_MONO, padding: "1px 6px", borderRadius: 999, background: on ? "rgba(0,0,0,.16)" : tint, color: on ? "var(--solid)" : "#fff" }}>{n}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ padding: "0 16px", position: "relative" }}>
        {error ? <div style={{ fontSize: 11.5, color: "#F87171", marginBottom: 10 }}>{error}</div> : null}

        {sect === "req" ? (
          <>
            {sideSwitch(rqSide, setRqSide, askIn.length, askOut.length, "requests", REQ_TINT)}
            {(rqSide === "in" ? askIn : askOut).length === 0 ? (
              <div style={emptyBox}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing here</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>{rqSide === "in" ? "Nobody has asked you onto a class, a room or a duet." : "You have not asked anybody onto a class, a room or a duet."}</div>
              </div>
            ) : (
              (rqSide === "in" ? askIn : askOut).map(askCard)
            )}
          </>
        ) : null}

        {sect === "join" ? (
          <>
            {sideSwitch(rqSide, setRqSide, joinIn.length, joinOut.length, "invitations", JOIN_TINT.invite ?? REQ_TINT)}
            {(rqSide === "in" ? joinIn : joinOut).length === 0 ? (
              <div style={emptyBox}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing here</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>{rqSide === "in" ? "Nobody has invited you onto a team, a crew or an organization." : "You have not invited anybody onto a team, a crew or an organization."}</div>
              </div>
            ) : (
              (rqSide === "in" ? joinIn : joinOut).map(joinCard)
            )}
          </>
        ) : null}

        {sect === "enq" ? (
          <>
            {/* ⚠ WHAT YOU TAKE, ABOVE WHAT CAME IN (27 Sep 2026). It is a
                disclosure rather than a block — closed it is one line saying the
                state ("3 of 5 kinds"), which is the whole of what a desk needs to
                say when nothing is being changed, and the rows underneath are
                what the screen is for. The same treatment the Stats points card
                got when it stood full-width between the controls and the board. */}
            {settings}
            <div style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 9 }}>
              {(
                [
                  ["in", "Received", enquiriesIn.length],
                  ["out", "Sent", enquiriesOut.length],
                ] as Array<["in" | "out", string, number]>
              ).map(([k, l, n]) => (
                <div key={k} role="button" tabIndex={0} aria-pressed={enqSide === k} aria-label={`${l} enquiries`} onKeyDown={pressKey(() => setEnqSide(k))} onClick={() => setEnqSide(k)} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800, background: enqSide === k ? "var(--solid)" : "transparent", color: enqSide === k ? "var(--text)" : "var(--sub)", boxShadow: enqSide === k ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}>
                  {l}
                  {n > 0 ? <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 900, fontFamily: DOS_MONO, color: "var(--muted)" }}>{n}</span> : null}
                </div>
              ))}
            </div>
            {side.length === 0 ? (
              <div style={emptyBox}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing here</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>{enqSide === "out" ? "You have not sent any enquiries yet — send one from any profile." : "No enquiries have come in yet."}</div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginBottom: 8 }}>
                  {tiles.map(([v, l, s2, c2]) => (
                    <div key={l} style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderTop: `3px solid ${c2}`, borderRadius: 14, padding: "10px 9px" }}>
                      <div style={{ fontFamily: DOS_MONO, fontSize: 16, fontWeight: 600, letterSpacing: -0.4 }}>{v}</div>
                      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--sub)", marginTop: 2 }}>{l}</div>
                      <div style={{ fontSize: 9.5, color: c2, fontWeight: 700, marginTop: 2, fontFamily: DOS_MONO }}>{s2}</div>
                    </div>
                  ))}
                </div>
                <div role="button" tabIndex={0} aria-expanded={brkOpen} onKeyDown={pressKey(() => setBrkOpen((v) => !v))} onClick={() => setBrkOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "10px 12px", marginBottom: 10, cursor: "pointer" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, flex: 1 }}>Pipeline breakup</span>
                  <span style={{ fontFamily: DOS_MONO, fontSize: 10, color: "var(--muted)" }}>{moneyShort(sum(side))} total</span>
                  <span style={{ color: "var(--muted)", fontSize: 12, transform: brkOpen ? "rotate(90deg)" : "none", transition: "transform .16s", display: "inline-block" }}>›</span>
                </div>
                {brkOpen ? (
                  <div style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 14, padding: "12px 13px", marginBottom: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 8 }}>BY TYPE</div>
                    {byType.map((x) => {
                      const mx = Math.max(...byType.map((y) => sum(y.rows)), 1);
                      const v = sum(x.rows);
                      return (
                        <div key={x.k} style={{ marginBottom: 9 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <EnqIcon k={x.k} size={13} color={ENQ_TINT[x.k]} />
                            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 800 }}>{x.label}</span>
                            <span style={{ fontFamily: DOS_MONO, fontSize: 10.5, color: "var(--sub)" }}>{x.rows.length}</span>
                            <span style={{ fontFamily: DOS_MONO, fontSize: 11, fontWeight: 600, width: 52, textAlign: "right" }}>{moneyShort(v)}</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: "var(--el)" }}>
                            <div style={{ height: 5, borderRadius: 3, width: `${Math.round((100 * v) / mx)}%`, background: ENQ_TINT[x.k] }} />
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", margin: "12px 0 7px" }}>BY STAGE</div>
                    {ENQ_STAGES.map((s2) => {
                      const rows = side.filter((e) => st(e) === s2);
                      if (!rows.length) return null;
                      return (
                        <div key={s2} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 11.5, borderBottom: "1.5px solid var(--el)" }}>
                          <span style={{ color: "var(--sub)" }}>{ENQ_STAGE_WORD[s2]}</span>
                          <span>
                            <span style={{ fontFamily: DOS_MONO, color: "var(--muted)", marginRight: 8 }}>{rows.length}</span>
                            <b style={{ fontFamily: DOS_MONO }}>{moneyShort(sum(rows))}</b>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </>
            )}
            {side.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 5, marginBottom: 7, overflowX: "auto", scrollbarWidth: "none" }}>
                  {([["all", "All", null] as const, ...ENQ_TYPES.map((t) => [t.k, t.label, t.k] as const)]).map(([k, l, ic]) => {
                    const n = k === "all" ? side.length : side.filter((e) => e.typeKey === k).length;
                    if (!n) return null;
                    const on = enqType === k;
                    const c = k === "all" ? "#8B5CF6" : ENQ_TINT[k as EnquiryTypeKey];
                    return (
                      <span key={k} role="button" tabIndex={0} aria-pressed={on} onKeyDown={pressKey(() => setEnqType(k as "all" | EnquiryTypeKey))} onClick={() => setEnqType(k as "all" | EnquiryTypeKey)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 11px", borderRadius: 999, cursor: "pointer", fontSize: 10.5, fontWeight: 800, background: on ? c : "var(--card)", color: on ? "#08060C" : "var(--sub)", border: `1.5px solid ${on ? c : "var(--el)"}` }}>
                        {ic ? <EnqIcon k={ic} size={12} color={on ? "#08060C" : c} sw={2} /> : null}
                        {l}
                        <span style={{ fontFamily: DOS_MONO, fontSize: 9.5, fontWeight: 600, opacity: 0.8 }}>{n}</span>
                      </span>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 5, marginBottom: 10, overflowX: "auto", scrollbarWidth: "none" }}>
                  {([["all", "Any stage"] as const, ...ENQ_STAGES.map((s) => [s, ENQ_STAGE_WORD[s]] as const)]).map(([k, l]) => (
                    <span key={k} role="button" tabIndex={0} aria-pressed={enqSt === k} onKeyDown={pressKey(() => setEnqSt(k as "all" | EnquiryStatus))} onClick={() => setEnqSt(k as "all" | EnquiryStatus)} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, cursor: "pointer", fontSize: 11, fontWeight: 800, background: enqSt === k ? "var(--text)" : "var(--card)", color: enqSt === k ? "var(--solid)" : "var(--sub)", border: `1.5px solid ${enqSt === k ? "var(--text)" : "var(--el)"}` }}>
                      {l}
                    </span>
                  ))}
                </div>
                {filtered.length === 0 ? (
                  <div style={emptyBox}>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>No enquiries match</div>
                    <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Try a different type or stage.</div>
                  </div>
                ) : null}
                {filtered.map(enquiryCard)}
              </>
            ) : null}
          </>
        ) : null}

        {/* ── DONE — what is over, in one place (27 Sep 2026) ────────────────
            Every answered ask and every closed enquiry, both directions, newest
            first. ⚠ It draws the SAME three cards the live desks draw — a class
            ask is still a class card, an invitation still the join card, an
            enquiry still its own — because a decision you made should look like
            the thing you decided about, not like a log line. What differs is
            only that the action row is the stamp. ── */}
        {sect === "done" ? (
          doneN === 0 ? (
            <div style={emptyBox}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing finished yet</div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Answered requests and invitations, and enquiries that are won or lost, stay here.</div>
            </div>
          ) : (
            <>
              {doneReq.filter((r) => !isJoin(r)).map(askCard)}
              {doneReq.filter(isJoin).map(joinCard)}
              {doneEnq.map(enquiryCard)}
            </>
          )
        ) : null}
      </div>

      {toast ? (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
