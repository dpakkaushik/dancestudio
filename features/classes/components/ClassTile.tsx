"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ToolActions, ToolBody, ToolFacts, ToolHead, type ToolFact } from "@/components/ui/ToolCard";
import { dosStyleColor, DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_DISPLAY, INK, LINE, MUTED, SUB } from "@/lib/design/tokens";
import { dosStyleInk } from "@/lib/format/styleInk";
import { dateParts, timeOf } from "@/lib/format/session";
import { photoUrl } from "@/lib/media/photo";
import { CLASS_RELATION, type ClassRelation } from "@/lib/format/classLabels";
import type { DanceClass } from "@/types/class";
import { useDosDark } from "./poster";

/** Seats read as a decision, not a fraction — what is LEFT is what you act on
 *  (prototype 8073-8079); the bar beside the words says how full before you read them. */
const seatsOf = (taken: number, cap: number) => {
  const left = cap - taken;
  const pct = cap > 0 ? Math.min(100, Math.round((100 * taken) / cap)) : 0;
  if (left <= 0) return { txt: "Full", tone: "#F87171", pct: 100 };
  if (left <= 3) return { txt: `${left} left`, tone: "#F59E0B", pct };
  return { txt: `${left} left`, tone: INK, pct };
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
  /** ⚠ ACCEPTED AND NEVER PRINTED (18 Sep 2026). The card names who made the
   *  class from `danceClass.owner` since 4 Oct 2026 — the "By …" line — which
   *  carries the kind and the picture this string never could. */
  businessName?: string | null;
  /** Accepted for the callers that already pass it; the card does not print it
   *  (8443-8449) — the class page carries the venue. */
  city?: string | null;
  /** THE TEACHER TAKING IT — the profile band wears their face and name. Without
   *  one (a draft nobody has accepted yet, or a signed-out reader who may not
   *  read `profiles`) the band falls back to the class's maker, then to the
   *  style itself. */
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

/* the dancer mark for a class with nobody to draw — a draft whose ask is
   unanswered, or a reader who may read neither the teacher nor the maker */
const DancerIcon = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="13" cy="4.5" r="2" />
    <path d="M12 7.5 8 11l3 2-1 7" />
    <path d="M12 7.5 16.5 9l3 3.5" />
    <path d="M10.5 13.5 16 15l2.5 5" />
  </svg>
);

/**
 * The one class card, app-wide — ON THE TOOL CARD'S ANATOMY since 4 Oct 2026
 * (the user: "redesign the class cards according to how we have done for other
 * tool cards everywhere"). It was the prototype's BookingCard (7969-8500), the
 * WHEN · WHO · WHAT sleeve; it is the three bands every other tool card wears:
 *
 *   1. THE PROFILE — the teacher taking it, big, over a wash of the style's own
 *      colour; what the class is to you as the chip on the right; who MADE it
 *      as the line under the name.
 *   2. THE CLASS — the style's name in its own ink with the level beside it,
 *      then Date · Time · Spots · Price as figure tiles, and the fill bar.
 *   3. THE BUTTONS — whatever the page offers, on a bar of their own.
 *
 * ⚠ A card that opens is ONE stretched link under everything (`href`), the
 * bands with pointer events off, and the button bar switched back on — the
 * studio card's pattern, so a button is never inside an anchor. The frame
 * keeps its own paint rules (a live class green, the deck's red and amber), so
 * it is the ToolCard's frame drawn here rather than imported.
 */
export function ClassTile({ danceClass: c, filled = 0, artist, isToday = false, actions, href, relation = null, live: liveProp = false, checkedIn = false, deckState }: ClassTileProps) {
  const rel = relation ? CLASS_RELATION[relation] : null;
  const owner = c.owner ?? null;
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
  /* what a status says, as a note beside the fill bar — not a fourth band */
  const note = c.status === "draft" ? "Draft" : c.status === "completed" ? "Completed" : null;
  const ownerFace = owner ? photoUrl(owner.photoPath) : null;
  const ownerKindWord = owner ? (owner.kind === "artist" ? "Artist" : "Studio") : null;

  /* ⚠ THE UPLOADED POSTER, ON THE CARD (3 Oct 2026). Cropped 3:2, shown as a
     2:1 strip over the head; a class with no picture draws nothing here. */
  const posterSrc = photoUrl(c.posterPath ?? null);

  /* ⚠ WHO MADE THE CLASS (4 Oct 2026, the user: "make sure the person who
     created the class artist or studios is somehow visible on the card"). The
     OWNER — a studio, or the artist whose own class it is — never the venue,
     and never the teacher (the head is the teacher). Nothing at all when the
     reader may not see that business. */
  const byLine = owner ? (
    <span data-testid="class-owner" data-owner-kind={owner.kind} title={`Created by ${owner.name} — ${owner.kind === "artist" ? "an artist" : "a studio"}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: "100%" }}>
      <span aria-hidden="true" style={{ width: 15, height: 15, borderRadius: 5, overflow: "hidden", flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: ownerFace ? "transparent" : `${bc}33`, color: ink }}>
        {ownerFace ? (
          <Image src={ownerFace} alt="" width={15} height={15} style={{ width: 15, height: 15, objectFit: "cover", display: "block" }} />
        ) : owner.kind === "artist" ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8.5" r="3.6" />
            <path d="M5 20c.9-4 3.7-6 7-6s6.1 2 7 6" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20V9l8-5 8 5v11" />
            <path d="M9.5 20v-6h5v6" />
          </svg>
        )}
      </span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        By <b style={{ fontWeight: 800, color: INK }}>{owner.name}</b>
      </span>
    </span>
  ) : null;

  /* the status chip on the head's right: CHECKED IN outranks the relation
     (2 Oct 2026) — once the door has let you in, "Booked" is yesterday's news */
  const headRight = checkedIn ? (
    <span data-testid="checked-in-chip" style={{ flexShrink: 0, alignSelf: "flex-start", fontSize: 9, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", padding: "4px 9px", borderRadius: 999, background: "#22C55E", color: "#fff", animation: "dosPopIn .45s cubic-bezier(.22,1.4,.36,1)" }}>
      ✓ Checked in
    </span>
  ) : rel ? (
    /* `ToolChip`'s clothes, with the WORD kept in its own case in the DOM
       (uppercased by CSS) so a locator reads "Booked", not "BOOKED" */
    <span data-testid="relation-chip" data-relation={relation ?? undefined} style={{ flexShrink: 0, alignSelf: "flex-start", fontSize: 9, fontWeight: 900, letterSpacing: 0.7, textTransform: "uppercase", padding: "4px 9px", borderRadius: 999, background: `${rel.tint}1f`, color: rel.tint, border: `1.5px solid ${rel.tint}33` }}>
      {rel.word}
    </span>
  ) : null;

  /* WHERE THE CLASS STANDS IN TIME — Live, or the deck's Completed / Upcoming —
     leads the eyebrow as a solid pill, so it covers nothing (it used to sit top
     left over the date block; on this anatomy that corner is the face) */
  const timeBadge = live ? (
    <span data-testid="live-badge" style={{ display: "inline-flex", alignItems: "center", gap: 4, verticalAlign: "middle", marginRight: 7, fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6, padding: "2px 7px 2px 6px", borderRadius: 999, background: "#22C55E", color: "#fff" }}>
      <span style={{ position: "relative", width: 5, height: 5 }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: 3, background: "#fff" }} />
        <span style={{ position: "absolute", inset: -3, borderRadius: 6, border: "1.5px solid #fff", opacity: 0.5, animation: "dosPulseH 1.4s ease-out infinite" }} />
      </span>
      Live
    </span>
  ) : frame ? (
    <span data-testid={frame.testId} style={{ display: "inline-block", verticalAlign: "middle", marginRight: 7, fontSize: 8.5, fontWeight: 900, letterSpacing: 0.6, padding: "2px 7px", borderRadius: 999, background: frame.c, color: frame.ink }}>
      {frame.word}
    </span>
  ) : null;
  const eyebrowOf = (word: string) => (
    <>
      {timeBadge}
      {word}
    </>
  );

  /* ⚠ THE PROFILE BAND IS THE TEACHER. It falls back to the MAKER when nobody
     has said yes yet (or the reader may not read `profiles`), and to the style
     itself when the reader may not see the business either — never an empty
     face. The eyebrow says which of the three it is. */
  const head = artist ? (
    <ToolHead tint={bc} name={artist.name} photoPath={artist.avatarPath} eyebrow={eyebrowOf("Teacher")} sub={byLine} right={headRight} />
  ) : owner ? (
    <ToolHead tint={bc} name={owner.name} photoPath={owner.photoPath} eyebrow={eyebrowOf(`${ownerKindWord} · no teacher yet`)} right={headRight} />
  ) : (
    <ToolHead tint={bc} name={headText} photoPath={null} icon={DancerIcon} eyebrow={eyebrowOf("Class")} right={headRight} />
  );

  /* Date · Time · Spots — figures as tiles, read across without parsing.
     ⚠ THREE, NOT FOUR: on Discover the card is 328px wide and a fourth tile
     left "6:00 pm" reading "6:00 …" (measured). The price closes the title
     line instead, which is where the old card kept it (8127). */
  const facts: ToolFact[] = [
    {
      label: when ? when.weekday : "Date",
      value: isToday ? "Today" : when ? `${when.day} ${when.month.charAt(0)}${when.month.slice(1).toLowerCase()}` : "—",
      testId: "class-fact-date",
    },
    { label: "Time", value: c.session ? timeOf(c.session.startsAt) : "—", testId: "class-fact-time" },
    { label: "Spots", value: seats.txt, tint: seats.tone === INK ? undefined : seats.tone, testId: "class-fact-spots" },
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

        {/* BAND 1 — the profile */}
        {head}

        {/* BAND 2 — the class: the style in its own ink, the level, the figures */}
        <ToolBody>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ minWidth: 0, fontFamily: DOS_DISPLAY, fontSize: 19, fontWeight: 900, letterSpacing: -0.6, lineHeight: 1.12, color: ink, overflowWrap: "anywhere" }}>{headText}</span>
            <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: MUTED }}>{levelWord}</span>
            {/* ₹300 is the number you compare; "per session" belongs on the
                page's booking bar, not beside every figure (8127-8132) */}
            <span data-testid="class-fact-price" style={{ marginLeft: "auto", flexShrink: 0, fontSize: 15, fontWeight: 900, letterSpacing: -0.3, color: INK, fontVariantNumeric: "tabular-nums" }}>{priceAmt}</span>
            {href ? <span aria-hidden="true" style={{ flexShrink: 0, color: LINE, fontSize: 15, fontWeight: 600, lineHeight: 1 }}>›</span> : null}
          </div>
          <ToolFacts items={facts} tint={bc} style={{ marginTop: 10 }} />
          {/* how full, said before the words are read (8491-8526) — and what the
              status is, on the same line, when it has one */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9 }}>
            <span style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--el)", overflow: "hidden", minWidth: 0 }}>
              <span style={{ display: "block", height: 5, borderRadius: 3, width: `${seats.pct}%`, background: seats.pct >= 100 ? "#F87171" : seats.pct >= 85 ? "#F59E0B" : bc, transition: "width .3s" }} />
            </span>
            <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: SUB, fontVariantNumeric: "tabular-nums" }}>
              {filled}/{c.capacity}{note ? ` · ${note}` : ""}
            </span>
          </div>
        </ToolBody>

        {/* BAND 3 — the buttons, on their own bar, pressable over the stretched link */}
        {actions ? <ToolActions>{actions}</ToolActions> : null}
      </div>
    </div>
  );
}
