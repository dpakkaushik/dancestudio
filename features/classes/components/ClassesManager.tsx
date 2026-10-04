"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  checkRoomClashAction,
  deleteClassAction,
  publishClassAction,
  respondToVenueRequestAction,
  type ClassActionState,
  type RoomClash,
} from "@/features/classes/server-actions/classes";
import { withdrawClassAskAction } from "@/features/classPeople/server-actions/classPeople";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DOS_TOOLS, dosToolPaint } from "@/features/businesses/components/biz-kit";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import type { ClassPublishState, VenueRequest } from "@/repositories/classes";
import type { ClassArtist } from "@/types/classPerson";
import { classPhaseAt, type DanceClass } from "@/types/class";
import { ASK_STATUS_WORD, type ClassRelation } from "@/lib/format/classLabels";

/* the IST date and clock of a session, in the shape the clash check takes */
const istParts = (iso: string) => {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace("24", "00");
  return { date: d, time: t };
};

/* the request chips a row wears (18 Sep 2026): who was asked to teach and what
   they said; which studio was asked for its room and what it said.
   ⚠ IN THE SHARED ASK WORDS SINCE 4 Oct 2026 — "{who} · Asked / Confirmed /
   Declined", the four words the Inbox's stamps use. These chips said "asked",
   "said no", "declined" and "Waiting on" for the same three states. */
const ASK_TINT = { asked: "#F59E0B", confirmed: "#22C55E", rejected: "#F87171" } as const;
const stateChips = (st: ClassPublishState | undefined): Array<[string, string]> => {
  const out: Array<[string, string]> = [];
  if (!st) return out;
  if (st.teacherName && st.teacherStatus) {
    out.push([`${st.teacherName} · ${ASK_STATUS_WORD[st.teacherStatus]}`, ASK_TINT[st.teacherStatus]]);
  }
  if (st.venueName && st.venueStatus) {
    const s = st.venueStatus === "accepted" ? "confirmed" : st.venueStatus === "declined" ? "rejected" : "asked";
    out.push([`Room at ${st.venueName} · ${ASK_STATUS_WORD[s]}`, ASK_TINT[s]]);
  }
  return out;
};

const CARD = "var(--card)";
const EL = "var(--el)";

/** ⚠⚠ THE TABS ARE BUCKETED BY THE CLOCK, NOT BY `status` (30 Sep 2026).
 *  Nothing in this app has ever moved a class to `completed` — see
 *  `classPhaseAt` — so this tab counted `status === "completed"` and was
 *  PERMANENTLY EMPTY, while every class that had already run sat under
 *  Published for ever. A studio's register is the one screen that has to be able
 *  to say "that one is done"; it says it off the session now.
 *
 *  ⚠ REQUESTS is a fourth tab and is drawn only when there is something on it
 *  (the prototype's own rule at 7135 — a door onto an empty room is worse than
 *  no door). It holds the asks for THIS studio's ROOMS, which had no home in the
 *  classes section at all: a venue request is a class owned by the ARTIST's
 *  page, so `findClassesByBusiness` never returned one and a studio's own rooms
 *  were being committed with its classes desk silent about it. */
type Tab = "published" | "draft" | "completed" | "requests";
const TAB_WORD: Record<Tab, string> = {
  published: "Published",
  draft: "Draft",
  completed: "Completed",
  requests: "Requests",
};
const initialState: ClassActionState = { error: null };

/* the tile that opens this page is painted in the tool's own colour, and the
   page wears the same paint. ⚠ READ FROM `DOS_TOOLS`, never typed here (2 Oct
   2026): this line said `#0D9488` while the tile had been `#0F766E` since 18 Sep,
   so the register wore a different teal from the tile that opened it. */
const TOOL_COLOUR = DOS_TOOLS.classes.c;
const toolPaint = dosToolPaint;

/* bizBtn (prototype 2920) — the one primary pill every desk uses */
const bizBtn: React.CSSProperties = {
  textAlign: "center",
  padding: 13,
  borderRadius: 999,
  background: "var(--text)",
  color: "var(--solid)",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  marginBottom: 10,
  textDecoration: "none",
};

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

const sheetWrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 640,
};

const schedLine = (c: DanceClass) =>
  c.session
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(c.session.startsAt))
    : "unscheduled";

/** Live is worked out from the schedule and the clock (prototype dosClassLive,
 *  14984-14987): a class is live only inside its own window. Pure arithmetic
 *  over the handed-in clock — the component never reads Date.now() itself. */
const isLiveAt = (c: DanceClass, nowMs: number) =>
  c.status === "published" &&
  c.session !== null &&
  new Date(c.session.startsAt).getTime() <= nowMs &&
  nowMs <= new Date(c.session.endsAt).getTime();

/** LiveBanner (prototype 3949-3969) — the same "happening now" filter Events has. */
function LiveBanner({ n, on, setOn }: { n: number; on: boolean; setOn: (fn: (v: boolean) => boolean) => void }) {
  if (!n) return null;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOn((v) => !v);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: on ? "rgba(34,197,94,.16)" : CARD,
        border: `1.5px solid ${on ? "#22C55E" : EL}`,
        borderRadius: 16,
        padding: "12px 13px",
        marginBottom: 10,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span style={{ position: "relative", width: 12, height: 12, flexShrink: 0 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: 6, background: "#22C55E" }} />
        <span
          style={{
            position: "absolute",
            inset: -4,
            borderRadius: 10,
            border: "2px solid #22C55E",
            opacity: 0.45,
            animation: "dosPulseH 1.4s ease-out infinite",
          }}
        />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#22C55E", fontFamily: DOS_UI }}>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{n}</span> {n === 1 ? "class" : "classes"} live right now
        </div>
        <div style={{ fontSize: 10.5, color: SUB, marginTop: 1 }}>
          {on ? "Showing live only — tap to show all" : "Tap to filter to live classes"}
        </div>
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          padding: "5px 10px",
          borderRadius: 999,
          flexShrink: 0,
          background: on ? "#22C55E" : EL,
          color: on ? "#fff" : SUB,
        }}
      >
        {on ? "ON" : "OFF"}
      </span>
    </div>
  );
}

/** Confirm sheet — lifted from the prototype's ask/delete sheets (DanceOSApp.jsx:15065-15105). */
function ConfirmSheet({
  title,
  body,
  keepLabel,
  goLabel,
  goDanger,
  onClose,
  form,
}: {
  title: string;
  body: string;
  keepLabel: string;
  goLabel: string;
  goDanger: boolean;
  onClose: () => void;
  form: (goButton: ReactNode) => ReactNode;
}) {
  useCloseOnBack(onClose);
  const goButton = (
    <button
      type="submit"
      style={{
        flex: 1.3,
        textAlign: "center",
        padding: "13px",
        borderRadius: 999,
        border: "none",
        background: goDanger ? "#EF4444" : INK,
        color: goDanger ? "#fff" : LILAC,
        fontWeight: 900,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {goLabel}
    </button>
  );
  return (
    <div onClick={onClose} style={sheetWrap}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: LILAC,
          color: INK,
          borderRadius: "24px 24px 0 0",
          padding: "18px 16px 28px",
          width: "100%",
          maxWidth: 430,
          boxSizing: "border-box",
          textAlign: "center",
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: EL, margin: "0 auto 12px" }} />
        <b style={{ fontSize: 16.5, fontFamily: DOS_DISPLAY }}>{title}</b>
        <div style={{ fontSize: 12, color: SUB, margin: "5px 0 14px", lineHeight: 1.55 }}>{body}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "13px",
              borderRadius: 999,
              background: CARD,
              border: `1.5px solid ${EL}`,
              color: INK,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {keepLabel}
          </button>
          {form(goButton)}
        </div>
      </div>
    </div>
  );
}

/** Classes register — lifted from the prototype's S_classesmod (DanceOSApp.jsx:14970-15106). */
export function ClassesManager({
  businessId,
  classes,
  filledBySession = {},
  artists = {},
  nowIso,
  publishState = {},
  embedded = false,
  whyNoClass = null,
  canCreate = true,
  canEdit = true,
  venueRequests = [],
  askedTeachers = {},
  elsewhere = [],
  elsewhereHead = "AT OTHER STUDIOS",
  elsewhereRelation = "teaching",
  offerCreate = true,
  sections = true,
}: {
  /** ⚠ DRAW IN THE THREE-SECTION LAYOUT (3 Oct 2026, C116): the hero, Create
   *  and the live filter in a `DeskTop`, the sticky tabs and the list in a
   *  `DeskBody`. Pass `false` when this register is nested inside a page that
   *  already wears its own sections (an artist's Manage segment on
   *  `/my-classes`) — it then renders exactly as before. An `embedded` register
   *  never draws sections either. */
  sections?: boolean;
  businessId: string;
  classes: DanceClass[];
  /** Enrolled count per session id — real numbers from Step 4. */
  filledBySession?: Record<string, number>;
  /** the confirmed teacher per class id — the face each card's centre wears
   *  (18 Sep 2026). A draft nobody has accepted yet has none, and the card falls
   *  back to the style square, which is the honest picture of a class with no
   *  teacher on it. */
  artists?: Record<string, ClassArtist>;
  /** The server's clock at render — the LIVE filter is arithmetic over it. */
  nowIso: string;
  /** WHAT STANDS BETWEEN EACH CLASS AND PUBLISH (18 Sep 2026), keyed by class id:
   *  the teacher asked and their answer, the venue asked and its answer, and the
   *  database's own sentence — Publish is offered only when it is null. */
  publishState?: Record<string, ClassPublishState>;
  /** drawn INSIDE another page (an artist's Your classes, its Manage segment):
   *  no hero of its own, no page background — the rows, the tabs, Create */
  embedded?: boolean;
  /** THE DATABASE'S OWN SENTENCE, if a new class would be refused here
   *  (`why_no_class`, read by the page since 18 Sep 2026 — the user: "fix").
   *  Null means Create class is a door; a sentence means it is drawn as the
   *  sentence, so an artist whose plan has lapsed reads why BEFORE filling a
   *  form the trigger would refuse on Publish. */
  whyNoClass?: string | null;
  /** ⚠ is the caller the OWNER — the only seat `create_class_with_session`
   *  admits since 18 Sep 2026. `whyNoClass` answers a different question (can
   *  THIS BUSINESS carry a class at all) and cannot stand in for it. */
  canCreate?: boolean;
  /** ⚠⚠ MAY THE CALLER CHANGE A CLASS THAT EXISTS (30 Sep 2026) — the owner
   *  alone, because RLS has admitted only the owner to `classes` UPDATE since
   *  18 Sep. R55 opened this whole register to MANAGERS on 28 Sep and only the
   *  Create button was re-checked, so a manager read a desk carrying Edit,
   *  Publish and Delete on every row and all three failed: Edit bounced back
   *  here without a word, Publish printed the raw *"Class not found or not yours
   *  to change"*, and **Delete reported success and deleted nothing** — the
   *  update is refused by policy as zero rows with no error, which that
   *  repository function now reads back rather than trusting. Drawing the
   *  control is the bug; the RPCs were right all along. */
  canEdit?: boolean;
  /** the asks for THIS studio's rooms, waiting on an answer (30 Sep 2026) —
   *  empty for an artist's own register, which owns no rooms to be asked for */
  venueRequests?: VenueRequest[];
  /** classId → the id of the live ARTIST ask on it, so a row that says
   *  "⏳ {name} asked" can also take the ask back (30 Sep 2026). The chips have
   *  named these since 18 Sep and offered nothing to do about one. */
  askedTeachers?: Record<string, string>;
  /** ⚠⚠ THE CLASSES YOU TAKE AT SOMEBODY ELSE'S STUDIO, FILED IN THE TAB THEY
   *  BELONG TO (1 Oct 2026, the user: *"classes taken elsewhere … shown on all
   *  columns at the bottom. fix it according to the column where it should be
   *  placed"*). They were one block drawn UNDER this register, outside its tabs,
   *  so Published, Draft and Completed all ended on the same list — last month's
   *  class sitting under Draft, a draft under Completed. They go through the
   *  SAME `bucketOf` as the register's own rows, are counted in each pill, obey
   *  the live filter, and are drawn read-only (another business owns them: you
   *  run the door, you do not publish, price or delete) with the studio named. */
  elsewhere?: Array<{ id: string; danceClass: DanceClass; artist: ClassArtist | null; city: string | null }>;
  /** false for somebody with NO register of their own — a plain user a studio
   *  put in front of a class. They get the same three columns over their
   *  `elsewhere` rows and no Create control at all: there is nowhere for them to
   *  create one, and the owner-only sentence would name a studio they do not run. */
  offerCreate?: boolean;
  /** what the `elsewhere` block is called and what its chip says. A person's
   *  register lists the classes they teach AT OTHER STUDIOS; a STUDIO's lists the
   *  artists' classes held IN ITS ROOMS (2 Oct 2026, the user: "artist taking
   *  class in studio not showing up in studios classes section") — the same
   *  read-only rows, seen from the other side of the venue request.
   *  ⚠ The chip is a RELATION from the shared word list since 4 Oct 2026 — it
   *  was a free string ("Teaching", "Hosted") printed as a tag under the card,
   *  where every other page puts the same fact in the card's own chip. The
   *  studio-and-date line beside it went too: the card says both now (the date
   *  block, and "By …"). */
  elsewhereHead?: string;
  elsewhereRelation?: ClassRelation;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const inSections = sections && !embedded;
  /* `?new=1` ON TOP OF WHATEVER IS ALREADY THERE (22 Sep 2026) — this register is
     a page of its own AND the Manage segment of `/my-classes`, and on that second
     surface the segment lives in the query, so a bare `?new=1` would take the
     list out from under the sheet it just opened. */
  const createHref = (() => {
    const q = new URLSearchParams(search.toString());
    q.set("new", "1");
    return `?${q.toString()}`;
  })();
  const [rawTab, setTab] = useState<Tab>("published");
  const [liveOnly, setLiveOnly] = useState(false);
  /* the row that is mid-action, and whatever the last one said if it failed —
     the two new controls (withdraw an ask, answer a room request) are plain
     async calls rather than form actions, so they carry their own busy state */
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [ask, setAsk] = useState<{ kind: "publish" | "draft" | "published"; c: DanceClass; clash?: RoomClash } | null>(null);
  /* the sentence a refused Publish would have raised, said before the press */
  const [note, setNote] = useState<string | null>(null);
  /* named for what it is — the action's result — so the `publishState` PROP
     (what each class still waits for) keeps the name that reads correctly */
  const [publishResult, publishFormAction] = useActionState(publishClassAction, initialState);
  const [deleteState, deleteFormAction] = useActionState(deleteClassAction, initialState);

  /* "Delete & manage refunds" (15102-15104): the delete runs, and once it has
     landed the page moves on to where the money is settled. The action state
     is a fresh object after every round-trip, which is what this watches. */
  const goAfterDelete = useRef<string | null>(null);
  const lastDelete = useRef(deleteState);
  useEffect(() => {
    if (deleteState === lastDelete.current) return;
    lastDelete.current = deleteState;
    const to = goAfterDelete.current;
    goAfterDelete.current = null;
    if (to && !deleteState.error) router.push(to);
  }, [deleteState, router]);

  const nowMs = new Date(nowIso).getTime();
  const liveN = classes.filter((c) => isLiveAt(c, nowMs)).length + elsewhere.filter((e) => isLiveAt(e.danceClass, nowMs)).length;
  /* WHICH TAB A CLASS BELONGS ON, off the clock rather than off `status` — a
     class that has run is Completed here even though nothing ever writes that
     word to the column (see `classPhaseAt`). Live counts as Published, because
     it is still running and its register is still open. */
  const bucketOf = (c: DanceClass): Exclude<Tab, "requests"> => {
    const p = classPhaseAt(c, nowMs);
    return p === "draft" ? "draft" : p === "over" ? "completed" : "published";
  };
  const countOf = (k: Tab) =>
    k === "requests"
      ? venueRequests.length
      : classes.filter((c) => bucketOf(c) === k).length + elsewhere.filter((e) => bucketOf(e.danceClass) === k).length;
  const tabs: Tab[] = venueRequests.length > 0 ? ["published", "draft", "completed", "requests"] : ["published", "draft", "completed"];
  /* ⚠ THE OPEN TAB CAN STOP EXISTING UNDER YOU (30 Sep 2026, found by reading
     this back): answering the LAST room request takes Requests out of the pill
     row, and the view was still on it — no rows, no pill, and the empty state
     is guarded against that tab, so the desk went blank. Falling back keeps the
     answer to "what happens after the last one" the obvious one. */
  const tab: Tab = tabs.includes(rawTab) ? rawTab : "published";
  let list = tab === "requests" ? [] : classes.filter((c) => bucketOf(c) === tab);
  if (liveOnly) list = list.filter((c) => isLiveAt(c, nowMs));
  const away = tab === "requests" ? [] : elsewhere.filter((e) => bucketOf(e.danceClass) === tab && (!liveOnly || isLiveAt(e.danceClass, nowMs)));
  const filledOf = (c: DanceClass) => (c.session ? filledBySession[c.session.id] ?? 0 : 0);
  const actionError = publishResult.error || deleteState.error || rowError;

  /* one shape for the two controls that are not forms: mark the row busy, say
     what went wrong if anything did, and re-read the page when it landed */
  const run = async (key: string, fn: () => Promise<{ error: string | null }>) => {
    setBusy(key);
    setRowError(null);
    const out = await fn();
    setBusy(null);
    if (out.error) setRowError(out.error);
    else router.refresh();
  };

  const hiddenRefs = (c: DanceClass) => (
    <>
      <input type="hidden" name="classId" value={c.id} />
      <input type="hidden" name="businessId" value={businessId} />
    </>
  );

  /* the tool's hero (BizShell 2964-2976): the tile's paint, the tile's name,
     and nothing else — "a tool's page says what the tile said" (2960-2962).
     Not drawn when this register sits inside Your classes (18 Sep 2026). */
  const hero = !embedded ? (
        <div
          style={{
            margin: inSections ? "0 0 10px" : "12px 16px 0",
            borderRadius: 22,
            padding: "15px 17px 14px",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
            background: toolPaint(TOOL_COLOUR),
          }}
        >
          <div style={{ position: "absolute", right: -28, top: -32, width: 130, height: 130, borderRadius: 65, background: "rgba(255,255,255,.13)" }} />
          {/* ⚠ the page's own `<h1>` (28 Sep 2026) — the chrome stopped printing a
              drill page's name when the wordmark became constant. It is safe to
              be the heading because this hero is drawn only when the register is
              NOT `embedded`: inside the artist's Manage segment the page above it
              already has one, and two `<h1>`s on a screen name it twice. */}
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: -0.5, position: "relative", fontFamily: DOS_DISPLAY, lineHeight: 1.18 }}>
            Classes
          </h1>
        </div>
      ) : null;

  /* ⚠ THE TOP SECTION (3 Oct 2026, C116) — what chooses the view: Create class
     (or the sentence in its place) and the live filter. The tabs are NOT here:
     they are the sticky row, and a sticky element only sticks inside its own
     parent, so they open the lower section instead. */
  const top = (
      <>
        {/* THE CHIP RAIL IS GONE (18 Sep 2026, the user: "the row below the classes
            heading … which has options like events, students etc. should be
            removed"). Every door it held — Calendar, Media, Students, Rooms,
            Staff, Earnings — is a tile on the studio's own home since 14 Sep. */}

        {/* Create class is the bizBtn pill (14989-14990) — or, when the database
            would refuse a new class here, ITS sentence in the pill's place
            (why_no_class; the `why_no_event` shape the events desk has worn
            since 14 Sep). A closed door that says why beats a form that is
            refused at the end. */}
        {/* ⚠ AND IT IS THE OWNER'S (21 Sep 2026). `create_class_with_session`
            became the owner's alone on 18 Sep — "Until today a trainer could" —
            and this button went on being drawn for EVERY member, so Faculty, a
            visiting teacher, an assistant and the front desk all got a pill that
            opens a two-step form and is refused at Save. `why_no_class` cannot
            catch it: it asks about the BUSINESS (its type, its artist's plan),
            never about who is asking. */}
        {/* ⚠⚠ AND A CLASS IS CREATED FROM ITS OWN SECTION, WHICH IS THIS ONE
            (22 Sep 2026, the user: "class should only be created from home tab",
            then "no, from inside their respective sections, in home tab only").
            So the door stays exactly where it is — the Classes section, reached
            from the Home tab's Classes tile — and what goes is the CALENDAR's
            ＋ Add class, which created a class from a section that is not this
            one. It opens as a sheet over this register now. */}
        {!offerCreate ? null : !canCreate ? (
          <div role="status" data-testid="why-no-class" style={{ ...bizBtn, cursor: "default", background: EL, color: INK, fontWeight: 700, fontSize: 12.5, lineHeight: 1.45, padding: "12px 16px", marginBottom: 12 }}>
            Only the owner of this studio creates and changes its classes. You can open any register you have been given, answer requests for its rooms, and see who is booked.
          </div>
        ) : whyNoClass ? (
          <div role="status" data-testid="why-no-class" style={{ ...bizBtn, cursor: "default", background: EL, color: INK, fontWeight: 700, fontSize: 12.5, lineHeight: 1.45, padding: "12px 16px", marginBottom: 12 }}>
            {whyNoClass}
          </div>
        ) : (
          /* ⚠ the href KEEPS the query it is standing in: this same component is
             embedded in `/my-classes?show=manage`, where a bare `?new=1` would
             drop the segment and switch the list back to Booked underneath the
             sheet it just opened. `/business/{id}/classes/new` is still the page
             behind it (Rule 14). */
          <DeskAddButton label="Create class" href={createHref} />
        )}

        <LiveBanner n={liveN} on={liveOnly} setOn={setLiveOnly} />
      </>
  );

  /* ⚠ THE LOWER SECTION (3 Oct 2026, C116) — the sticky tabs, then the list */
  const body = (
      <>
        {/* the three lifecycles, pinned under the top bar (prototype 14995-15006) */}
        {/* ⚠ an EMBEDDED register (an artist's Manage segment) stands inside
            `/my-classes`' own lower section, so its band wears that section's
            ground too — the page's would cut a stripe across the panel */}
        <div style={{ position: "sticky", top: "var(--dos-top)", zIndex: 120, background: inSections || embedded ? `linear-gradient(var(--card), var(--card)), ${LILAC}` : LILAC, margin: inSections || embedded ? "0 -14px" : "0 -16px", padding: inSections || embedded ? "6px 14px 8px" : "6px 16px 8px", borderRadius: inSections ? "14px 14px 0 0" : undefined }}>
          <div style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3 }}>
            {tabs.map((k) => {
              const on = tab === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${TAB_WORD[k]}, ${countOf(k)} ${k === "requests" ? "requests" : "classes"}`}
                  onClick={() => setTab(k)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "center",
                    padding: "8px 4px",
                    borderRadius: 9,
                    cursor: "pointer",
                    fontSize: 11.5,
                    fontWeight: 800,
                    border: "none",
                    transition: "all .15s",
                    background: on ? LILAC : "transparent",
                    color: on ? INK : SUB,
                    boxShadow: on ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                  }}
                >
                  {TAB_WORD[k]} · {countOf(k)}
                </button>
              );
            })}
          </div>
        </div>

        {actionError && (
          <div role="alert" style={{ fontSize: 12, color: "#EF4444", fontWeight: 700, margin: "8px 0" }}>{actionError}</div>
        )}
        {note && !actionError ? (
          <div role="status" style={{ fontSize: 12, color: "#F59E0B", fontWeight: 700, margin: "8px 0" }}>{note}</div>
        ) : null}

        {tab !== "requests" && list.length === 0 && away.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "22px 16px",
              border: `1.5px dashed ${EL}`,
              borderRadius: 16,
              marginTop: 8,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800 }}>Nothing here yet</div>
            <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>
              {liveOnly
                ? "Nothing is running right now — tap the live filter to show all."
                : tab === "completed"
                  ? "Classes move here once their session is over."
                  : !offerCreate
                    ? "Classes a studio puts you in front of land here once you say yes."
                    : "Create a class — it is saved as a draft, and published here once the yes it waits for is in."}
            </div>
          </div>
        )}

        {/* ⚠⚠ SOMEBODY WANTS ONE OF YOUR ROOMS (30 Sep 2026). Until today the only
            place to answer this was the Inbox: the class belongs to the ARTIST's
            page, so `findClassesByBusiness` never returned it and a studio's
            classes desk said nothing at all while its rooms were being committed.
            ⚠ It draws the app's own class card, exactly as the Inbox's own
            Requests desk does since 27 Sep — the same card, one source, rather
            than a second row shape that can drift. The ACTION is the same RPC the
            Inbox calls, which decides who may answer; this is a second door onto
            one subject, not a second rule. */}
        {tab === "requests" ? (
          <div style={{ marginTop: 8 }}>
            {venueRequests.map((v) => (
              <ClassTile
                key={v.classId}
                danceClass={v.danceClass}
                artist={null}
                href={`/c/${v.shareSlug}`}
                relation="roomRequest"
                actions={
                  <>
                    <span style={{ flexBasis: "100%", fontSize: 10.5, color: SUB, lineHeight: 1.45 }}>
                      <b style={{ color: INK }}>{v.artistName}</b> wants {v.room ?? "a room"} at {v.venueName}. Accepting holds it
                      for them — the class, its bookings and its money stay theirs.
                    </span>
                    <button
                      type="button"
                      disabled={busy === v.classId}
                      onClick={() => run(v.classId, () => respondToVenueRequestAction({ classId: v.classId, accept: false }))}
                      style={pill(true)}
                    >
                      {busy === v.classId ? "…" : "Decline"}
                    </button>
                    <button
                      type="button"
                      disabled={busy === v.classId}
                      onClick={() => run(v.classId, () => respondToVenueRequestAction({ classId: v.classId, accept: true }))}
                      style={{ ...pill(false), background: INK, color: LILAC }}
                    >
                      {busy === v.classId ? "…" : "Accept the room"}
                    </button>
                  </>
                }
              />
            ))}
          </div>
        ) : null}

        <div style={{ marginTop: 8 }}>
          {list.map((c) => {
            const st = publishState[c.id];
            const chips = stateChips(st);
            const chipRow = chips.length ? (
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", flexBasis: "100%" }}>
                {chips.map(([w, tint]) => (
                  <span key={w} style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.4, padding: "3px 8px", borderRadius: 999, background: `${tint}1f`, color: tint, textTransform: "uppercase" }}>
                    {w}
                  </span>
                ))}
              </span>
            ) : null;
            return (
            <ClassTile
              key={c.id}
              danceClass={c}
              filled={filledOf(c)}
              artist={artists[c.id] ?? null}
              href={`/c/${c.shareSlug}`}
              live={isLiveAt(c, nowMs)}
              actions={
                bucketOf(c) === "draft" ? (
                  <>
                    {chipRow}
                    {/* A DECLINED ROOM OFFERS THE WAY OUT IN ONE PRESS (18 Sep 2026): the
                        studio said no, so the class is going nowhere until it is moved —
                        the form's WHERE step is where it is moved, and this names it */}
                    {/* ⚠ EVERY CONTROL FROM HERE DOWN IS THE OWNER'S (30 Sep 2026).
                        RLS has admitted only the owner to `classes` UPDATE since
                        18 Sep, and R55 opened this desk to managers on 28 Sep —
                        so these three were drawn for a seat every one of them
                        refuses. The sentence above the list says so once; drawing
                        them and failing said it three times, badly. */}
                    {canEdit ? (
                      <>
                    {st?.venueStatus === "declined" ? (
                      <Link href={`/business/${businessId}/classes/${c.id}/edit`} style={{ ...pill(true), textDecoration: "none" }}>
                        Pick another studio ›
                      </Link>
                    ) : st?.teacherStatus === "rejected" ? (
                      /* ⚠ THE SAME WAY OUT FOR A TEACHER WHO SAID NO (30 Sep 2026).
                         The chip has said "✕ {name} said no" since 18 Sep and the
                         row offered nothing but Edit — the same dead end a declined
                         room used to be. Who takes the class is named in the form,
                         so the form is where it is changed, and the pill says so. */
                      <Link href={`/business/${businessId}/classes/${c.id}/edit`} style={{ ...pill(true), textDecoration: "none" }}>
                        Ask somebody else ›
                      </Link>
                    ) : (
                      <Link href={`/business/${businessId}/classes/${c.id}/edit`} style={{ ...pill(false), textDecoration: "none" }}>
                        Edit
                      </Link>
                    )}
                    {/* ⚠ AN ASK CAN BE TAKEN BACK FROM HERE (30 Sep 2026). The row
                        has named who it is waiting on since 18 Sep and offered no
                        way to stop waiting: the only door was the Inbox's Sent
                        side or the class page. Same RPC, which decides who may. */}
                    {st?.teacherStatus === "asked" && askedTeachers[c.id] ? (
                      <button
                        type="button"
                        disabled={busy === c.id}
                        onClick={() => run(c.id, () => withdrawClassAskAction({ classPersonId: askedTeachers[c.id] }))}
                        style={pill(false)}
                      >
                        {busy === c.id ? "…" : "Withdraw ask"}
                      </button>
                    ) : null}
                    {/* PUBLISH WAITS FOR A YES (18 Sep 2026): the database's own sentence is
                        what the button says when pressed too early — the same words the
                        trigger would raise, so the screen cannot drift from the rule */}
                    {/* NOT disabled, on purpose (18 Sep 2026): the prototype's own rule
                        for a button that cannot do its job yet is that it NAMES the
                        missing answer rather than greying out (15573-15578). Pressing
                        it says the database's own sentence; it just cannot publish. */}
                    <button
                      type="button"
                      aria-label={st?.why ? `Publish — ${st.why}` : "Publish"}
                      onClick={async () => {
                        if (st?.why) {
                          setNote(st.why);
                          return;
                        }
                        setNote(null);
                        /* the room is asked before the sheet opens (F3) — the class's own
                           room; a venue's rooms are the venue's to read, so the database
                           answers for those at the press */
                        let clash: RoomClash = null;
                        if (c.roomId && c.session && !c.venueBusinessId) {
                          const s = istParts(c.session.startsAt);
                          const e = istParts(c.session.endsAt);
                          clash = await checkRoomClashAction({ businessId, roomId: c.roomId, date: s.date, startTime: s.time, endTime: e.time, excludeClassId: c.id });
                        }
                        setAsk({ kind: "publish", c, clash });
                      }}
                      style={{ ...pill(false), opacity: st?.why ? 0.55 : 1 }}
                    >
                      Publish
                    </button>
                    <button type="button" onClick={() => setAsk({ kind: "draft", c })} style={pill(true)}>
                      Delete
                    </button>
                      </>
                    ) : null}
                  </>
                ) : bucketOf(c) === "published" ? (
                  <>
                    {chipRow}
                    {/* ⚠ NO ROSTER PILL (4 Oct 2026, the user: "remove roster
                        button"). The card opens the class page, whose Attendance
                        tab IS the register; the `/roster` route stays (Rule 14). */}
                    {canEdit ? (
                      <button type="button" onClick={() => setAsk({ kind: "published", c })} style={pill(true)}>
                        Delete
                      </button>
                    ) : null}
                  </>
                ) : (
                  /* a completed class has one move left (15048-15049): its refunds,
                     which live on the class page's own Refunds segment.
                     ⚠ It reaches this branch off the CLOCK now (30 Sep 2026) — a
                     class whose session is over, whatever `status` still says,
                     because nothing in this app has ever written `completed`. */
                  <Link href={`/c/${c.shareSlug}`} style={{ ...pill(false), textDecoration: "none" }}>
                    Refunds
                  </Link>
                )
              }
            />
            );
          })}
        </div>

        {/* the classes you take elsewhere that belong in THIS tab — headed only
            when your own rows are above them, so a tab holding nothing else
            does not wear a heading over its one list */}
        {away.length > 0 ? (
          <div style={{ marginTop: list.length > 0 ? 18 : 8 }} data-testid="classes-elsewhere">
            {list.length > 0 ? (
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: SUB, margin: "0 0 9px" }}>{elsewhereHead} · {away.length}</div>
            ) : null}
            {away.map((e) => (
              <ClassTile
                key={e.id}
                danceClass={e.danceClass}
                artist={e.artist}
                city={e.city}
                href={`/c/${e.danceClass.shareSlug}`}
                live={isLiveAt(e.danceClass, nowMs)}
                relation={elsewhereRelation}
              />
            ))}
          </div>
        ) : null}
      </>
  );

  return (
    <div
      style={{
        background: embedded ? "transparent" : LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: embedded ? undefined : "100vh",
        paddingBottom: embedded ? 0 : 40,
      }}
    >
      {inSections ? (
        <>
          {/* ⚠ THE TOP SECTION (3 Oct 2026, C116) */}
          <DeskTop style={{ margin: "12px 16px 12px", paddingBottom: 4 }}>
            {hero}
            {top}
          </DeskTop>
          {/* ⚠ THE LOWER SECTION (3 Oct 2026, C116) */}
          <DeskBody style={{ margin: "0 16px 16px", paddingTop: 8 }}>{body}</DeskBody>
        </>
      ) : (
        <>
          {hero}
          <div style={{ padding: embedded ? 0 : "12px 16px 0" }}>
            {top}
            {body}
          </div>
        </>
      )}

      {ask?.kind === "publish" && (
        <ConfirmSheet
          title="Publish this class?"
          body={
            ask.clash
              ? `ROOM ALREADY BUSY — ${ask.c.room ?? "that room"} already has ${ask.clash.label} at ${ask.clash.at}. A room is never double-booked: pick another slot from Edit.`
              : `${ask.c.title} · ${schedLine(ask.c)}. It goes on your calendar and anyone can book one of the ${ask.c.capacity} places.`
          }
          keepLabel={ask.clash ? "Back" : "Not yet"}
          goLabel="Publish it"
          goDanger={false}
          onClose={() => setAsk(null)}
          form={(go) =>
            ask.clash ? (
              /* a clashing publish is not offered: the database would refuse it */
              <Link href={`/business/${businessId}/classes/${ask.c.id}/edit`} style={{ flex: 1.3, textAlign: "center", padding: 13, borderRadius: 999, background: INK, color: LILAC, fontWeight: 900, fontSize: 13, textDecoration: "none" }}>
                Change the slot
              </Link>
            ) : (
              <form action={publishFormAction} onSubmit={() => setAsk(null)} style={{ flex: 1.3, display: "flex" }}>
                {hiddenRefs(ask.c)}
                {go}
              </form>
            )
          }
        />
      )}
      {ask?.kind === "draft" && (
        <ConfirmSheet
          title="Delete this draft?"
          body={`${ask.c.title} has never been published, so nobody has booked it — deleting it takes it off your list for good.`}
          keepLabel="Keep it"
          goLabel="Delete draft"
          goDanger
          onClose={() => setAsk(null)}
          form={(go) => (
            <form action={deleteFormAction} onSubmit={() => setAsk(null)} style={{ flex: 1.3, display: "flex" }}>
              {hiddenRefs(ask.c)}
              {go}
            </form>
          )}
        />
      )}
      {ask?.kind === "published" &&
        (() => {
          const n = filledOf(ask.c);
          /* deleting a published class takes money back off people (15098-15104);
             with nobody booked it is a plain delete */
          return (
            <ConfirmSheet
              title="Delete this published class?"
              body={
                n > 0
                  ? `${ask.c.title} · ${n} enrolled ${n === 1 ? "student" : "students"} must be refunded — you'll settle each refund on the next screen.`
                  : `${ask.c.title} comes off the listing immediately. Nobody has booked it, so there is nothing to refund.`
              }
              keepLabel="Keep it"
              goLabel={n > 0 ? "Delete & manage refunds" : "Delete class"}
              goDanger
              onClose={() => setAsk(null)}
              form={(go) => (
                <form
                  action={deleteFormAction}
                  onSubmit={() => {
                    /* a soft-deleted class no longer resolves at its own link, so the
                       refunds are settled from the money desk */
                    if (n > 0) goAfterDelete.current = `/business/${businessId}/earnings`;
                    setAsk(null);
                  }}
                  style={{ flex: 1.3, display: "flex" }}
                >
                  {hiddenRefs(ask.c)}
                  {go}
                </form>
              )}
            />
          );
        })()}
    </div>
  );
}
