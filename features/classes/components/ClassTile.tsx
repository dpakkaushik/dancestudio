"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { dosStyleColor, DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_DISPLAY, INK, LINE, SUB } from "@/lib/design/tokens";
import { dosStyleInk, initialsOf, personGrad } from "@/lib/format/styleInk";
import { dateParts, timeRangeOf } from "@/lib/format/session";
import { photoUrl } from "@/lib/media/photo";
import { CLASS_RELATION, type ClassRelation } from "@/lib/format/classLabels";
import type { DanceClass } from "@/types/class";
import { useDosDark } from "./poster";

const CARD = "var(--card)";

/** Seats read as a decision, not a fraction — what is LEFT is what you act on
 *  (prototype 8073-8079); the bar beside the words says how full before you read them. */
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
  /** ⚠ ACCEPTED AND NEVER PRINTED (18 Sep 2026). The card names who made the
   *  class from `danceClass.owner` since 4 Oct 2026 — the "By …" line — which
   *  carries the kind and the picture this string never could. */
  businessName?: string | null;
  /** Accepted for the callers that already pass it; the card does not print it
   *  (8443-8449) — the class page carries the venue. */
  city?: string | null;
  /** THE TEACHER TAKING IT — the WHO column wears their face (8193-8200), which
   *  is what the centre is FOR. Without one (a draft nobody has accepted yet, or
   *  a signed-out reader who may not read `profiles`) the column falls back to
   *  the style square. */
  artist?: ClassTileArtist | null;
  /** A card on your own day carries no date label — the block says "Today"
   *  rather than nothing (8322-8325). Only meaningful when the class has no session. */
  isToday?: boolean;
  /** Owner-side action pills rendered under the facts bar. */
  actions?: ReactNode;
  /** When set, the sleeve opens the class detail page (actions stay outside the link). */
  href?: string;
  /** WHAT THIS CLASS IS TO YOU — Booked, Teaching, Assisting, At your studio, or
   *  an ask (prototype 8430-8432). ⚠ ONE WORD LIST SINCE 4 Oct 2026
   *  (`lib/format/classLabels.ts`): it was a free string, so every page wrote its
   *  own word for the same fact. Each relation has one word and one colour, and
   *  it is always this chip — never a tag in the button row under the card. */
  relation?: ClassRelation | null;
  /** the ONE running session — a LIST decides which of its rows wears the badge
   *  (8148-8153); nobody else sets it */
  live?: boolean;
  /** ⚠ YOU ARE IN THE ROOM (2 Oct 2026, the user: "show the todays schedule
   *  section … with checked in on the class card") — Home's deck sets it off
   *  your live attendance row; a green stamp in the role chip's place */
  checkedIn?: boolean;
  /** ⚠ HOME'S DECK ONLY (2 Oct 2026, the user: "completed status same as live
   *  with red border on cards, upcoming classes yellow border") — where this
   *  card stands in today, decided by the deck's list. `live` keeps the green
   *  frame; `done` is red with COMPLETED, `upcoming` amber with UPCOMING. Every
   *  other surface passes none, so Discover, the calendar and the register keep
   *  their frames */
  deckState?: "done" | "live" | "upcoming";
}

/* the deck's two non-live frames — red and amber that read on both grounds */
const DECK_FRAME = {
  done: { c: "#EF4444", ink: "#fff", glow: "rgba(239,68,68,.16)", word: "Completed", testId: "done-badge" },
  /* dark ink on amber — white on #F59E0B is ~2:1 and would not read */
  upcoming: { c: "#F59E0B", ink: "#1a1406", glow: "rgba(245,158,11,.16)", word: "Upcoming", testId: "upcoming-badge" },
} as const;

/**
 * The one class card, app-wide — anatomy lifted from the prototype's BookingCard
 * (DanceOSApp.jsx:7969-8500): a squircle in three parts read left to right in the
 * order you decide in — WHEN, WHO, WHAT. The first two stand on the dance's own
 * colour with a torn edge between them and the card; the third stands on the card
 * itself so the style's name can be full size in its own ink. Under all three, the
 * width of the card, go the two facts that belong to none of them: how full, and
 * what it costs.
 */
export function ClassTile({ danceClass: c, filled = 0, artist, isToday = false, actions, href, relation = null, live: liveProp = false, checkedIn = false, deckState }: ClassTileProps) {
  const rel = relation ? CLASS_RELATION[relation] : null;
  const owner = c.owner ?? null;
  const ownerFace = owner ? photoUrl(owner.photoPath) : null;
  const live = deckState ? deckState === "live" : liveProp;
  const frame = deckState === "done" || deckState === "upcoming" ? DECK_FRAME[deckState] : null;
  const bc = dosStyleColor(c.style);
  const dark = useDosDark();
  const ink = dosStyleInk(bc, dark);
  const ground = `linear-gradient(150deg, ${bc}47 0%, ${bc}24 55%, ${bc}17 100%)`;
  const weave = `repeating-linear-gradient(45deg, ${bc}1a 0 6px, transparent 6px 12px)`;
  const when = c.session ? dateParts(c.session.startsAt) : null;
  const timeRange = c.session ? timeRangeOf(c.session.startsAt, c.session.endsAt) : null;
  const seats = seatsOf(filled, c.capacity);
  const priceAmt = c.priceInr === 0 ? "Free" : `₹${c.priceInr}`;
  const levelWord = DOS_LEVEL_LABEL[c.level] ?? c.level;
  const isPast = c.status === "completed";
  /* A CLASS IS ITS STYLE (8032-8036): the heading is the dance style, always. The
     qualifier line only adds what the heading left out — which for a class is the level. */
  const headText = c.style || c.title || "Class";
  const headKey = headText.trim().toLowerCase();
  const styleWord = c.style && !headKey.includes(c.style.trim().toLowerCase()) ? c.style : null;
  const underLine = [styleWord, levelWord].filter(Boolean).join(" · ") || null;
  /* what a status says, as a note under the seats (8477-8480) — not a third column */
  const note = c.status === "draft" ? "Draft" : c.status === "completed" ? "Completed" : null;
  /* THE CENTRE IS THE TEACHER (8296-8300). It falls back to the style square only
     when there is nobody to draw: a draft whose ask is unanswered, or a reader who
     may not see `profiles` at all. The caption is the teacher's name and nothing
     else — a studio's name is the booking page's to print, not the card's. */
  const face = artist ? photoUrl(artist.avatarPath) : null;
  const grad = personGrad(false);
  const centreLabel = artist?.name ?? "";

  /* ⚠ THE UPLOADED POSTER, ON THE CARD (3 Oct 2026, the user's answer: "show
     it on the cards"). Since 27 Sep a studio could put a real flyer on a class
     and it showed on the class page alone — every card still drew the style
     square. A poster is cropped 3:2 (the `banner` frame), so the card shows
     nearly all of it as a 2:1 strip and the class page shows the whole. ⚠ A class with no picture
     draws NOTHING here, so it looks exactly as it always did. Decorative: the
     link around it already names the class, and a second name is noise. */
  const posterSrc = photoUrl(c.posterPath ?? null);
  const posterStrip = posterSrc ? (
    <div data-testid="card-poster" style={{ aspectRatio: "2 / 1", overflow: "hidden", background: ground, borderBottom: `2px solid ${bc}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a public bucket URL whose box this card already decides; next/image would add a loader to every card on a shelf */}
      <img src={posterSrc} alt="" aria-hidden="true" loading="lazy" style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  ) : null;

  const sleeve = (
    <div style={{ display: "flex", alignItems: "stretch", minWidth: 0, overflow: "hidden", borderBottom: `2px solid ${bc}` }}>
      {/* ── LEFT · WHEN — a calendar block: the weekday over the day over the month,
          then the time as ONE range (8304-8341) ── */}
      <div
        style={{
          position: "relative",
          width: 100,
          flexShrink: 0,
          boxSizing: "border-box",
          padding: "9px 4px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          textAlign: "center",
          background: ground,
        }}
      >
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: weave, opacity: 0.5, pointerEvents: "none" }} />
        {/* A card on a day you are already looking at says TODAY where the date goes
            (8290-8293). The prototype's Home rows carry no date at all — the deck IS
            today — so the block reads "Today" there and the full date everywhere the
            day is in question (the calendar passes a date and gets one). */}
        {isToday ? (
          <span
            style={{
              position: "relative",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: ink,
              fontFamily: DOS_DISPLAY,
              lineHeight: 1.2,
            }}
          >
            Today
          </span>
        ) : when ? (
          <>
            <span style={{ position: "relative", fontSize: 9, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase", color: ink, lineHeight: 1.2 }}>
              {when.weekday}
            </span>
            <span
              style={{
                position: "relative",
                fontSize: 21,
                fontWeight: 900,
                letterSpacing: -1,
                lineHeight: 1.05,
                color: INK,
                fontFamily: DOS_DISPLAY,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {when.day}
            </span>
            <span style={{ position: "relative", fontSize: 9.5, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: SUB, lineHeight: 1.3 }}>
              {when.month}
            </span>
          </>
        ) : null}
        {/* 8px, because "11:00 am – 12:00 pm" is the longest thing a session's clock can
            say and it has to fit on one line or the range stops being a range */}
        {timeRange && (
          <span
            style={{
              position: "relative",
              marginTop: 5,
              fontSize: 8,
              fontWeight: 800,
              color: INK,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.25,
              letterSpacing: -0.2,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {timeRange}
          </span>
        )}
      </div>

      {/* ── CENTRE · WHO (8343-8405). `overflow:hidden` is load-bearing: the torn-edge
          notches are 12px discs offset to right:-6, so half of each hangs outside this
          column and is clipped into the half-circle bite it is meant to be. ── */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          width: 80,
          flexShrink: 0,
          boxSizing: "border-box",
          padding: "9px 5px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          background: ground,
        }}
      >
        <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: weave, opacity: 0.5, pointerEvents: "none" }} />
        {/* the torn edge: a dashed rule with a notch punched out of each end of it */}
        <span aria-hidden="true" style={{ position: "absolute", right: 0, top: 6, bottom: 6, borderRight: `1.5px dashed ${bc}80`, pointerEvents: "none" }} />
        <span aria-hidden="true" style={{ position: "absolute", right: -6, top: -6, width: 12, height: 12, borderRadius: 6, background: "var(--bg)", pointerEvents: "none" }} />
        <span aria-hidden="true" style={{ position: "absolute", right: -6, bottom: -6, width: 12, height: 12, borderRadius: 6, background: "var(--bg)", pointerEvents: "none" }} />
        {artist ? (
          <span
            style={{
              position: "relative",
              lineHeight: 0,
              display: "block",
              width: 54,
              height: 54,
              borderRadius: 15,
              overflow: "hidden",
              boxShadow: `0 4px 12px -2px rgba(0,0,0,.5), 0 0 0 2px ${bc}44`,
            }}
          >
            {face ? (
              <Image src={face} alt="" width={54} height={54} style={{ width: 54, height: 54, objectFit: "cover", display: "block" }} />
            ) : (
              <span
                style={{
                  width: 54,
                  height: 54,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `linear-gradient(150deg, ${grad[0]}, ${grad[1]})`,
                  color: "#fff",
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  fontFamily: DOS_DISPLAY,
                }}
              >
                {initialsOf(artist.name)}
              </span>
            )}
          </span>
        ) : (
          /* ⚠ NO DANCE STYLE IN THE CENTRE, EVER (18 Sep 2026, the user: "photo
             of artist in centre, below artist name, and nothing else"). This
             square used to print the style's name, which is the one thing this
             column is not about — and the style is already the headline on the
             right, at full size, in its own ink. When there is nobody to draw,
             the column says so quietly: a person mark and no caption. That is a
             DRAFT whose ask is unanswered, or a reader who may not read
             `profiles`; on Discover it is neither, because a class with no
             teacher is off the shelf entirely. */
          <span
            aria-hidden="true"
            style={{
              position: "relative",
              width: 54,
              height: 54,
              borderRadius: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxSizing: "border-box",
              background: "var(--el)",
              border: `1.5px dashed ${LINE}`,
              color: "var(--muted)",
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8.5" r="3.6" />
              <path d="M5 20c.9-4 3.7-6 7-6s6.1 2 7 6" />
            </svg>
          </span>
        )}
        {/* the teacher's name, under their picture — TWO LINES, ALWAYS: a fixed
            two-line box cuts nothing and a short name reserves the same room as a
            long one (8395-8398). Drawn only when there IS a name: the style square
            it falls back to already says what it is, and an empty box under it
            would just push the square off centre. */}
        {centreLabel ? (
          <span
            style={{
              position: "relative",
              width: "100%",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0,
              lineHeight: 1.2,
              height: 24,
              color: INK,
              textAlign: "center",
              display: "block",
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
          >
            {centreLabel}
          </span>
        ) : null}
      </div>

      {/* ── RIGHT · WHAT — stands on the card, so the style's name can be full size in
          its own ink with nothing tinted behind it (8407-8488) ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          boxSizing: "border-box",
          padding: "9px 10px 9px 11px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {/* 21, not 22: on the calendar the card is 342 wide and "Contemporary" came back
              "Contem…". Two lines via max-height, not -webkit-box — one layout model every
              engine agrees on (8425-8441). */}
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 21,
              fontWeight: 900,
              letterSpacing: -0.85,
              lineHeight: 1.06,
              color: ink,
              fontFamily: DOS_DISPLAY,
              display: "block",
              overflow: "hidden",
              maxHeight: `${21 * 1.06 * 2}px`,
              overflowWrap: "normal",
              wordBreak: "normal",
            }}
          >
            {headText}
          </span>
          <span aria-hidden="true" style={{ flexShrink: 0, color: LINE, fontSize: 15, fontWeight: 600, lineHeight: 1 }}>
            ›
          </span>
        </div>
        {/* who may enter and in what style, under the name — the level, on a class — and
            whatever is happening to it right now, on the end of the same line (8414-8440).
            Wraps rather than truncates: with the role chip added, three things share this
            line on an 88%-width card, and losing the level to make room for the role is
            trading one fact for another. */}
        {(underLine || rel || checkedIn) && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2, minWidth: 0, flexWrap: "wrap", rowGap: 3 }}>
            {underLine ? (
              <span
                style={{
                  minWidth: 0,
                  fontSize: 9.5,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {underLine}
              </span>
            ) : (
              <span style={{ flex: 1 }} />
            )}
            {checkedIn ? (
              /* ⚠ CHECKED IN outranks the role (2 Oct 2026): once the door has let
                 you in, "Booked" is yesterday's news. It pops in, because the
                 person is usually watching when it lands. */
              <span
                data-testid="checked-in-chip"
                style={{
                  flexShrink: 0,
                  fontSize: 8.5,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "#22C55E",
                  color: "#fff",
                  animation: "dosPopIn .45s cubic-bezier(.22,1.4,.36,1)",
                }}
              >
                ✓ Checked in
              </span>
            ) : rel ? (
              <span
                data-testid="relation-chip"
                data-relation={relation ?? undefined}
                style={{
                  flexShrink: 0,
                  fontSize: 8.5,
                  fontWeight: 900,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  padding: "2px 7px",
                  borderRadius: 999,
                  /* the relation's own colour, the register's chip paint */
                  background: `${rel.tint}1f`,
                  color: rel.tint,
                }}
              >
                {rel.word}
              </span>
            ) : null}
            {/* ⚠ LIVE LEFT THIS LINE (2 Oct 2026, the user: "live on class cards
                should not be there and istead the border of card should be green
                with a live button on top left") — see the card's own frame below */}
          </div>
        )}
        {/* ⚠ WHO MADE THE CLASS (4 Oct 2026, the user: "make sure the person who
            created the class artist or studios is somehow visible on the card").
            This reverses 18 Sep's "no studio name on the card", at the same
            person's word. It is the OWNER — a studio, or the artist whose own
            class it is — never the venue, and never the teacher (the centre is
            the teacher). Its own small line, so the style keeps its full size;
            nothing at all when the reader may not see that business. */}
        {owner ? (
          <div
            data-testid="class-owner"
            data-owner-kind={owner.kind}
            title={`Created by ${owner.name} — ${owner.kind === "artist" ? "an artist" : "a studio"}`}
            style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5, minWidth: 0 }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                overflow: "hidden",
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: ownerFace ? "transparent" : `${bc}33`,
                color: ink,
              }}
            >
              {ownerFace ? (
                <Image src={ownerFace} alt="" width={16} height={16} style={{ width: 16, height: 16, objectFit: "cover", display: "block" }} />
              ) : owner.kind === "artist" ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8.5" r="3.6" />
                  <path d="M5 20c.9-4 3.7-6 7-6s6.1 2 7 6" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20V9l8-5 8 5v11" />
                  <path d="M9.5 20v-6h5v6" />
                </svg>
              )}
            </span>
            <span
              style={{ minWidth: 0, fontSize: 10.5, fontWeight: 700, color: SUB, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              By <b style={{ fontWeight: 800, color: INK }}>{owner.name}</b>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );

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
        background: CARD,
        marginBottom: 10,
        opacity: isPast ? 0.6 : 1,
        /* ⚠ A LIVE CARD IS FRAMED GREEN (2 Oct 2026) — the whole card says it,
           where a small chip on the third line used to */
        /* ⚠ and on Home's deck a finished card is framed red, a coming one amber
           (2 Oct 2026) — the same weight as live, a quieter glow */
        border: live ? "2.5px solid #22C55E" : frame ? `2.5px solid ${frame.c}` : `1.5px solid ${LINE}`,
        borderRadius: 20,
        display: "flex",
        flexDirection: "column",
        boxShadow: live
          ? "0 0 0 3px rgba(34,197,94,.18), 0 4px 16px -4px rgba(34,197,94,.45)"
          : frame
            ? `0 0 0 3px ${frame.glow}, 0 2px 10px -2px rgba(0,0,0,.28)`
            : "0 2px 10px -2px rgba(0,0,0,.28)",
      }}
    >
      {frame ? (
        /* COMPLETED / UPCOMING in the LIVE button's own place and clothes */
        <span
          data-testid={frame.testId}
          style={{
            position: "absolute",
            top: 7,
            left: 7,
            zIndex: 3,
            pointerEvents: "none",
            display: "inline-flex",
            alignItems: "center",
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: 999,
            background: frame.c,
            color: frame.ink,
            boxShadow: "0 2px 6px rgba(0,0,0,.25)",
          }}
        >
          {frame.word}
        </span>
      ) : null}
      {live ? (
        /* the LIVE button, top left, over the date block — `pointerEvents: none`
           so the sleeve's own link still opens the class under it */
        <span
          data-testid="live-badge"
          style={{
            position: "absolute",
            top: 7,
            left: 7,
            zIndex: 3,
            pointerEvents: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            padding: "3px 8px 3px 7px",
            borderRadius: 999,
            background: "#22C55E",
            color: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,.25)",
          }}
        >
          <span style={{ position: "relative", width: 5, height: 5 }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: 3, background: "#fff" }} />
            <span style={{ position: "absolute", inset: -3, borderRadius: 6, border: "1.5px solid #fff", opacity: 0.5, animation: "dosPulseH 1.4s ease-out infinite" }} />
          </span>
          Live
        </span>
      ) : null}
      {/* the sleeve opens the class page — booking stays outside the link, so a
          button never nests inside an anchor. The card names the session it opens,
          once, in its aria-label (8046-8049). */}
      {href ? (
        <Link href={href} aria-label={`Open ${c.title}`} style={{ display: "block", color: INK, textDecoration: "none" }}>
          {posterStrip}
          {sleeve}
        </Link>
      ) : (
        <>
          {posterStrip}
          {sleeve}
        </>
      )}

      {/* ── UNDER ALL THREE · HOW FULL, AND WHAT IT COSTS (8491-8526). "6 spots left"
          does not say whether that is nearly empty or nearly gone — the bar says it
          before you have read the words — and the price closes the card. ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px 9px", minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, height: 5, borderRadius: 3, background: LINE, overflow: "hidden", minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  height: 5,
                  borderRadius: 3,
                  width: `${seats.pct}%`,
                  background: seats.pct >= 100 ? "#F87171" : seats.pct >= 85 ? "#F59E0B" : bc,
                  transition: "width .3s",
                }}
              />
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: seats.tone, whiteSpace: "nowrap", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {seats.txt}
            </span>
          </div>
          {note && (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                marginTop: 4,
                color: "var(--muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {note}
            </div>
          )}
        </div>
        {/* ₹300 is the number you compare; the label that says "per session" belongs on
            the page's booking bar, not beside every figure (8127-8132) */}
        <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 900, letterSpacing: -0.3, color: INK, fontVariantNumeric: "tabular-nums" }}>
          {priceAmt}
        </span>
      </div>

      {/* the owner's lifecycle controls run the full width, under all three */}
      {actions && <div style={{ display: "flex", gap: 7, padding: "0 10px 10px", flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
