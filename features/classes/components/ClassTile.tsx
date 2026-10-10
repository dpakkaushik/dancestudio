"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ToolActions, ToolBody, ToolFace } from "@/components/ui/ToolCard";
import { dosStyleColor, DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_DISPLAY, GREEN, INK, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { dosStyleInk } from "@/lib/format/styleInk";
import { compactRangeOf, dateParts, timeOf } from "@/lib/format/session";
import { CLASS_RELATION, type ClassRelation } from "@/lib/format/classLabels";
import type { ClassOwner, DanceClass } from "@/types/class";
import { useDosDark } from "./poster";

/** The seats, written ON the bar (4 Oct 2026, the user: "spots left should be
 *  written like 2/20 Booked · 18 Spots Left on the bar"): what is taken against
 *  what there is, then what is left — the fraction AND the decision, in one line
 *  the bar's own fill sits under. A full class says so instead of "0 left".
 *  `fill` is the bar's colour: amber at the last three places, red when full. */
export const seatsOf = (taken: number, cap: number) => {
  const left = Math.max(0, cap - taken);
  const pct = cap > 0 ? Math.min(100, Math.round((100 * taken) / cap)) : 0;
  const booked = `${taken}/${cap} Booked`;
  if (left <= 0) return { booked, left: "Class full", txt: `${booked} · Class full`, pct: 100, fill: "#F87171" };
  const leftWord = `${left} Spot${left === 1 ? "" : "s"} Left`;
  return { booked, left: leftWord, txt: `${booked} · ${leftWord}`, pct, fill: left <= 3 ? "#F59E0B" : null };
};

/** THE SEAT BAR — a capsule the fill rises through, the words written on it.
 *  Shared by the card and the class page so the two cannot describe one class
 *  two ways. The fill is the style's colour at a third of its strength (the
 *  ink reads over it in both themes) with a solid strip along its foot. */
export function SeatBar({ taken, cap, tint, note, height = 26, testId = "class-fact-spots", leftWord }: { taken: number; cap: number; tint: string; note?: string | null; height?: number; testId?: string; /** replaces "N Spots Left" — a class that is over has none to offer */ leftWord?: string }) {
  const raw = seatsOf(taken, cap);
  const s = leftWord ? { ...raw, left: leftWord, txt: `${raw.booked} · ${leftWord}`, fill: null } : raw;
  const col = s.fill ?? tint;
  return (
    <span
      role="img"
      aria-label={`${s.txt}${note ? ` · ${note}` : ""}`}
      data-testid="class-seat-bar"
      data-pct={s.pct}
      style={{ position: "relative", display: "block", flex: 1, minWidth: 0, height, borderRadius: 999, background: "var(--el)", overflow: "hidden" }}
    >
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${s.pct}%`, background: `${col}57`, transition: "width .3s" }}>
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: col }} />
      </span>
      <span
        data-testid={testId}
        aria-hidden="true"
        style={{ position: "relative", display: "flex", alignItems: "center", height: "100%", padding: "0 11px", gap: 5, fontSize: 11.5, fontWeight: 900, color: INK, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        <span>{s.booked}</span>
        <span style={{ color: SUB, fontWeight: 700 }}>·</span>
        <span style={{ color: s.fill === "#F87171" ? "#EF4444" : INK }}>{s.left}</span>
        {note ? <span style={{ color: MUTED, fontWeight: 700 }}>· {note}</span> : null}
      </span>
    </span>
  );
}

/** THE WHEN TILE — the day, the date and the time in ONE tile (4 Oct 2026, the
 *  user: "Date, Time, Day together in one tile"), on the card and on the class
 *  page. The two parts keep their old test ids so a probe still finds each. */
export function WhenTile({ startsAt, endsAt = null, isToday = false, tint, extra, big = false }: { startsAt: string | null; endsAt?: string | null; isToday?: boolean; tint: string; extra?: string | null; big?: boolean }) {
  const p = startsAt ? dateParts(startsAt) : null;
  const day = p ? (isToday ? "Today" : p.weekday.charAt(0) + p.weekday.slice(1).toLowerCase()) : "Date";
  /* three letters for the month ("Sep", not "Sept") — the one line has to fit */
  const date = p ? `${p.day} ${p.month.charAt(0)}${p.month.slice(1, 3).toLowerCase()}` : "to be set";
  /* the START AND THE END (5 Oct 2026, the user: "should show both start and end
     time on the class cards") — "6–7 pm", as short as the range can be said, so
     date · day · time fit ONE line (the user: "keep date day and time in the
     same line"). ⚠ The longest lines step the type down a little rather than
     spill: measured, "30 Sep · Today · 10:30am–12pm" was the widest case */
  const time = startsAt ? (endsAt ? compactRangeOf(startsAt, endsAt) : timeOf(startsAt)) : "—";
  const len = `${date}${day}${time}`.length;
  const fs = big ? (len <= 22 ? 18 : 16) : len <= 20 ? 14.5 : len <= 22 ? 13.5 : len <= 23 ? 12.5 : 12;
  return (
    <div
      data-testid="class-fact-when"
      style={{ display: "flex", alignItems: "center", gap: big ? 11 : 9, borderRadius: 14, background: `${tint}12`, border: "1.5px solid var(--el)", padding: big ? "12px 14px" : "9px 11px", minWidth: 0 }}
    >
      <span aria-hidden="true" style={{ flexShrink: 0, width: big ? 34 : 25, height: big ? 34 : 25, borderRadius: 9, background: `${tint}26`, color: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={big ? 18 : 14} height={big ? 18 : 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
          <path d="M8 3v4M16 3v4M3.5 10h17" />
        </svg>
      </span>
      {/* the DATE before the day (5 Oct 2026, the user: "Class cards- Date
          before day"), then the START–END, ALL ON ONE LINE (the user, the same
          day: "keep date day and time in the same line") — the line never
          breaks inside itself; what keeps it inside a 360px card is the compact
          range and the tile's own size, measured by the probe at 360 and 390 */}
      <span style={{ minWidth: 0, display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 8px", fontSize: fs, fontWeight: 900, letterSpacing: -0.3, lineHeight: 1.15, color: INK, fontVariantNumeric: "tabular-nums" }}>
        {/* ⚠ ONE LINE from 360px up, measured with the widest range there is;
            on a 320px phone the longest lines still cannot fit, and there the
            time wraps rather than spilling out of the tile */}
        <span style={{ display: "inline-flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 6px", minWidth: 0 }}>
          <span data-testid="class-fact-date" style={{ whiteSpace: "nowrap" }}>{date}</span>
          <span aria-hidden="true" style={{ color: MUTED, fontWeight: 700 }}>·</span>
          <span data-testid="class-fact-day" style={{ whiteSpace: "nowrap" }}>{day}</span>
          <span aria-hidden="true" style={{ color: MUTED, fontWeight: 700 }}>·</span>
          <span data-testid="class-fact-time" style={{ whiteSpace: "nowrap" }}>{time}</span>
        </span>
        {extra ? <span style={{ fontSize: fs - 5, fontWeight: 800, color: SUB, letterSpacing: 0, whiteSpace: "nowrap" }}>{extra}</span> : null}
      </span>
    </div>
  );
}

export interface ClassTileArtist {
  name: string;
  avatarPath: string | null;
  userId?: string;
}

export interface ClassTileProps {
  danceClass: DanceClass;
  /** ClassBooking count — 0 until Step 4 wires bookings. */
  filled?: number;
  /** ⚠ ACCEPTED AND NEVER PRINTED (18 Sep 2026). The card draws who made the
   *  class from `danceClass.owner` — the shaded half of the head — which
   *  carries the kind and the picture this string never could. */
  businessName?: string | null;
  /** Accepted for the callers that already pass it; the card does not print it
   *  (8443-8449) — the class page carries the venue's address. */
  city?: string | null;
  /** THE TEACHER TAKING IT — the artist half of the head wears their face and
   *  name. Without one (a draft nobody has accepted yet, or a signed-out reader
   *  who may not read `profiles`) that half says so. */
  artist?: ClassTileArtist | null;
  /** A card on your own day says "Today" in the date tile rather than the date
   *  (8322-8325). */
  isToday?: boolean;
  /** Owner-side action pills rendered on the card's own button bar. */
  actions?: ReactNode;
  /** When set, the whole card opens the class detail page (actions stay outside the link). */
  href?: string;
  /** WHAT THIS CLASS IS TO YOU — Booked, Teaching, Assisting, At your studio, or
   *  an ask (prototype 8430-8432). ⚠ ONE WORD LIST SINCE 4 Oct 2026
   *  (`lib/format/classLabels.ts`): each relation has one word and one colour,
   *  and it is always this chip — never a tag in the button row under the card. */
  relation?: ClassRelation | null;
  /** the ONE running session — a LIST decides which of its rows wears the badge
   *  (8148-8153); nobody else sets it */
  live?: boolean;
  /** ⚠ YOU ARE IN THE ROOM (2 Oct 2026) — Home's deck sets it off your live
   *  attendance row; a green stamp in the relation chip's place */
  checkedIn?: boolean;
  /** ⚠ HOME'S DECK ONLY (2 Oct 2026) — where this card stands in today, decided
   *  by the deck's list. `live` keeps the green frame; `done` is red with
   *  COMPLETED, `upcoming` amber with UPCOMING. Every other surface passes none. */
  deckState?: "done" | "live" | "upcoming";
}

/* the deck's two non-live frames — red and amber that read on both grounds */
const DECK_FRAME = {
  done: { c: "#EF4444", ink: "#fff", glow: "rgba(239,68,68,.16)", word: "Completed", testId: "done-badge" },
  /* dark ink on amber — white on #F59E0B is ~2:1 and would not read */
  upcoming: { c: "#F59E0B", ink: "#1a1406", glow: "rgba(245,158,11,.16)", word: "Upcoming", testId: "upcoming-badge" },
} as const;

/* the dancer mark for a half with nobody to draw */
export const DancerIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="13" cy="4.5" r="2" />
    <path d="M12 7.5 8 11l3 2-1 7" />
    <path d="M12 7.5 16.5 9l3 3.5" />
    <path d="M10.5 13.5 16 15l2.5 5" />
  </svg>
);

const CHIP: CSSProperties = { flexShrink: 0, fontSize: 9, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", padding: "4px 9px", borderRadius: 999 };

/** ONE HALF OF THE HEAD — the artist on the left, the studio on the right, the
 *  same face and the same type on both. The right half is MIRRORED (face on the
 *  outer edge, words toward the centre), so the two read as a pair rather than
 *  as a list of two. The maker's half wears the darker shade. */
export function Half({
  side,
  tint,
  name,
  photoPath,
  eyebrow,
  icon,
  made,
  mirrored,
  title,
  href,
  hrefLabel,
  big = false,
  dim = false,
  confirmed = false,
}: {
  side: "artist" | "studio";
  tint: string;
  name: string;
  photoPath: string | null;
  eyebrow: ReactNode;
  icon?: ReactNode;
  made: boolean;
  mirrored: boolean;
  title?: string;
  /** THE CLASS PAGE'S HALVES ARE DOORS (4 Oct 2026) — a card's are not, because
   *  the card is ONE stretched link and a link inside a link is interactive
   *  inside interactive. */
  href?: string;
  hrefLabel?: string;
  /** the page's larger face and name */
  big?: boolean;
  /** an ask nobody has answered yet — the studio's own people see it, dimmed */
  dim?: boolean;
  /** ⚠ THIS SIDE HAS SAID YES (4 Oct 2026, the user: "artist confirmed and
   *  studio confirmed should cover the profile pic in green border for that
   *  confirmation") — the face wears a green ring. The artist: a confirmed
   *  teacher. The studio: the room said yes, or it made the class. An ask
   *  nobody has answered, and "No teacher yet", wear none. */
  confirmed?: boolean;
}) {
  const style: CSSProperties = {
    flex: "1 1 0",
    minWidth: 0,
    display: "flex",
    flexDirection: mirrored ? "row-reverse" : "row",
    alignItems: "center",
    gap: big ? 12 : 10,
    padding: big ? "16px 14px 15px" : "13px 12px 12px",
    /* ⚠ THE SHADE IS THE WORD "created by" (4 Oct 2026, the user: "highlighted
       with left or right side between artist and studio in a darker shade to
       represent that") — the maker's half is deeper, the other quiet */
    background: made ? `linear-gradient(135deg, ${tint}5c, ${tint}38)` : `linear-gradient(135deg, ${tint}16, ${tint}08)`,
    borderLeft: mirrored ? `1.5px solid ${tint}33` : undefined,
    color: INK,
    textDecoration: "none",
  };
  const inner = (
    <>
      <span
        data-testid={confirmed ? `${side}-confirmed` : undefined}
        title={confirmed ? "Confirmed" : undefined}
        style={{ flexShrink: 0, opacity: dim ? 0.55 : 1, display: "inline-flex" }}
      >
        <ToolFace name={name} photoPath={photoPath} tint={tint} size={big ? 56 : 46} icon={icon} ring={confirmed ? GREEN : undefined} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "block", textAlign: mirrored ? "right" : "left" }}>
        <span style={{ display: "block", fontSize: big ? 9.5 : 9, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: tint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eyebrow}</span>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", marginTop: 2, fontFamily: DOS_DISPLAY, fontSize: big ? 16.5 : 14.5, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.18, color: INK }}>{name}</span>
      </span>
    </>
  );
  const common = {
    "data-testid": made ? "class-owner" : undefined,
    "data-owner-kind": made ? side : undefined,
    "data-half": side,
    title,
  };
  return href ? (
    <Link href={href} aria-label={hrefLabel ?? `Open ${name}`} {...common} style={style}>
      {inner}
    </Link>
  ) : (
    <div {...common} style={style}>
      {inner}
    </div>
  );
}

/**
 * The one class card, app-wide — ON THE TOOL CARD'S ANATOMY since 4 Oct 2026
 * (the user: "redesign the class cards according to how we have done for other
 * tool cards everywhere"). Three bands:
 *
 *   1. THE TWO PROFILES — the ARTIST taking it on the left and the STUDIO on
 *      the right, same face, same type, over the style's own colour; the one
 *      who MADE the class wears the darker shade (the user: "class created by
 *      artist or studio to be removed and should be highlighted with left or
 *      right side"). A studio's class: the studio is the maker. An artist's:
 *      the artist is, and the right half is the studio whose room said yes —
 *      or nothing, at the artist's own place.
 *   2. THE CLASS — the style's name in its own ink with the level, and what the
 *      class is to you as the chip on that line; then Date · Time as figure
 *      tiles; then the fill bar with the spots left under it and the price
 *      beside them.
 *   3. THE BUTTONS — whatever the page offers, on a bar of their own.
 *
 * ⚠ A card that opens is ONE stretched link under everything (`href`), the
 * bands with pointer events off, and the button bar switched back on — the
 * studio card's pattern, so a button is never inside an anchor. The frame
 * keeps its own paint rules (a live class green, the deck's red and amber).
 */
export function ClassTile({ danceClass: c, filled = 0, artist, isToday = false, actions, href, relation = null, live: liveProp = false, checkedIn = false, deckState }: ClassTileProps) {
  const rel = relation ? CLASS_RELATION[relation] : null;
  const owner: ClassOwner | null = c.owner ?? null;
  const venue: ClassOwner | null = c.venue ?? null;
  const live = deckState ? deckState === "live" : liveProp;
  const frame = deckState === "done" || deckState === "upcoming" ? DECK_FRAME[deckState] : null;
  const bc = dosStyleColor(c.style);
  const dark = useDosDark();
  const ink = dosStyleInk(bc, dark);
  const priceAmt = c.priceInr === 0 ? "Free" : `₹${c.priceInr}`;
  const levelWord = DOS_LEVEL_LABEL[c.level] ?? c.level;
  const isPast = c.status === "completed";
  /* A CLASS IS ITS STYLE (8032-8036): the heading is the dance style, always. */
  const headText = c.style || c.title || "Class";
  /* what a status says, beside the spots — not a fourth band */
  const note = c.status === "draft" ? "Draft" : c.status === "completed" ? "Completed" : null;

  /* ⚠ NO POSTER ON THE CARD (10 Oct 2026, the user: "no poster on class cards
     only inside card details"). The 3 Oct strip is gone from every card; the
     class page's sleeve is the one place the poster is drawn. */

  /* WHERE THE CLASS STANDS IN TIME — Live, or the deck's Completed / Upcoming —
     a solid pill on the title line beside the relation chip, where every other
     tool card wears its status. ⚠ Not in a half's eyebrow: a 163px half holds
     a face and a name, and the pill squeezed "ARTIST" into an ellipsis (seen). */
  const timeBadge = live ? (
    <span data-testid="live-badge" style={{ ...CHIP, display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px 4px 7px", background: "#22C55E", color: "#fff" }}>
      <span style={{ position: "relative", width: 5, height: 5 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: 3, background: "#fff" }} />
        <span style={{ position: "absolute", inset: -3, borderRadius: 6, border: "1.5px solid #fff", opacity: 0.5, animation: "dosPulseH 1.4s ease-out infinite" }} />
      </span>
      Live
    </span>
  ) : frame ? (
    <span data-testid={frame.testId} style={{ ...CHIP, background: frame.c, color: frame.ink }}>
      {frame.word}
    </span>
  ) : null;

  /* THE TWO HALVES. The artist half is the confirmed teacher; with none it is
     the maker when the maker IS an artist (their own class, nobody else to
     name), and otherwise says so. The studio half is the maker when the maker
     is a studio, else the venue that said yes, else nothing — and then the
     artist half spans the card. */
  const artistMade = owner?.kind === "artist";
  const studioMade = owner?.kind === "studio";
  const studioSide: ClassOwner | null = studioMade ? owner : venue;
  const artistSide = artist
    ? { name: artist.name, photoPath: artist.avatarPath, icon: undefined as ReactNode }
    : artistMade && owner
      ? { name: owner.name, photoPath: owner.photoPath, icon: undefined as ReactNode }
      : { name: "No teacher yet", photoPath: null, icon: DancerIcon };
  const madeBy = owner ? `Created by ${owner.name} — ${owner.kind === "artist" ? "an artist" : "a studio"}` : undefined;
  /* ⚠ THE GREEN RING IS A DRAFT'S ALONE (4 Oct 2026, the user: "remove green ring
     from class cards after published. green ring should not be visible on
     discover schedule"). It says which side has said yes while the class waits
     for its yeses; a published class needed every one of them to publish, so
     there it would say the same thing on every card — and Discover and a public
     schedule only ever draw published classes. */
  const ringsOn = c.status === "draft";

  /* the chip on the title line: CHECKED IN outranks the relation (2 Oct 2026) —
     once the door has let you in, "Booked" is yesterday's news */
  const titleChip = checkedIn ? (
    <span data-testid="checked-in-chip" style={{ ...CHIP, background: "#22C55E", color: "#fff", animation: "dosPopIn .45s cubic-bezier(.22,1.4,.36,1)" }}>
      ✓ Checked in
    </span>
  ) : rel ? (
    /* the word kept in its own case in the DOM (uppercased by CSS) so a locator reads "Booked" */
    <span data-testid="relation-chip" data-relation={relation ?? undefined} style={{ ...CHIP, background: `${rel.tint}1f`, color: rel.tint, border: `1.5px solid ${rel.tint}33` }}>
      {rel.word}
    </span>
  ) : null;


  return (
    <div
      aria-label={href ? undefined : `Open ${c.title}`}
      data-card="session"
      data-kind="class"
      data-live={live ? "yes" : undefined}
      data-deck-state={deckState}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--card)",
        marginBottom: 12,
        color: INK,
        opacity: isPast ? 0.72 : 1,
        /* ⚠ A LIVE CARD IS FRAMED GREEN (2 Oct 2026) — the whole card says it;
           on Home's deck a finished card is framed red, a coming one amber */
        border: live ? "2.5px solid #22C55E" : frame ? `2.5px solid ${frame.c}` : "1.5px solid var(--el)",
        borderRadius: 20,
        boxShadow: live
          ? "0 0 0 3px rgba(34,197,94,.18), 0 4px 16px -4px rgba(34,197,94,.45)"
          : frame
            ? `0 0 0 3px ${frame.glow}`
            : "none",
      }}
    >
      {/* the one door — stretched under every band; the card names the session it
          opens, once, in its aria-label (8046-8049) */}
      {href ? <Link href={href} aria-label={`Open ${c.title}`} style={{ position: "absolute", inset: 0, zIndex: 0 }} /> : null}

      <div style={{ position: "relative", zIndex: 1, pointerEvents: href ? "none" : "auto" }}>
        {/* BAND 1 — the two profiles, the maker's shaded */}
        <div data-testid="class-head" style={{ display: "flex", alignItems: "stretch" }}>
          <Half
            side="artist"
            tint={bc}
            name={artistSide.name}
            photoPath={artistSide.photoPath}
            icon={artistSide.icon}
            eyebrow="Artist"
            made={artistMade}
            mirrored={false}
            title={artistMade ? madeBy : undefined}
            /* a confirmed teacher, or the artist whose own class it is (seated as
               its confirmed teacher at birth) — never "No teacher yet"; and only
               on a draft (`ringsOn`) */
            confirmed={ringsOn && (Boolean(artist) || (artistMade && Boolean(owner)))}
          />
          {/* the studio half is only ever drawn for a side that has said yes: the
              studio that made the class, or the venue that ACCEPTED the room */}
          {studioSide ? <Half side="studio" tint={bc} name={studioSide.name} photoPath={studioSide.photoPath} eyebrow="Studio" made={studioMade} mirrored title={studioMade ? madeBy : undefined} confirmed={ringsOn} /> : null}
        </div>

        {/* BAND 2 — the class: the style in its own ink, the level, what it is to you */}
        <ToolBody>
          {/* the style and its level, then the chips pushed to the right edge —
              the row WRAPS rather than the style breaking mid-word
              ("Contemporar / y", seen when a chip shared its line) */}
          <div data-testid="class-title-row" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "4px 8px", minWidth: 0 }}>
            {/* ⚠ THE LEVEL SITS UNDER THE STYLE (4 Oct 2026, the user: "level below
                style name"). The pair never shrinks below its own width (`1 0
                auto`), so when the chips cannot share the line they wrap under it
                rather than the style breaking mid-word. */}
            <span style={{ flex: "1 0 auto", minWidth: 0, maxWidth: "100%", display: "block" }}>
              {/* ⚠ BIGGER (4 Oct 2026, the user: "Bigger Style Name") — 25px, the
                  size a tool card's own heading is set at */}
              <span data-testid="class-title" style={{ display: "block", fontFamily: DOS_DISPLAY, fontSize: 25, fontWeight: 900, letterSpacing: -0.9, lineHeight: 1.05, color: ink, overflowWrap: "normal", wordBreak: "normal" }}>{headText}</span>
              <span data-testid="class-level" style={{ display: "block", marginTop: 4, fontSize: 10, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", color: MUTED }}>{levelWord}</span>
            </span>
            <span style={{ marginLeft: "auto", marginTop: 3, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {timeBadge}
              {titleChip}
              {href ? <span aria-hidden="true" style={{ color: LINE, fontSize: 15, fontWeight: 600, lineHeight: 1 }}>›</span> : null}
            </span>
          </div>
          {/* THE DAY, THE DATE AND THE TIME IN ONE TILE (4 Oct 2026) */}
          <div style={{ marginTop: 10 }}>
            <WhenTile startsAt={c.session?.startsAt ?? null} endsAt={c.session?.endsAt ?? null} isToday={isToday} tint={bc} />
          </div>
          {/* THE SEATS WRITTEN ON THE BAR, THE PRICE BESIDE IT (4 Oct 2026, the
              user: "2/20 Booked · 18 Spots Left on the bar"): how full is the
              fill, the words say it in numbers, what it costs closes the line.
              A status (Draft / Completed) rides on the bar when it has one. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, minWidth: 0 }}>
            <SeatBar taken={filled} cap={c.capacity} tint={bc} note={note} />
            {/* ₹300 is the number you compare; "per session" belongs on the
                page's booking bar, not beside every figure (8127-8132) */}
            <span data-testid="class-fact-price" style={{ flexShrink: 0, fontSize: 16, fontWeight: 900, letterSpacing: -0.3, color: INK, fontVariantNumeric: "tabular-nums" }}>{priceAmt}</span>
          </div>
        </ToolBody>

        {/* BAND 3 — the buttons, on their own bar, pressable over the stretched link */}
        {actions ? <ToolActions>{actions}</ToolActions> : null}
      </div>
    </div>
  );
}
