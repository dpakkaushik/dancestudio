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
import { DOS_DISPLAY, DOS_UI, LILAC, SKY, TAB_SUB, TAB_TITLE } from "@/lib/design/tokens";
import type { DanceClass } from "@/types/class";
import type { ClassArtist } from "@/types/classPerson";
import {
  ENQ_STAGES,
  ENQ_STAGE_WORD,
  ENQ_TINT,
  ENQ_TYPES,
  enquiryStage,
  enquiryValueInr,
  liveQuoteOf,
  type Enquiry,
  type EnquiryStatus,
  type EnquiryTypeKey,
} from "@/types/enquiry";
import { DOS_MONO, EnqIcon, agoWords, initialsOf, moneyShort, pressKey } from "./inbox-kit";
import { EnquiryCard } from "@/features/enquiries/components/enquiry-kit";

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
  /** ⚠ `withdrawn` (2 Oct 2026): an ask taken back before it was answered, or
   *  an invite the studio revoked — over, so it is under Completed, never gone */
  status?: "asked" | "confirmed" | "rejected" | "withdrawn";
  /** ⚠ THE THING ITSELF, SO THE DESK CAN DRAW ITS OWN CARD (27 Sep 2026, the
   *  user: *"event and class request cards should also look like class and
   *  event cards on discover with accept and reject buttons"*). A class ask and
   *  a room ask carry the CLASS — the same object Discover draws, through the
   *  same component — so an ask about a class cannot end up describing it
   *  differently from the shelf it came off. Absent only when the row could not
   *  be read, and then the card falls back to the plain row.
   *  ⚠ `event` was its twin, for a duet ask, and went on 29 Sep 2026. */
  danceClass?: DanceClass | null;
  /** the SEAT an invitation offers, in the app's word and its label colour
   *  (2 Oct 2026, "better cards for invites") — absent for a crew ask */
  role?: { word: string; colour: string };
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

type Side3 = "in" | "out" | "done";
const emptyBox: React.CSSProperties = { background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 16, padding: "22px 16px", textAlign: "center" };

export function InboxScreen({
  accent,
  requestsIn,
  requestsOut,
  enquiriesIn,
  enquiriesOut,
  nowIso,
  initialSection,
  deskSub = null,
  receivedOnly = false,
  settings = null,
  artists = {},
}: {
  /** a studio's or a crew's desk — what it was asked, and no Sent side */
  receivedOnly?: boolean;
  /** the profile-tinted wash the rest of the app opens on (5681) */
  accent: string;
  requestsIn: RequestItem[];
  requestsOut: RequestItem[];
  enquiriesIn: Enquiry[];
  enquiriesOut: Enquiry[];
  nowIso: string;
  /** ⚠⚠ ENQUIRIES ARE THIS SCREEN'S THIRD DESK AGAIN (2 Oct 2026, the user:
   *  *"shift back enquiries to inbox from home tools for all profiles"*). They
   *  left for a tab on 27 Sep, then a tool tile; both are gone, and the `desk`
   *  switch that let one component draw two screens went with them. The section
   *  a link opens on is `?show=enquiries` / `?show=done`, read by the page. */
  initialSection?: "req" | "join" | "enq" | "done";
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
  /** ⚠ THE TEACHER EACH CLASS CARD WEARS IN ITS CENTRE (1 Oct 2026), keyed by
   *  class id — one read for the whole desk (`findClassArtists`). The Inbox drew
   *  `ClassTile` with no artist since 27 Sep, so every card's middle was an empty
   *  square: the other half of *"a lot of blank class cards"*. A class nobody has
   *  accepted yet still has none, and the square is the honest picture of that. */
  artists?: Record<string, ClassArtist>;
}) {
  const router = useRouter();
  /* ⚠⚠ THREE COLUMNS, ENQUIRIES FIRST, AND COMPLETED INSIDE EACH (2 Oct 2026,
     the user: "completed not in line with enquiries invites and request but
     with received and sent in their respective section. enquiry should be
     first. all requests, invites and enquiries should be 3 columns"). An old
     `?show=done` link opens the first column on its Completed side. */
  const [sect, setSect] = useState<"enq" | "req" | "join">(initialSection === "req" || initialSection === "join" ? initialSection : "enq");
  const [rqSide, setRqSide] = useState<Side3>(initialSection === "done" ? "done" : "in");
  const [enqSide, setEnqSide] = useState<Side3>(initialSection === "done" ? "done" : "in");
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
  /* ⚠⚠ ONE ROW PER ASK, NOT ONE PER SIDE (1 Oct 2026, the user: *"when checking
     done section in inbox a lot of blank class cards"*). Somebody who owns a
     studio and names THEMSELVES on its class (R47 — born confirmed, kept as a
     log) holds that ask on BOTH sides, so Done drew it twice with one React key
     each time — "you were asked" and "you asked yourself" — and React's own
     warning is that duplicate keys get children "duplicated and/or omitted",
     which is the blank card. The received side wins: it is the one that says
     what you agreed to. */
  const doneReq = (() => {
    const seen = new Set<string>();
    return [...requestsIn, ...requestsOut].filter(isDone).filter((r) => {
      const k = `${r.kind}-${r.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  })();
  /* ⚠ A CLOSED ENQUIRY — WON OR LOST — IS IN DONE (2 Oct 2026, the user: "lost
     enquiries also in done section"). Only the Enquiries TOOL's desk ever drew
     them there; the Inbox's Done held no enquiry at all. Deduped by id, because
     an enquiry you sent to your own artist page is on both sides. */
  const closedEnq = (e: Enquiry) => ["won", "lost"].includes(enquiryStage(e));
  /* ⚠⚠ COMPLETED LIVES INSIDE EACH COLUMN (2 Oct 2026, the user's second word on
     it: "completed not in line with enquiries invites and request but with
     received and sent in their respective section"). Each column is Received ·
     Sent · Completed, and its Completed holds THAT kind's closed rows, both
     directions — the card already says which way it went. A self-ask (R47) and
     an enquiry sent to your own page are on both sides; `doneReq` and the id
     set below keep each once. */
  const doneAsks = doneReq.filter((r) => !isJoin(r));
  const doneJoins = doneReq.filter((r) => isJoin(r));
  const doneEnq = (() => {
    const seen = new Set<string>();
    return [...enquiriesIn, ...enquiriesOut].filter(closedEnq).filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  })();
  const SECT: Array<["enq" | "req" | "join", string, number, string]> = [
    ["enq", "Enquiries", newIn.length, "#EC4899"],
    ["req", "Requests", askIn.filter((r) => r.dir === "in").length, "#DC2626"],
    ["join", "Invites", joinIn.filter((r) => r.dir === "in").length, JOIN_TINT.invite ?? SKY],
  ];
  /* ⚠ WHAT WAITS ON YOU (2 Oct 2026, found re-reading): this was
     `requestsIn.length`, which since 19 Sep includes every ANSWERED ask too — so
     somebody who had answered everything read "4 waiting on you". It is the
     unanswered asks and invitations put to you, and the enquiries still new. */
  const owed = askIn.length + joinIn.length + newIn.length;

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
  /** THE ANSWER STAMP, written once for the three cards (2 Oct 2026) — and it
   *  learned a third answer: WITHDRAWN, in grey, because taking an ask back is
   *  neither a yes nor a no and painting it red would claim somebody refused. */
  const answerStamp = (r: RequestItem, join: boolean) => {
    const st = r.status;
    const yes = st === "confirmed";
    const back = st === "withdrawn";
    const [bg, fg, bd] = yes ? ["rgba(34,197,94,.15)", "#22C55E", "rgba(34,197,94,.4)"] : back ? ["var(--el)", "var(--sub)", "var(--el)"] : ["rgba(248,113,113,.14)", "#F87171", "rgba(248,113,113,.36)"];
    const words = back
      ? r.dir === "in"
        ? `Withdrawn by ${r.who}`
        : "You withdrew it"
      : yes
        ? join
          ? r.dir === "in" ? "Joined — you said yes" : `Joined by ${r.who}`
          : r.dir === "in" ? "Accepted — you said yes" : `Accepted by ${r.who}`
        : join
          ? r.dir === "in" ? "Declined — you said no" : `Declined by ${r.who}`
          : r.dir === "in" ? "Rejected — you said no" : `Rejected by ${r.who}`;
    return (
      <span data-testid="answer-stamp" data-status={st} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, fontSize: 10.5, fontWeight: 900, letterSpacing: 0.2, background: bg, color: fg, border: `1.5px solid ${bd}` }}>
        <span aria-hidden="true">{yes ? "✓" : back ? "↩" : "✕"}</span>
        {words}
      </span>
    );
  };

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
      return <div style={{ flex: 1, display: "flex", padding: "2px 0" }}>{answerStamp(r, false)}</div>;
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
        <div key={`${r.kind}-${r.dir}-${r.id}`} data-testid="request-row" style={{ marginBottom: 12 }}>
          {askWho(r)}
          <ClassTile danceClass={r.danceClass} artist={artists[r.danceClass.id] ?? null} href={r.href ?? undefined} roleLabel={r.what.toUpperCase()} actions={askActions(r)} />
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
      <Row key={`${r.kind}-${r.dir}-${r.id}`} c={c} testId="request-row">
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
          <div style={{ marginTop: 10, display: "flex" }}>{answerStamp(r, false)}</div>
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
      /* ⚠⚠ THE INVITATION CARD, RE-CUT (2 Oct 2026, the user: "better cards for
         invites as well") on the enquiry card's own anatomy — a tinted band that
         says what this is, then the thing you would join with its monogram, and
         the SEAT as a chip in its label's colour ("Faculty", never the column's
         "trainer", which the old note printed). The answer row is unchanged. */
      <div
        key={`${r.kind}-${r.dir}-${r.id}`}
        data-testid="request-row"
        style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, marginBottom: 10, overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: `${c}14`, borderBottom: `1.5px solid ${c}33` }}>
          <span aria-hidden="true" style={{ fontSize: 12, fontWeight: 900, color: c }}>＋</span>
          <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: c, textTransform: "uppercase" }}>
            {r.dir === "in" ? "Invitation" : "Invitation sent"} · {r.subjectKind === "CREW" ? "Crew" : "Team"}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 9.5, color: "var(--muted)" }}>{agoWords(r.at, nowIso)}</span>
        </div>
        <div style={{ padding: "12px 13px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span aria-hidden="true" style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, background: `linear-gradient(135deg, ${c}, ${c}88)`, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900 }}>
              {initialsOf(r.subjectTitle)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* WHAT YOU WOULD BE JOINING, first and biggest */}
              <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.15, fontFamily: DOS_DISPLAY, overflowWrap: "anywhere" }}>{r.subjectTitle}</div>
              <div style={{ fontSize: 11.5, color: "var(--sub)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.dir === "in" ? (
                  r.subjectKind === "CREW" ? (
                    <>
                      invited by <b style={{ color: "var(--text)" }}>{r.who}</b>
                    </>
                  ) : (
                    "wants you on its team"
                  )
                ) : (
                  <>
                    you invited <b style={{ color: "var(--text)" }}>{r.who}</b>
                  </>
                )}
              </div>
            </div>
            {/* ⚠ THE SEAT IS A CHIP, NOT A CLAUSE — a label fits every value
                without rewording the vocabulary into near-English */}
            <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.4, padding: "4px 10px", borderRadius: 999, background: `${r.role?.colour ?? c}1e`, border: `1.5px solid ${r.role?.colour ?? c}66`, color: r.role?.colour ?? c, textTransform: "uppercase" }}>
              {r.role?.word ?? (r.subjectKind === "CREW" ? "Member" : r.what)}
            </span>
          </div>
          {r.note ? <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.45 }}>{r.note}</div> : null}
          {r.href ? (
            <Link href={r.href} aria-label={`View ${r.subjectTitle}`} style={{ display: "inline-block", marginTop: 8, fontSize: 10.5, fontWeight: 800, color: c, textDecoration: "none" }}>
              Have a look first ›
            </Link>
          ) : null}

        {answered ? (
          /* ⚠ THE SAME STAMP THE ASK CARD WEARS (27 Sep 2026, the user: "change
             the way accepted looks like on cards for ALL THESE") — a filled pill
             in the answer's own colour, not a line of green text where the
             buttons used to be. `askActions` carries the whole reason. */
          <div style={{ marginTop: 11, display: "flex" }}>{answerStamp(r, true)}</div>
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
      </div>
    );
  };

  /** RECEIVED · SENT, written once for the two columns that have two sides.
   *  ⚠ `rqSide` is deliberately SHARED between Requests and Invites: they are
   *  the same question about two kinds of thing, and a person reading their
   *  sent asks who switches to Invites means the sent ones there too. */
  /* ⚠ Completed's count is what is IN it (not what waits on you — nothing there
     waits on anybody), painted green so it never reads as owed. And a studio's
     or a crew's Enquiries desk has no Sent side: an enquiry is sent by a person. */
  const sideSwitch = (cur: Side3, set: (s: Side3) => void, nIn: number, nOut: number | null, nDone: number, noun: string, tint: string) => (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      {(
        [
          ["in", "Received", nIn, tint],
          ...(nOut === null ? [] : [["out", "Sent", nOut, tint]]),
          ["done", "Completed", nDone, "#22C55E"],
        ] as Array<[Side3, string, number, string]>
      ).map(([k, l, n, tint]) => (
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
  /* ⚠ THE CARD IS THE ENQUIRY KIT'S (2 Oct 2026) — one card for the desk and the
     Done list, with both faces and the road on it. Which end the reader is on is
     decided PER CARD: Done mixes both ends, so the desk's own `enqSide` would
     have called an enquiry you SENT "from" yourself. */
  const outIds = new Set(enquiriesOut.map((x) => x.id));
  const enquiryCard = (e: Enquiry) => <EnquiryCard key={e.id} e={e} out={outIds.has(e.id)} nowIso={nowIso} />;

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
  /* ⚠ A CLOSED ENQUIRY IS IN DONE AND NOWHERE ELSE (2 Oct 2026, the user: "once
     enquiry is closed should be in done section only"). Won and lost ones were
     listed here AND under Done, so a finished job sat in the live desk for ever.
     The LIST is what is still open; the three tiles above still count the whole
     side, because a win rate is about every enquiry ever answered. */
  const isClosed = (e: Enquiry) => ["won", "lost"].includes(st(e));
  const liveSide = side.filter((e) => !isClosed(e));
  const liveIn = enquiriesIn.filter((e) => !isClosed(e)).length;
  const liveOut = enquiriesOut.filter((e) => !isClosed(e)).length;
  const filtered = liveSide.filter((e) => enqType === "all" || e.typeKey === enqType).filter((e) => enqSt === "all" || st(e) === enqSt);

  return (
    <div style={{ position: "relative", background: LILAC, color: "var(--text)", maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40 }}>
      {/* the profile-tinted wash a TAB opens on (5681) — `/inbox` is a tab; the
          Enquiries tool page that wore none is gone (2 Oct 2026) */}
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 230, pointerEvents: "none", background: `linear-gradient(180deg, ${accent}5c 0%, ${accent}20 44%, transparent 100%)` }} />
      {/* ⚠⚠ THE HEADING WAS MISSING (27 Sep 2026, the user: "inbox heading is
          missing"). The three-desk re-cut earlier the same day took the title
          out with the paragraph beside it, and `/inbox` is a TAB — so the chrome
          draws the wordmark rather than a drill title and nothing named the
          screen at all. That is **no `<h1>` on the page**, the fourth time this
          repo has found that exact shape (the desks 18 Sep, the studio Team desk
          21 Sep, `EventForm` and `/rooms` 22 Sep), and the one thing a screen
          reader has to move by. Discover's own head is the model: a display
          heading with the count as its sub-line. */}
      <div style={{ padding: "12px 16px 0", position: "relative" }}>
        {/* ⚠ `TAB_TITLE` / `TAB_SUB` (2 Oct 2026): the same heading and the same
            line under it as Discover's, read from one token pair. */}
        <h1 data-testid="inbox-title" style={TAB_TITLE}>Inbox</h1>
        {/* ⚠ WHOSE DESK, when a tool tile named one (27 Sep 2026). A list
            narrowed to one studio with nothing on screen saying so reads as a
            list that has lost rows — the same reason every tool hero names the
            business an organization is standing in. */}
        <div data-testid="inbox-sub" style={{ ...TAB_SUB, margin: "5px 0 12px" }}>
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
            {sideSwitch(rqSide, setRqSide, askIn.length, askOut.length, doneAsks.length, "requests", REQ_TINT)}
            {(rqSide === "in" ? askIn : rqSide === "out" ? askOut : doneAsks).length === 0 ? (
              <div style={emptyBox}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{rqSide === "done" ? "Nothing completed yet" : "Nothing here"}</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>
                  {rqSide === "in" ? "Nobody has asked you onto a class, a room or a practice." : rqSide === "out" ? "You have not asked anybody onto a class or a room." : "Requests land here once they are accepted, rejected or withdrawn."}
                </div>
              </div>
            ) : (
              (rqSide === "in" ? askIn : rqSide === "out" ? askOut : doneAsks).map(askCard)
            )}
          </>
        ) : null}

        {sect === "join" ? (
          <>
            {sideSwitch(rqSide, setRqSide, joinIn.length, joinOut.length, doneJoins.length, "invitations", JOIN_TINT.invite ?? REQ_TINT)}
            {(rqSide === "in" ? joinIn : rqSide === "out" ? joinOut : doneJoins).length === 0 ? (
              <div style={emptyBox}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{rqSide === "done" ? "Nothing completed yet" : "Nothing here"}</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>
                  {rqSide === "in" ? "Nobody has invited you onto a team or a crew." : rqSide === "out" ? "You have not invited anybody onto a team or a crew." : "Invitations land here once they are joined, declined or withdrawn."}
                </div>
              </div>
            ) : (
              (rqSide === "in" ? joinIn : rqSide === "out" ? joinOut : doneJoins).map(joinCard)
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
            {/* ⚠ NO SENT SIDE ON A STUDIO'S OR A CREW'S DESK (2 Oct 2026) — an
                enquiry is sent by a person, so the toggle there could only ever
                offer an empty half */}
            {sideSwitch(enqSide, setEnqSide, liveIn, receivedOnly ? null : liveOut, doneEnq.length, "enquiries", "#EC4899")}
            {enqSide === "done" ? (
              doneEnq.length === 0 ? (
                <div style={emptyBox}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing completed yet</div>
                  <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Enquiries land here once they are won or lost.</div>
                </div>
              ) : (
                doneEnq.map(enquiryCard)
              )
            ) : side.length === 0 ? (
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
            {enqSide !== "done" && side.length > 0 && liveSide.length === 0 ? (
              <div style={emptyBox}>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>Nothing open</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 3 }}>Won and lost enquiries are under Completed.</div>
              </div>
            ) : null}
            {enqSide !== "done" && liveSide.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 5, marginBottom: 7, overflowX: "auto", scrollbarWidth: "none" }}>
                  {([["all", "All", null] as const, ...ENQ_TYPES.map((t) => [t.k, t.label, t.k] as const)]).map(([k, l, ic]) => {
                    const n = k === "all" ? liveSide.length : liveSide.filter((e) => e.typeKey === k).length;
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
                  {/* the closed stages are Done's, so they are not offered as a filter here */}
                  {([["all", "Any stage"] as const, ...ENQ_STAGES.filter((s) => s !== "won" && s !== "lost").map((s) => [s, ENQ_STAGE_WORD[s]] as const)]).map(([k, l]) => (
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

      </div>

      {toast ? (
        <div role="status" aria-live="polite" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--solid)", border: "1.5px solid #0EA5E9", boxShadow: "0 6px 24px rgba(0,0,0,.45)", color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 360, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
