"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { ToolActions, ToolBody, ToolFace, ToolFacts, type ToolFact } from "@/components/ui/ToolCard";
import { dosStyleColor, DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_DISPLAY, INK, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { dosStyleInk } from "@/lib/format/styleInk";
import { dateParts, timeOf } from "@/lib/format/session";
import { photoUrl } from "@/lib/media/photo";
import { CLASS_RELATION, type ClassRelation } from "@/lib/format/classLabels";
import type { ClassOwner, DanceClass } from "@/types/class";
import { useDosDark } from "./poster";

/** Seats read as a decision, not a fraction — what is LEFT is what you act on
 *  (prototype 8073-8079); the bar above the words says how full before you read them. */
const seatsOf = (taken: number, cap: number) => {
  const left = cap - taken;
  const pct = cap > 0 ? Math.min(100, Math.round((100 * taken) / cap)) : 0;
  if (left <= 0) return { txt: "Class full", tone: "#F87171", pct: 100 };
  if (left <= 3) return { txt: `${left} spot${left === 1 ? "" : "s"} left`, tone: "#F59E0B", pct };
  return { txt: `${left} spots left`, tone: SUB, pct };
};

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
const DancerIcon = (
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
function Half({ side, tint, name, photoPath, eyebrow, icon, made, mirrored, title }: { side: "artist" | "studio"; tint: string; name: string; photoPath: string | null; eyebrow: ReactNode; icon?: ReactNode; made: boolean; mirrored: boolean; title?: string }) {
  return (
    <div
      data-testid={made ? "class-owner" : undefined}
      data-owner-kind={made ? side : undefined}
      data-half={side}
      title={title}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        flexDirection: mirrored ? "row-reverse" : "row",
        alignItems: "center",
        gap: 10,
        padding: "13px 12px 12px",
        /* ⚠ THE SHADE IS THE WORD "created by" (4 Oct 2026, the user: "highlighted
           with left or right side between artist and studio in a darker shade to
           represent that") — the maker's half is deeper, the other quiet */
        background: made ? `linear-gradient(135deg, ${tint}5c, ${tint}38)` : `linear-gradient(135deg, ${tint}16, ${tint}08)`,
        borderLeft: mirrored ? `1.5px solid ${tint}33` : undefined,
      }}
    >
      <ToolFace name={name} photoPath={photoPath} tint={tint} size={46} icon={icon} />
      <span style={{ flex: 1, minWidth: 0, display: "block", textAlign: mirrored ? "right" : "left" }}>
        <span style={{ display: "block", fontSize: 9, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: tint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eyebrow}</span>
        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", marginTop: 2, fontFamily: DOS_DISPLAY, fontSize: 14.5, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1.18, color: INK }}>{name}</span>
      </span>
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
  const when = c.session ? dateParts(c.session.startsAt) : null;
  const seats = seatsOf(filled, c.capacity);
  const priceAmt = c.priceInr === 0 ? "Free" : `₹${c.priceInr}`;
  const levelWord = DOS_LEVEL_LABEL[c.level] ?? c.level;
  const isPast = c.status === "completed";
  /* A CLASS IS ITS STYLE (8032-8036): the heading is the dance style, always. */
  const headText = c.style || c.title || "Class";
  /* what a status says, beside the spots — not a fourth band */
  const note = c.status === "draft" ? "Draft" : c.status === "completed" ? "Completed" : null;

  /* ⚠ THE UPLOADED POSTER, ON THE CARD (3 Oct 2026). Cropped 3:2, shown as a
     2:1 strip over the head; a class with no picture draws nothing here. */
  const posterSrc = photoUrl(c.posterPath ?? null);

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

  /* Date · Time — figures as tiles, read across without parsing; the spots and
     the price went under the bar (the user: "bar should have spots left below
     and price with it") */
  const facts: ToolFact[] = [
    {
      label: when ? when.weekday : "Date",
      value: isToday ? "Today" : when ? `${when.day} ${when.month.charAt(0)}${when.month.slice(1).toLowerCase()}` : "—",
      testId: "class-fact-date",
    },
    { label: "Time", value: c.session ? timeOf(c.session.startsAt) : "—", testId: "class-fact-time" },
  ];

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
        {posterSrc ? (
          <div data-testid="card-poster" style={{ aspectRatio: "2 / 1", overflow: "hidden", background: `${bc}22` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a public bucket URL whose box this card already decides; next/image would add a loader to every card on a shelf */}
            <img src={posterSrc} alt="" aria-hidden="true" loading="lazy" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : null}

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
          />
          {studioSide ? <Half side="studio" tint={bc} name={studioSide.name} photoPath={studioSide.photoPath} eyebrow="Studio" made={studioMade} mirrored title={studioMade ? madeBy : undefined} /> : null}
        </div>

        {/* BAND 2 — the class: the style in its own ink, the level, what it is to you */}
        <ToolBody>
          {/* the style and its level, then the chips pushed to the right edge —
              the row WRAPS rather than the style breaking mid-word
              ("Contemporar / y", seen when a chip shared its line) */}
          <div data-testid="class-title-row" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px", minWidth: 0 }}>
            <span data-testid="class-title" style={{ minWidth: 0, fontFamily: DOS_DISPLAY, fontSize: 19, fontWeight: 900, letterSpacing: -0.6, lineHeight: 1.12, color: ink, overflowWrap: "normal", wordBreak: "normal" }}>{headText}</span>
            <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: MUTED }}>{levelWord}</span>
            <span style={{ marginLeft: "auto", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6 }}>
              {timeBadge}
              {titleChip}
              {href ? <span aria-hidden="true" style={{ color: LINE, fontSize: 15, fontWeight: 600, lineHeight: 1 }}>›</span> : null}
            </span>
          </div>
          <ToolFacts items={facts} tint={bc} style={{ marginTop: 10 }} />
          {/* THE BAR, THEN THE SPOTS LEFT UNDER IT WITH THE PRICE BESIDE THEM
              (8491-8526, re-cut 4 Oct 2026 at the user's word): how full before
              the words are read, what is left as the decision, what it costs
              closing the line. A status rides with the spots when it has one. */}
          <div style={{ marginTop: 10 }}>
            <span style={{ display: "block", height: 5, borderRadius: 3, background: "var(--el)", overflow: "hidden" }}>
              <span style={{ display: "block", height: 5, borderRadius: 3, width: `${seats.pct}%`, background: seats.pct >= 100 ? "#F87171" : seats.pct >= 85 ? "#F59E0B" : bc, transition: "width .3s" }} />
            </span>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 6, minWidth: 0 }}>
              <span data-testid="class-fact-spots" style={{ minWidth: 0, fontSize: 11, fontWeight: 800, color: seats.tone, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {seats.txt}
                {note ? <span style={{ color: MUTED, fontWeight: 700 }}> · {note}</span> : null}
              </span>
              {/* ₹300 is the number you compare; "per session" belongs on the
                  page's booking bar, not beside every figure (8127-8132) */}
              <span data-testid="class-fact-price" style={{ flexShrink: 0, fontSize: 15, fontWeight: 900, letterSpacing: -0.3, color: INK, fontVariantNumeric: "tabular-nums" }}>{priceAmt}</span>
            </div>
          </div>
        </ToolBody>

        {/* BAND 3 — the buttons, on their own bar, pressable over the stretched link */}
        {actions ? <ToolActions>{actions}</ToolActions> : null}
      </div>
    </div>
  );
}
