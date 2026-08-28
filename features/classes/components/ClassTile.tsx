"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { dosStyleColor, DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_DISPLAY, INK, LINE, SUB } from "@/lib/design/tokens";
import { dosStyleInk, dosToolPaint, initialsOf, personGrad } from "@/lib/format/styleInk";
import { dateParts, timeRangeOf } from "@/lib/format/session";
import { photoUrl } from "@/lib/media/photo";
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
  /** Enrollment count — 0 until Step 4 wires bookings. */
  filled?: number;
  /** Who runs it — the studio/trainer business name. The card no longer prints a
   *  venue line (prototype 8443-8449: the page carries the studio); the name only
   *  captions the WHO column when the class has no artist (8300). */
  tenantName?: string | null;
  /** Accepted for the callers that already pass it; the card does not print it
   *  (8443-8449) — the class page carries the venue. */
  city?: string | null;
  /** The confirmed artist taking it — the WHO column wears their face (8193-8200).
   *  Without one the column draws the style square in the tool paint. */
  artist?: ClassTileArtist | null;
  /** A card on your own day carries no date label — the block says "Today"
   *  rather than nothing (8322-8325). Only meaningful when the class has no session. */
  isToday?: boolean;
  /** Owner-side action pills rendered under the facts bar. */
  actions?: ReactNode;
  /** When set, the sleeve opens the class detail page (actions stay outside the link). */
  href?: string;
}

/**
 * The one class card, app-wide — anatomy lifted from the prototype's BookingCard
 * (DanceOSApp.jsx:7969-8500): a squircle in three parts read left to right in the
 * order you decide in — WHEN, WHO, WHAT. The first two stand on the dance's own
 * colour with a torn edge between them and the card; the third stands on the card
 * itself so the style's name can be full size in its own ink. Under all three, the
 * width of the card, go the two facts that belong to none of them: how full, and
 * what it costs.
 */
export function ClassTile({ danceClass: c, filled = 0, tenantName, artist, isToday = false, actions, href }: ClassTileProps) {
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
  /* who the centre column is about: the artist if there is one, otherwise whoever is
     putting it on (8296-8300) */
  const face = artist ? photoUrl(artist.avatarPath) : null;
  const grad = personGrad(false);
  const centreLabel = artist?.name || tenantName || "Open format";

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
        {when ? (
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
        ) : isToday ? (
          /* a card on your own day carries no date label at all — the block said nothing
             where the date goes, which read as a missing value rather than as "today" */
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
          <span
            style={{
              position: "relative",
              width: 54,
              height: 54,
              borderRadius: 15,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              boxSizing: "border-box",
              background: dosToolPaint(bc),
              boxShadow: "0 4px 12px -2px rgba(0,0,0,.5)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 900,
              fontFamily: DOS_DISPLAY,
              lineHeight: 1.1,
              textAlign: "center",
              overflowWrap: "anywhere",
            }}
          >
            {c.style || headText}
          </span>
        )}
        {/* the name, under the picture — TWO LINES, ALWAYS: a fixed two-line box cuts
            nothing and a short name reserves the same room as a long one (8395-8398) */}
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
        {underLine && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2, minWidth: 0, flexWrap: "wrap", rowGap: 3 }}>
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
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      aria-label={href ? undefined : `Open ${c.title}`}
      data-card="session"
      data-kind="class"
      style={{
        overflow: "hidden",
        background: CARD,
        marginBottom: 10,
        opacity: isPast ? 0.6 : 1,
        border: `1px solid ${LINE}`,
        borderRadius: 20,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 2px 10px -2px rgba(0,0,0,.28)",
      }}
    >
      {/* the sleeve opens the class page — booking stays outside the link, so a
          button never nests inside an anchor. The card names the session it opens,
          once, in its aria-label (8046-8049). */}
      {href ? (
        <Link href={href} aria-label={`Open ${c.title}`} style={{ display: "block", color: INK, textDecoration: "none" }}>
          {sleeve}
        </Link>
      ) : (
        sleeve
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
