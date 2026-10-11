"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFacts, ToolHead, inkOn, toolBtn, type ToolFact } from "@/components/ui/ToolCard";
import { RoutineMediaButton } from "./routine-kit";
import { DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { LearnedRoutine, RoutineWithUsage } from "@/repositories/routines";
import { DOS_TOOLS, DeskHero } from "@/features/businesses/components/biz-kit";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { ColumnCount, columnTab, columnTrack } from "@/components/ui/ColumnTabs";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";

/** ROUTINES (19 Sep 2026, the user: "Routines are just a combination of Music —
 *  link or MP3 — and Video — link"). The prototype's S_choreos (17115), lifted:
 *  New routine over a search box over a row per routine, each row wearing its
 *  two media as chips you can actually press and its usage on the right.
 *
 *  ⚠ THE COUNT ON THE ROW IS CLASSES, and the number under it says so — the
 *  prototype printed `used` with the word "classes" beneath, and this one counts
 *  the same thing from the link rows rather than storing it. Sessions and
 *  students are on the routine's own page, where there is room to say what they
 *  mean. */

/** the head's two small media buttons (11 Oct 2026) */
const HEAD_MEDIA: CSSProperties = { padding: "5px 9px", fontSize: 11, gap: 4, flex: "0 0 auto", minHeight: 0 };

const card: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };

export function RoutinesDesk({
  routines,
  learned = [],
  me = { name: "You", photoPath: null },
}: {
  routines: RoutineWithUsage[];
  /** the maker of every routine on Yours — the card's linked profile (3 Oct 2026) */
  me?: Maker;
  /** ⚠ ROUTINES YOU LEARNED (20 Sep 2026, the user: "routines you learned should
   *  also be a seprate tab in routines section and should be visible to user
   *  profiles as well in tools") — what was taught in a class you actually
   *  turned up to. Attendance, not bookings: the same rule the owner's side of
   *  this desk keeps, and Step 25's. */
  learned?: LearnedRoutine[];
  /* ⚠ NO `canMake` ANY MORE (3 Oct 2026, the user: "users can also create
     routines"). Making one was gated on the Artist plan by the APP alone — the
     live `save_routine` never read the plan — so a plain user was told "an
     artist's tool" about a form the database would have taken. Everybody makes
     routines now; teaching from one on a class is still the class's own rule
     (`can_set_class_routines`). ⚠ NO `userId` either (21 Sep 2026). */
}) {
  /* open where there is something: your own, or — for somebody who has made
     none yet but has been taught some — what they learned */
  const [seg, setSeg] = useState<"mine" | "learned">(routines.length === 0 && learned.length > 0 ? "learned" : "mine");
  const [q, setQ] = useState("");

  const term = q.trim().toLowerCase();
  const list = term ? routines.filter((r) => [r.title, r.style, r.songTitle ?? ""].some((s) => s.toLowerCase().includes(term))) : routines;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      {/* ⚠ NO FLOATING COUNT UNDER THE HERO (20 Sep 2026, the user: "similar
          figures need to be removed from all pages in the app inside the home tab
          for all profiles"). The list below IS the count, and each row already
          wears its own Live / Draft badge — so "4 routines · 3 live" was the page
          reading itself back. ⚠ The counts that STAY are the ones inside a shelf
          head beside its heading (`ManagedScreen`, `/classes`), which is the
          prototype's own DosShelfHead (3446) and a different object. */}
      <DeskTop style={{ margin: "0 0 12px" }}>
      {/* ⚠ THE TOP SECTION (3 Oct 2026, C116): the heading and what chooses the
          list — the two sides, and on Yours the New routine button and the search */}
      <DeskHero tool="routines" as="h1" margin="0" />
      {/* ⚠ ADD ROUTINE UNDER THE HEADING, ABOVE THE COLUMNS (11 Oct 2026, the
          user: "add routine below the heading above the column"). It opens over
          this desk at `?new=1` (22 Sep 2026; `/routines/new` forwards here, Rule
          14) — `?new=1` is PUSHED, so back closes the sheet. "Add Routine" since
          4 Oct 2026. */}
      <DeskAddButton label="Add Routine" href="?new=1" inTop />

      {/* ── YOURS · LEARNED (20 Sep 2026) — the two sides of a routine: the ones
          you made and teach from, and the ones you were taught. Client state,
          not a URL: both lists are already on the page, so switching is free and
          there is nothing for a server to fetch (the lag the user reported on
          the class columns is a round trip; this one has none). ── */}
      {/* ⚠ the app's one column look (`ColumnTabs`, 11 Oct 2026): the count is the
          badge inside the column; the accessible name still reads "Yours · 3" */}
      <div role="group" aria-label="Show" style={{ ...columnTrack(), marginTop: 12, marginBottom: seg === "learned" ? 0 : 11 }}>
        {([["mine", "Yours", routines.length], ["learned", "Learned", learned.length]] as const).map(([k, word, n]) => (
          <button key={k} type="button" onClick={() => setSeg(k)} aria-pressed={seg === k} aria-label={`${word} · ${n}`} style={columnTab(seg === k)}>
            <span>{word}</span>
            <ColumnCount n={n} on={seg === k} />
          </button>
        ))}
      </div>

      {seg === "learned" ? null : (
        <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "9px 11px", marginBottom: 0 }}>
        <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 13 }}>
          ⌕
        </span>
        <input aria-label="Search routines" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routines, styles or songs…" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: INK, fontSize: 12.5, fontFamily: "inherit" }} />
      </div>
        </>
      )}
      </DeskTop>

      <DeskBody style={{ margin: "0" }}>
      {/* ⚠ THE LOWER SECTION (3 Oct 2026, C116): the routines themselves */}
      {seg === "learned" ? (
        <>
          <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, padding: "0 2px 10px" }}>
            What was taught in a class you turned up to. It counts <b>attendance</b>, not bookings — a seat nobody marked is not a session danced.
          </div>
          {learned.map((r) => (
            <LearnedRow key={`${r.id}-${r.classId}`} r={r} />
          ))}
          {learned.length === 0 ? (
            <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)" }}>
              Nothing yet. A routine appears here once you have been checked in to a class that was taught from one.
            </div>
          ) : null}
        </>
      ) : (
        <>
      {list.map((r) => (
        <RoutineRow key={r.id} r={r} me={me} />
      ))}
      {list.length === 0 ? (
        <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)" }}>
          {routines.length === 0 ? "No routines yet. A routine is a song and a video — add one, then put it on a class from the class's own page." : "No routines match that."}
        </div>
      ) : null}
        </>
      )}
      </DeskBody>
    </div>
  );
}

/** A ROUTINE CARD (3 Oct 2026, the user: "proper routine cards"). Both sides of
 *  this desk draw the same card, so a routine you made and one you were taught
 *  read as the same object: a band in the routine's STYLE colour with the style,
 *  the level and its status; then the routine's name at the size of a name, its
 *  figure on the right, and the song and the video as two real buttons.
 *
 *  ⚠ A CARD THAT OPENS, WITH LINKS INSIDE IT. These rows were a `<Link>` holding
 *  two more `<a>`s, and an anchor inside an anchor is invalid HTML: the parser
 *  splits them, the server's markup and the client's tree disagree, and React
 *  threw a hydration error (#418) and rebuilt the whole desk on the client, on
 *  every visit, for every artist with a routine since 19 Sep — found by a plain
 *  user making their first one. So the card is a plain container, ONE link
 *  stretched over it is what a press on the card hits, and the content sits above
 *  it with pointer events off — except the two media buttons, which switch them
 *  back on and stay real links of their own (the studio card's pattern). */
/** ⚠⚠ RE-CUT ON THE SHARED TOOL CARD (3 Oct 2026, the user: *"better and bigger
 *  cards … each has a profile linked to it which should be visible with profile
 *  pic and name and big … buttons segregated"*). A routine belongs to a PERSON,
 *  so the profile it is linked to is WHOEVER MADE IT — you on Yours, the artist on
 *  Learned — and that face and name lead. Then the routine itself in its style's
 *  colour, its figures as tiles, and the song and the video on the action bar,
 *  which is where buttons live on every tool card now. */
function RoutineCard({
  href,
  label,
  testId,
  title,
  style,
  level,
  status,
  sub,
  song,
  video,
  maker,
  facts,
  detail,
}: {
  href: string;
  label: string;
  testId: string;
  title: string;
  style: string;
  level: string;
  /** a word for the head's right edge — LIVE, DRAFT, LEARNED */
  status: { word: string; strong: boolean };
  /** a line under the routine's name, e.g. the studio it was taught at */
  sub?: string | null;
  /** `short` is the head button's word (Song · MP3); `title` the song's own name,
   *  printed in the body under the routine's name when there is one */
  song: { href: string | null; short: string; title?: string | null };
  video: string | null;
  /** WHO MADE IT — the profile the card is linked to */
  maker: { name: string; photoPath: string | null; eyebrow: string };
  facts: ToolFact[];
  /** the routine's own page, as a button beside its song and video (4 Oct 2026) */
  detail?: string;
}) {
  const col = dosStyleColor(style);

  return (
    <ToolCard testId={testId} href={href} hrefLabel={label}>
      <ToolHead
        /* the TOOL's colour on the head (a style colour can be too light for an
           eyebrow on a light card); the style's own colour is on the routine */
        tint={DOS_TOOLS.routines.c}
        name={maker.name}
        photoPath={maker.photoPath}
        eyebrow={maker.eyebrow}
        /* ⚠ SMALLER (4 Oct 2026, the user: "smaller card size for routines"):
           a 40px face and tighter bands — the routine's NAME is what the card is
           about, and it is now the biggest thing on it */
        size={40}
        /* ⚠ SONG AND VIDEO IN THE UPPER HALF, ON THE RIGHT (11 Oct 2026, the user:
           "song and video button on routine card on upper half on right side") —
           under the status chip, small, each still its own link above the card's
           stretched one (`pointerEvents: auto`). The accessible names are the
           ones the bar's buttons had ("Open the song for …"). */
        right={
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, pointerEvents: "auto" }}>
            <ToolChip word={status.word} fg={status.strong ? "#22C55E" : SUB} bg={status.strong ? "#22C55E1c" : "var(--el)"} />
            <span data-testid="routine-media" style={{ display: "flex", gap: 5 }}>
              <RoutineMediaButton kind="song" href={song.href} word={song.short} title={title} extra={HEAD_MEDIA} />
              <RoutineMediaButton kind="video" href={video} word="Video" title={title} extra={HEAD_MEDIA} />
            </span>
          </span>
        }
      />
      <ToolBody style={{ padding: "10px 14px 11px" }}>
        {/* the routine itself — its name first and biggest (⚠ no "ROUTINE" kicker
            over it any more, 4 Oct 2026: the desk is Routines, so the word said
            the page's own name back), its style and level as pills beside where
            it was taught */}
        <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: -0.35, lineHeight: 1.2, overflowWrap: "anywhere" }}>{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 900, padding: "3px 9px", borderRadius: 999, background: col, color: inkOn(col) }}>{style}</span>
          <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: "var(--el)", color: SUB }}>{DOS_LEVEL_LABEL[level] ?? level}</span>
          {sub ? <span style={{ fontSize: 11, color: SUB, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>at {sub}</span> : null}
        </div>
        {song.title ? (
          <div style={{ fontSize: 11, color: SUB, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>♪ {song.title}</div>
        ) : null}
        <ToolFacts tint={col} items={facts} style={{ marginTop: 9 }} />
      </ToolBody>
      {/* ⚠ ROUTINE DETAIL keeps the bar (4 Oct 2026, the user: "Another Routine
          Detail Button") — the card still opens it too. A learned routine has no
          detail page of yours to open, so it draws no bar at all. */}
      {detail ? (
        <ToolActions>
          <Link href={detail} style={toolBtn("tinted", DOS_TOOLS.routines.c, { padding: "8px 10px" })}>
            Routine Detail
          </Link>
        </ToolActions>
      ) : null}
    </ToolCard>
  );
}

/** ONE ROUTINE YOU LEARNED — its two media, the class it was taught in, and how
 *  many of that class's sessions you actually turned up to.
 *
 *  ⚠ THE CARD OPENS THE CLASS, not the routine's own page: `/routines/{id}` is the
 *  OWNER's usage screen — who danced it, how often — and who attended a class is
 *  not a fact the platform hands to somebody who was in the room. The song and
 *  the video are the part that is yours to keep, and they are on the card. */
function LearnedRow({ r }: { r: LearnedRoutine }) {
  const songHref = r.songUrl ? (r.songIsFile ? photoUrl(r.songUrl) : r.songUrl) : null;
  const when = r.lastOn ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(r.lastOn)) : null;
  return (
    <RoutineCard
      href={`/c/${r.shareSlug}`}
      label={`Open the class ${r.title} was taught in`}
      testId="learned-row"
      title={r.title}
      style={r.style}
      level={r.level}
      sub={r.businessName}
      status={{ word: "LEARNED", strong: false }}
      song={{ href: songHref, short: r.songIsFile ? "MP3" : "Song" }}
      video={r.videoUrl}
      maker={{ name: r.ownerName ?? "The artist", photoPath: r.ownerPhotoPath, eyebrow: "Routine by" }}
      /* no Sessions on a routine card (4 Oct 2026, the user: "Remove sessions
         from routine cards") */
      facts={[{ label: "Last danced", value: when ?? "—" }]}
    />
  );
}

/** One routine of yours: opens its usage page, and counts the classes that carry it. */
function RoutineRow({ r, me }: { r: RoutineWithUsage; me: Maker }) {
  const songHref = r.songUrl ? (r.songIsFile ? photoUrl(r.songUrl) : r.songUrl) : null;
  return (
    <RoutineCard
      href={`/routines/${r.id}`}
      label={`Open ${r.title}`}
      testId="routine-row"
      title={r.title}
      style={r.style}
      level={r.level}
      status={r.status === "draft" ? { word: "DRAFT", strong: false } : { word: "LIVE", strong: true }}
      song={{ href: songHref, short: r.songIsFile ? "MP3" : "Song", title: r.songTitle }}
      video={r.videoUrl}
      detail={`/routines/${r.id}`}
      maker={{ name: me.name, photoPath: me.photoPath, eyebrow: "Routine" }}
      facts={[
        /* no Sessions on a routine card (4 Oct 2026, the user: "Remove sessions
           from routine cards") */
        { label: r.classes === 1 ? "Class" : "Classes", value: r.classes, testId: "routine-classes" },
        { label: r.students === 1 ? "Student" : "Students", value: r.students },
      ]}
    />
  );
}

type Maker = { name: string; photoPath: string | null };
