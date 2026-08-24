import type { ReactNode } from "react";
import { dosStyleColor, DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_DISPLAY, INK, LINE, SUB } from "@/lib/design/tokens";
import type { DanceClass } from "@/types/class";

const CARD = "var(--card)";

/** Session date/time read in IST — the app is India-only for now. */
const IST = "Asia/Kolkata";

const dateParts = (iso: string) => {
  const d = new Date(iso);
  const get = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...opts }).format(d);
  return {
    weekday: get({ weekday: "short" }).toUpperCase(),
    day: get({ day: "numeric" }),
    month: get({ month: "short" }).toUpperCase(),
  };
};

const timeOf = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));

/** Seats read as a decision — what is LEFT is what you act on (prototype 8073-8079). */
const seatsOf = (taken: number, cap: number) => {
  const left = cap - taken;
  if (left <= 0) return { txt: "Class full", tone: "#F87171" };
  if (left <= 3) return { txt: `${left} spot${left === 1 ? "" : "s"} left`, tone: "#F59E0B" };
  return { txt: `${left} spots left`, tone: SUB };
};

export interface ClassTileProps {
  danceClass: DanceClass;
  /** Enrollment count — 0 until Step 4 wires bookings. */
  filled?: number;
  /** Who runs it — the studio/trainer business name (learner listing). */
  tenantName?: string | null;
  city?: string | null;
  /** Owner-side action pills rendered under the facts bar. */
  actions?: ReactNode;
}

/**
 * The one class card, app-wide — anatomy lifted from the prototype's BookingCard
 * (DanceOSApp.jsx:7969+): a sleeve with the style's colour across the head, a
 * calendar block for WHEN, the style's name full-size as WHAT (a class IS its
 * style), and the two session facts — seats and price — across the bottom.
 */
export function ClassTile({ danceClass: c, filled = 0, tenantName, city, actions }: ClassTileProps) {
  const bc = dosStyleColor(c.style);
  const ground = `linear-gradient(150deg, ${bc}47 0%, ${bc}24 55%, ${bc}17 100%)`;
  const weave = `repeating-linear-gradient(45deg, ${bc}1a 0 6px, transparent 6px 12px)`;
  const when = c.session ? dateParts(c.session.startsAt) : null;
  const timeRange = c.session ? `${timeOf(c.session.startsAt)} – ${timeOf(c.session.endsAt)}` : null;
  const seats = seatsOf(filled, c.capacity);
  const priceAmt = c.priceInr === 0 ? "Free" : `₹${c.priceInr}`;
  const levelWord = DOS_LEVEL_LABEL[c.level] ?? c.level;
  const isPast = c.status === "completed";
  const whereBits = [tenantName, c.room, city].filter(Boolean) as string[];

  return (
    <div
      aria-label={`Open ${c.title}`}
      data-card="session"
      data-kind="class"
      style={{
        overflow: "hidden",
        background: CARD,
        marginBottom: 10,
        opacity: isPast ? 0.6 : 1,
        border: `1px solid ${LINE}`,
        borderRadius: 20,
        boxShadow: "0 2px 10px -2px rgba(0,0,0,.28)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          minWidth: 0,
          overflow: "hidden",
          borderBottom: `2px solid ${bc}`,
          background: ground,
        }}
      >
        {/* WHEN — the calendar block: weekday over day over month, then the window */}
        <div
          style={{
            position: "relative",
            width: 100,
            flexShrink: 0,
            boxSizing: "border-box",
            padding: "12px 4px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundImage: weave,
            borderRight: `1.5px dashed ${bc}66`,
          }}
        >
          {when ? (
            <>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, color: SUB }}>
                {when.weekday}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, fontFamily: DOS_DISPLAY, lineHeight: 1.1 }}>
                {when.day}
              </div>
              <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.4, color: SUB }}>
                {when.month}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, fontWeight: 800, color: SUB }}>—</div>
          )}
          {timeRange && (
            <div style={{ fontSize: 9.5, fontWeight: 800, color: INK, marginTop: 6, textAlign: "center" }}>
              {timeRange}
            </div>
          )}
        </div>

        {/* WHAT — the style at full size in its own colour; the level and the where under it */}
        <div style={{ flex: 1, minWidth: 0, padding: "12px 13px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div
            style={{
              fontSize: 18,
              fontWeight: 900,
              fontFamily: DOS_DISPLAY,
              letterSpacing: -0.4,
              color: bc,
              filter: "brightness(1.5)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {c.style}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: INK, marginTop: 2 }}>{levelWord}</div>
          {whereBits.length > 0 && (
            <div
              style={{ fontSize: 10.5, color: SUB, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {whereBits.join(" · ")}
            </div>
          )}
        </div>

        {c.status !== "published" && (
          <div style={{ padding: "10px 12px", flexShrink: 0 }}>
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: 0.8,
                padding: "4px 9px",
                borderRadius: 999,
                background: "var(--el)",
                color: SUB,
              }}
            >
              {c.status === "draft" ? "DRAFT" : "COMPLETED"}
            </span>
          </div>
        )}
      </div>

      {/* the two facts that belong to the session, not to any column */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: seats.tone }}>{seats.txt}</span>
        <span style={{ fontSize: 13, fontWeight: 900 }}>
          {priceAmt}
          {c.priceInr > 0 && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: SUB, marginLeft: 4 }}>per session</span>
          )}
        </span>
      </div>

      {actions && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", padding: "0 13px 11px" }}>{actions}</div>
      )}
    </div>
  );
}
