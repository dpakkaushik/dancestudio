"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { LearnedRoutine, RoutineWithUsage } from "@/repositories/routines";
import { DeskHero } from "@/features/businesses/components/biz-kit";
import { DeskAddButton } from "@/features/settings/components/settings-kit";

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

const card: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 16, padding: "13px 14px", marginBottom: 10 };

export function RoutinesDesk({
  routines,
  learned = [],
}: {
  routines: RoutineWithUsage[];
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
      <DeskHero tool="routines" as="h1" margin="0 0 12px" />

      {/* ── YOURS · LEARNED (20 Sep 2026) — the two sides of a routine: the ones
          you made and teach from, and the ones you were taught. Client state,
          not a URL: both lists are already on the page, so switching is free and
          there is nothing for a server to fetch (the lag the user reported on
          the class columns is a round trip; this one has none). ── */}
      <div role="group" aria-label="Show" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 11 }}>
        {([["mine", `Yours · ${routines.length}`], ["learned", `Learned · ${learned.length}`]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setSeg(k)} aria-pressed={seg === k} style={{ flex: 1, padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, border: "none", cursor: "pointer", fontFamily: "inherit", background: seg === k ? "var(--solid)" : "transparent", color: seg === k ? INK : SUB }}>
            {label}
          </button>
        ))}
      </div>

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
      {/* ⚠ THE FORM OPENS OVER THIS DESK (22 Sep 2026, the user: "All forms and
          add buttons anywhere in home tab should open form like how setting page
          or edit profile page open from the same screen"). It is the SAME form
          wearing the SAME `FormPage` anatomy it has worn since 21 Sep — only its
          shell differs — and `/routines/new` still renders it full-page, because
          a link handed out is a promise (Rule 14) and the installed TWA reopens
          on the last URL it showed.
          ⚠ `?new=1` is PUSHED, exactly as the gear pushes `?settings=1`: the
          param IS the history entry, so the phone's back gesture closes the
          sheet instead of leaving the desk. */}
      <DeskAddButton label="New routine" href="?new=1" />

      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "9px 11px", marginBottom: 10 }}>
        <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 13 }}>
          ⌕
        </span>
        <input aria-label="Search routines" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search routines, styles or songs…" style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: INK, fontSize: 12.5, fontFamily: "inherit" }} />
      </div>

      {list.map((r) => (
        <RoutineRow key={r.id} r={r} />
      ))}
      {list.length === 0 ? (
        <div style={{ ...card, textAlign: "center", fontSize: 12, color: SUB, border: "1.5px dashed var(--el)" }}>
          {routines.length === 0 ? "No routines yet. A routine is a song and a video — add one, then put it on a class from the class's own page." : "No routines match that."}
        </div>
      ) : null}
        </>
      )}
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
  figure,
}: {
  href: string;
  label: string;
  testId: string;
  title: string;
  style: string;
  level: string;
  /** a word for the band's right edge — LIVE, DRAFT, or the day it was last danced */
  status: { word: string; strong: boolean };
  /** a line under the style, e.g. the studio it was taught at */
  sub?: string | null;
  song: { href: string | null; word: string };
  video: string | null;
  figure: { n: number; word: string; testId?: string };
}) {
  const col = dosStyleColor(style);
  const media = (kind: "song" | "video", href: string | null, word: string) => {
    const icon =
      kind === "song" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18V5l11-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="17" cy="16" r="3" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z" />
        </svg>
      );
    const box: CSSProperties = {
      pointerEvents: href ? "auto" : "none",
      flex: 1,
      minWidth: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      padding: "9px 10px",
      borderRadius: 999,
      background: "var(--el)",
      border: `1.5px solid ${href ? `${col}55` : "var(--el)"}`,
      color: href ? INK : "var(--muted)",
      fontSize: 12,
      fontWeight: 800,
      textDecoration: "none",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    };
    return href ? (
      <a href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`Open the ${kind} for ${title}`} style={box}>
        {icon}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{word}</span>
      </a>
    ) : (
      <span style={box}>
        {icon}
        No {kind}
      </span>
    );
  };

  return (
    <div data-testid={testId} style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "var(--card)", border: "1.5px solid var(--el)", marginBottom: 12, color: INK }}>
      <Link href={href} aria-label={label} style={{ position: "absolute", inset: 0, zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, pointerEvents: "none" }}>
        {/* the band — the style's own colour, darkened a touch so white reads on a
            light one too */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "12px 14px",
            background: `linear-gradient(0deg, rgba(0,0,0,.16), rgba(0,0,0,.16)), linear-gradient(135deg, ${col}, ${col}bb)`,
            color: "#fff",
          }}
        >
          <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.2)" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l11-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="17" cy="16" r="3" />
            </svg>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 15, fontWeight: 900, letterSpacing: -0.2, textShadow: "0 1px 3px rgba(0,0,0,.25)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{style}</span>
            <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "rgba(255,255,255,.88)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {DOS_LEVEL_LABEL[level] ?? level}
              {sub ? ` · ${sub}` : ""}
            </span>
          </span>
          <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 0.8, padding: "4px 9px", borderRadius: 999, background: status.strong ? "#fff" : "rgba(0,0,0,.24)", color: status.strong ? col : "#fff" }}>{status.word}</span>
        </div>

        <div style={{ padding: "12px 14px 14px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 900, letterSpacing: -0.3, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{title}</span>
            <span style={{ flexShrink: 0, textAlign: "right" }}>
              <span data-testid={figure.testId} style={{ display: "block", fontSize: 20, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {figure.n}
              </span>
              <span style={{ display: "block", fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: "var(--muted)", marginTop: 3 }}>{figure.word}</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {media("song", song.href, song.word)}
            {media("video", video, "Video")}
          </div>
        </div>
      </div>
    </div>
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
      status={{ word: when ? `LAST ${when.toUpperCase()}` : "LEARNED", strong: false }}
      song={{ href: songHref, word: r.songIsFile ? "MP3" : "Song" }}
      video={r.videoUrl}
      figure={{ n: r.sessions, word: r.sessions === 1 ? "SESSION" : "SESSIONS" }}
    />
  );
}

/** One routine of yours: opens its usage page, and counts the classes that carry it. */
function RoutineRow({ r }: { r: RoutineWithUsage }) {
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
      song={{ href: songHref, word: r.songTitle ?? (r.songIsFile ? "MP3" : "Song") }}
      video={r.videoUrl}
      figure={{ n: r.classes, word: r.classes === 1 ? "CLASS" : "CLASSES", testId: "routine-classes" }}
    />
  );
}
