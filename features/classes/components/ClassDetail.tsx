"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  checkInAction,
  giveSpotAction,
  removeFromWaitlistAction,
  undoCheckInAction,
} from "@/features/attendance/server-actions/attendance";
import {
  cancelEnrollmentAction,
  enrollAction,
  type EnrollActionState,
} from "@/features/enrollments/server-actions/enrollments";
import { InvoiceSheet, bookingCodeOf } from "@/features/payments/components/InvoiceSheet";
import { PayFlow } from "@/features/payments/components/PayFlow";
import { RefundSheet } from "@/features/payments/components/RefundSheet";
import { dosStyleColor, DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI, GOLD, GREEN } from "@/lib/design/tokens";
import { dateParts, durText, timeRangeOf } from "@/lib/format/session";
import type { ClassRegister } from "@/repositories/attendance";
import type { PublicClassListing } from "@/types/class";
import type { EnrollmentStatus } from "@/types/enrollment";
import type { PaidReceipt } from "@/types/payment";
import { PassSheet } from "./PassSheet";
import { DOS_SLEEVE, DosPosterSleeve, dosPosterAuto, useDosFold } from "./poster";
import { dosKey } from "./ShareSheet";

/** The class detail page, lifted from prototype S_class (DanceOSApp.jsx:11626-12807).
 *  Step-8 brought the poster sleeve, the card opened into a page, AT THE STUDIO, and
 *  the booking bar; Step 9 adds the money: the two-step pay sheets (12456-12573), the
 *  POLICY section (12399-12402), and the booked card's Invoice | Cancel segments
 *  (BookingActions 6429-6448) backed by real orders/payments/refunds. Still to come:
 *  attendance/waitlist tools + the pass sheet behind the poster (10), rooms/artists/
 *  team/posters/routine (11), owner earnings/refunds tabs (13) — see the backlog. */

/* the studio's metal ring — prototype DOS_RINGS.studio (line 1462) */
const STUDIO_RING = ["#F9E27D", "#B8860B"];

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/* one k/v line inside a section — prototype Row */
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 12.5 }}>
      <span style={{ color: "var(--sub)" }}>{k}</span>
      <b style={{ textAlign: "right", minWidth: 0 }}>{v}</b>
    </div>
  );
}

/* prototype dosStyleInk (1697-1708): walk the style's colour toward the theme's ink
   until it clears 4.2:1 on the page background, so the headline is always readable */
const dosStyleInk = (hex: string, dark: boolean): string => {
  const bg = dark ? [10, 10, 10] : [255, 255, 255];
  const tgt = dark ? [255, 255, 255] : [0, 0, 0];
  const s = String(hex || "").replace("#", "");
  if (s.length < 6) return hex;
  let c = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  if (c.some(isNaN)) return hex;
  const lum = (x: number[]) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(x[0]) + 0.7152 * f(x[1]) + 0.0722 * f(x[2]);
  };
  const cr = (a: number[], b: number[]) => {
    const L1 = lum(a);
    const L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  for (let i = 0; i < 26 && cr(c, bg) < 4.2; i++) c = c.map((v, k) => Math.round(v + (tgt[k] - v) * 0.12));
  return "#" + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
};

/* theme read off <html> the sanctioned way (same store AppChrome reads) */
const subscribeToHtmlClass = (onChange: () => void): (() => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
const readIsDark = () => document.documentElement.className !== "light";
const readServerIsDark = () => true;

/* the page's own host, read the sanctioned way (same pattern as ShareSheet) */
const subscribeNever = () => () => {};
const readHost = () => window.location.host;
const readServerHost = () => "";

/* one section shape for the whole page — prototype DSecTint (11545-11551) */
function Sec({ icon, label, col, children }: { icon: ReactNode; label: string; col: string; children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--el)",
        borderLeft: `3px solid ${col}55`,
        borderRadius: 16,
        padding: "12px 14px",
        marginBottom: 10,
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--sub)" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

const initialState: EnrollActionState = { error: null, outcome: null };

export interface ClassDetailProps {
  danceClass: PublicClassListing;
  /** Enrolled seats on the (first) session. */
  filled: number;
  /** Session window contains now — computed server-side, page renders per request. */
  liveNow: boolean;
  isSignedIn: boolean;
  /** Viewer belongs to the class's tenant — sees share, never the booking bar. */
  isMember: boolean;
  /** Viewer is owner/trainer — sees the draft footer's Edit class. */
  canManage: boolean;
  mine: { id: string; status: EnrollmentStatus } | null;
  /** The captured payment behind the viewer's booking — feeds the invoice. */
  receipt: PaidReceipt | null;
  /** Where the clock stands on the session — the strip only SAYS which moment
   *  you are in (prototype 12050-12063); the check-in window is enforced server-side. */
  sessionPhase: "upcoming" | "live" | "ended";
  /** The live register + waitlist queue — fetched only for owner/trainer viewers. */
  register: ClassRegister | null;
}

export function ClassDetail({
  danceClass: c,
  filled,
  liveNow,
  isSignedIn,
  isMember,
  canManage,
  mine,
  receipt,
  sessionPhase,
  register,
}: ClassDetailProps) {
  const col = dosStyleColor(c.style);
  const dark = useSyncExternalStore(subscribeToHtmlClass, readIsDark, readServerIsDark);
  const ink = dosStyleInk(col, dark);
  const heroGone = useDosFold(DOS_SLEEVE);
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  const [passOpen, setPassOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  /* Details / Attendance — the strip belongs to the card (prototype 11961-11970) */
  const [ownerSeg, setOwnerSeg] = useState<"details" | "att">("details");
  /* one register op at a time — the row that is busy shows it */
  const [opPending, setOpPending] = useState<string | null>(null);
  const host = useSyncExternalStore(subscribeNever, readHost, readServerHost);

  const [enrollState, enrollForm, enrollPending] = useActionState(enrollAction, initialState);
  const [cancelState, cancelForm, cancelPending] = useActionState(cancelEnrollmentAction, initialState);
  const actionError = enrollState.error || cancelState.error;

  const posterK = dosPosterAuto(c.title);
  const posterItem = { title: c.title, style: c.style, styleColor: col };
  const levelWord = DOS_LEVEL_LABEL[c.level] ?? c.level;
  const done = c.status === "completed";
  const isDraft = c.status === "draft";
  const isFree = c.priceInr === 0;
  const price = isFree ? "Free" : `₹${c.priceInr}`;
  const spotsLeft = Math.max(0, c.capacity - filled);
  const pct = c.capacity > 0 ? Math.min(100, Math.round((100 * filled) / c.capacity)) : 0;
  const soldOut = filled >= c.capacity && c.capacity > 0;
  const booked = mine?.status === "enrolled";
  const waitlisted = mine?.status === "waitlisted";

  const when = c.session ? dateParts(c.session.startsAt) : null;
  const time = c.session ? timeRangeOf(c.session.startsAt, c.session.endsAt) : null;
  const durNice = c.session ? durText(c.session.startsAt, c.session.endsAt) : null;

  /* the booking bar is the one thing you can press — drawn only when there is
     something to press (prototype 12405: not yours, not over, and a session exists) */
  const showBar = !isMember && !done && c.session !== null && !waitlisted;

  const ground = `linear-gradient(150deg, ${col}47 0%, ${col}24 55%, ${col}17 100%)`;
  const weave = `repeating-linear-gradient(45deg, ${col}1a 0 6px, transparent 6px 12px)`;
  const whereBits = [c.room, c.tenantCity].filter(Boolean).join(" · ");
  const mapsQuery = [c.room, c.tenantName, c.tenantArea, c.tenantCity].filter(Boolean).join(", ");

  /* one grammar for the money sheets — the same date/time the card prints */
  const whenText = when
    ? `${when.weekday} ${when.day} ${when.month}${time ? ` · ${time}` : ""}`
    : (time ?? "—");
  const whereText = [c.room, c.tenantCity].filter(Boolean).join(", ");

  /* Details / Attendance tabs — what YOU can do here (prototype 11755-11757;
     Earnings/Refunds arrive with Step 13, assistant claims with Step 11) */
  const ownerTabs = canManage && !isDraft && register !== null;
  const showDetails = !ownerTabs || ownerSeg === "details";
  const checkedInCount = register?.checkedInCount ?? 0;

  /* the pass behind the poster (prototype dosCodeFor, 115-121): a booked viewer
     gets their entry code, everyone else the booking link */
  const shareLink = `${host || ""}/c/${c.shareSlug}`;
  const pass =
    booked && mine
      ? { code: bookingCodeOf(mine.id), label: "Entry code", note: "Scan this at the door." }
      : {
          code: shareLink,
          label: "Booking link",
          note: isMember
            ? "Anyone who scans this can book your class."
            : "Anyone who scans this can book this class.",
        };

  const runRegisterOp = async (
    enrollmentId: string,
    op: (input: { enrollmentId: string }) => Promise<{ error: string | null }>,
    doneMsg: string | null
  ) => {
    if (opPending) return;
    setOpPending(enrollmentId);
    const out = await op({ enrollmentId });
    setOpPending(null);
    if (out.error) {
      fire(out.error);
    } else if (doneMsg) {
      fire(doneMsg);
    }
    router.refresh();
  };

  return (
    <div
      style={{
        background: "var(--bg)",
        maxWidth: 430,
        margin: "0 auto",
        color: "var(--text)",
        paddingBottom: showBar || (canManage && isDraft) ? 130 : 40,
        fontFamily: DOS_UI,
        transition: "background .25s",
      }}
    >
      {/* ── THE SLEEVE, LIT LIKE A PLAYER (prototype 11799-11814). Tapping the
          poster opens the pass — sharing, the QR and the entry code live behind
          it now, one place instead of three (12001). ── */}
      <DosPosterSleeve
        item={posterItem}
        design={posterK}
        col={col}
        heroGone={heroGone}
        onOpen={!isDraft ? () => setPassOpen(true) : undefined}
      />

      {/* ── A STATUS IS NOT A BUTTON: a finished class says so once, at the top (11816-11843) ── */}
      {done && (
        <div style={{ padding: "14px 16px 0", position: "relative", zIndex: 1, background: "var(--bg)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 11,
              padding: "12px 14px",
              borderRadius: 16,
              background: "var(--card)",
              border: "1px solid var(--el)",
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--el)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="2.4" strokeLinecap="round">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 900 }}>Class completed</div>
              <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>This session is over.</div>
            </div>
          </div>
        </div>
      )}

      {/* ── THE CARD, OPENED — same three rows in the same order (11844-11961) ── */}
      <div style={{ padding: "0 16px 10px", position: "relative", zIndex: 1, background: "var(--bg)" }}>
        <div style={{ height: 1, background: "var(--el)", margin: "16px 0 20px" }} />
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            border: "1px solid var(--el)",
            borderTop: `3px solid ${col}`,
            background: "var(--card)",
            boxShadow: "0 1px 3px rgba(0,0,0,.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "stretch", minWidth: 0, overflow: "hidden", borderBottom: `2px solid ${col}` }}>
            {/* the calendar block on the dance's own colour */}
            <div
              style={{
                position: "relative",
                width: 104,
                flexShrink: 0,
                boxSizing: "border-box",
                padding: "11px 5px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                background: ground,
              }}
            >
              <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: weave, opacity: 0.5 }} />
              {when ? (
                <>
                  <span
                    style={{
                      position: "relative",
                      fontSize: 9.5,
                      fontWeight: 900,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: ink,
                      lineHeight: 1.2,
                    }}
                  >
                    {when.weekday}
                  </span>
                  <span
                    style={{
                      position: "relative",
                      fontSize: 26,
                      fontWeight: 900,
                      letterSpacing: -1,
                      lineHeight: 1.05,
                      color: "var(--text)",
                      fontFamily: DOS_DISPLAY,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {when.day}
                  </span>
                  <span
                    style={{
                      position: "relative",
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "var(--sub)",
                      lineHeight: 1.3,
                    }}
                  >
                    {when.month}
                  </span>
                </>
              ) : (
                <span style={{ position: "relative", fontSize: 12, fontWeight: 900, color: "var(--text)" }}>—</span>
              )}
              {time && (
                <span
                  style={{
                    position: "relative",
                    marginTop: 6,
                    fontSize: 9.5,
                    fontWeight: 800,
                    color: "var(--text)",
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: -0.1,
                  }}
                >
                  {time}
                </span>
              )}
              {durNice && (
                <span style={{ position: "relative", fontSize: 9, fontWeight: 700, color: "var(--sub)", marginTop: 2 }}>
                  {durNice}
                </span>
              )}
            </div>

            {/* the artist column arrives with Step 11 (rooms & people) */}

            <div
              style={{
                flex: 1,
                minWidth: 0,
                boxSizing: "border-box",
                padding: "11px 12px 11px 13px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 3,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 23,
                    fontWeight: 900,
                    letterSpacing: -0.9,
                    lineHeight: 1.06,
                    color: ink,
                    fontFamily: DOS_DISPLAY,
                    display: "block",
                    overflow: "hidden",
                    maxHeight: "2.2em",
                  }}
                >
                  {c.style}
                </span>
                {liveNow && !done && (
                  <span
                    style={{
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: GREEN,
                      color: "#fff",
                    }}
                  >
                    Live
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {[levelWord, "CLASS"].join(" · ")}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 8px", borderTop: `1px solid ${col}33` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {done ? (
                <div style={{ fontSize: 11, fontWeight: 800, color: "var(--sub)" }}>{filled} attended</div>
              ) : (
                <>
                  <div style={{ height: 5, borderRadius: 3, background: "var(--el)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: 5,
                        borderRadius: 3,
                        width: `${pct}%`,
                        background: soldOut ? "#EF4444" : `linear-gradient(90deg,${col},${col}99)`,
                      }}
                    />
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: soldOut ? "#F87171" : "var(--muted)",
                      marginTop: 4,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {soldOut
                      ? `Class full · ${c.capacity} booked`
                      : `${filled} of ${c.capacity} booked · ${spotsLeft} spots left`}
                  </div>
                </>
              )}
            </div>
            <span
              style={{
                flexShrink: 0,
                fontSize: 13,
                fontWeight: 900,
                padding: "4px 10px",
                borderRadius: 9,
                background: `${col}1a`,
                border: `1px solid ${col}44`,
                color: isFree ? "#4ADE80" : "var(--text)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: -0.2,
              }}
            >
              {price}
            </span>
          </div>
        </div>

        {/* ── Details / Attendance belongs to the card, not the page under it
            (prototype 11961-11970) ── */}
        {ownerTabs && (
          <div style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginTop: 8 }}>
            {(
              [
                ["details", "Details"],
                ["att", "Attendance"],
              ] as Array<["details" | "att", string]>
            ).map(([k, l]) => (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                key={k}
                onClick={() => setOwnerSeg(k)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "7px 4px",
                  borderRadius: 9,
                  cursor: "pointer",
                  fontSize: 11.5,
                  fontWeight: 800,
                  background: ownerSeg === k ? "var(--solid)" : "transparent",
                  color: ownerSeg === k ? "var(--text)" : "var(--sub)",
                  boxShadow: ownerSeg === k ? "0 1px 4px rgba(0,0,0,.3)" : "none",
                  transition: "all .15s",
                }}
              >
                {l}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: "12px 16px 0", position: "relative", zIndex: 1, background: "var(--bg)" }}>
        {/* ── a booking you hold (prototype BookingActions 6408-6448): neutral card,
            the confirmed dot, and the two money actions MERGED into one segmented
            pill — the invoice and the cancel-and-refund are two halves of one
            subject. Waitlist rows keep their simple leave button. ── */}
        {mine && !isMember && !done && booked && (
          <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: GREEN, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                You’re booked
              </span>
              <span style={{ fontFamily: DOS_MONO, fontSize: 10, color: "var(--muted)", marginLeft: "auto", flexShrink: 0 }}>
                {bookingCodeOf(mine.id)}
              </span>
            </div>
            <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>See it on Home and My classes.</div>
            {/* one bordered pill, two segments, a hairline between */}
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                marginTop: 10,
                border: "1px solid var(--el)",
                borderRadius: 999,
                overflow: "hidden",
                background: "var(--solid)",
              }}
            >
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label="Invoice"
                onClick={() => setInvoiceOpen(true)}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px 6px",
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                Invoice
              </span>
              <span aria-hidden="true" style={{ width: 1, background: "var(--el)" }} />
              <span
                role="button"
                tabIndex={0}
                onKeyDown={dosKey}
                aria-label="Cancel booking"
                onClick={() => setRefundOpen(true)}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px 6px",
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: "#F87171",
                }}
              >
                Cancel booking
              </span>
            </div>
          </div>
        )}
        {mine && !isMember && !done && !booked && (
          <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "12px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: GOLD, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                You’re on the waitlist
              </span>
            </div>
            <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>You get the next freed spot.</div>
            <form action={cancelForm} style={{ display: "flex", marginTop: 10 }}>
              <input type="hidden" name="enrollmentId" value={mine.id} />
              <button
                type="submit"
                disabled={cancelPending}
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "10px 6px",
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: "#F87171",
                  background: "var(--solid)",
                  border: "1px solid var(--el)",
                  borderRadius: 999,
                }}
              >
                {cancelPending ? "Cancelling…" : "Leave waitlist"}
              </button>
            </form>
          </div>
        )}

        {showDetails && (
          <>
        {/* ── AT THE STUDIO — one place says where, and says it properly (12273-12320) ── */}
        <Sec
          col={col}
          label="AT THE STUDIO"
          icon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3.5h9a1.5 1.5 0 0 1 1.5 1.5v15H6z" />
              <path d="M4.5 20.5h15" />
              <circle cx="13.5" cy="12.2" r=".9" fill={col} />
            </svg>
          }
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingBottom: 9,
              marginBottom: 9,
              borderBottom: "1px solid var(--el)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  flexShrink: 0,
                  background: `linear-gradient(135deg,${STUDIO_RING[0]},${STUDIO_RING[1]})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 11.5,
                  fontWeight: 900,
                }}
              >
                {c.tenantName.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.tenantName}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {whereBits}
                </div>
              </div>
            </div>
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(mapsQuery)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open this venue in Maps"
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10.5,
                fontWeight: 800,
                color: col,
                cursor: "pointer",
                border: `1px solid ${col}44`,
                borderRadius: 999,
                padding: "5px 11px",
                textDecoration: "none",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
              Maps
            </a>
          </div>
          {/* what the room HAS arrives with rooms (Step 11) — until then, the honest line */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Nothing listed for {c.room ?? "this venue"} yet.
            </span>
          </div>
        </Sec>

        {/* ── POLICY — what the price does NOT tell you (12399-12402). The
            Memberships row waits for passes to exist (see backlog). ── */}
        {!done && (
          <Sec
            col={col}
            label="POLICY"
            icon={
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="7" width="16" height="13" rx="2.5" />
                <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7M4 12.5h16" />
              </svg>
            }
          >
            <Row k="Refund" v={isFree ? "Not applicable — free" : "Full refund until 48 h before"} />
          </Sec>
        )}
          </>
        )}

        {/* ── ATTENDANCE — the register and the queue (prototype 12043-12138).
            Walk-ins and the QR scanner arrive with the people work (backlog). ── */}
        {ownerTabs && ownerSeg === "att" && register && (
          <>
            {/* the clock starts the session, not a button (12050-12063) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: sessionPhase === "live" ? "rgba(34,197,94,.10)" : "var(--card)",
                border: `1px solid ${sessionPhase === "live" ? "rgba(34,197,94,.32)" : "var(--el)"}`,
                borderRadius: 16,
                padding: "11px 13px",
                marginBottom: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 900, color: sessionPhase === "live" ? "#22C55E" : "var(--text)" }}>
                  {sessionPhase === "ended" ? "Session ended" : sessionPhase === "live" ? "Session live" : "Not started yet"}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                  {sessionPhase === "ended"
                    ? "The register below is final."
                    : sessionPhase === "live"
                      ? `${checkedInCount} checked in · check-in is open`
                      : time
                        ? `Opens by itself at ${time.split("–")[0].trim()} — nothing to press.`
                        : "Opens by itself at the start time — nothing to press."}
                </div>
              </div>
              {sessionPhase === "live" && (
                <span style={{ position: "relative", width: 10, height: 10, flexShrink: 0, marginRight: 4 }}>
                  <span style={{ position: "absolute", inset: 0, borderRadius: 5, background: "#22C55E" }} />
                  <span
                    style={{
                      position: "absolute",
                      inset: -4,
                      borderRadius: 9,
                      border: "2px solid #22C55E",
                      opacity: 0.4,
                      animation: "dosPulse 1.4s ease-out infinite",
                    }}
                  />
                  <style>{`@keyframes dosPulse{0%{transform:scale(.8);opacity:.6}100%{transform:scale(1.9);opacity:0}}`}</style>
                </span>
              )}
            </div>

            {/* the waitlist is a queue of real people — the owner hands a freed
                spot to the next one (12080-12099) */}
            {register.waitlist.length > 0 && (
              <Sec
                col={col}
                label={`WAITLIST · ${register.waitlist.length} WAITING`}
                icon={
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="8.5" />
                    <path d="M12 7.5V12l3 2" />
                  </svg>
                }
              >
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginBottom: 8 }}>
                  {soldOut
                    ? "The class is full — offer the next spot the moment one frees."
                    : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} open — offer them now.`}
                </div>
                {register.waitlist.map((w, i) => (
                  <div
                    key={w.enrollmentId}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--el)" }}
                  >
                    <span style={{ width: 22, fontSize: 11, fontWeight: 900, color: "var(--muted)", fontFamily: DOS_MONO }}>
                      #{i + 1}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 12.5,
                        fontWeight: 700,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {w.learnerName}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      aria-label={`Give the spot to ${w.learnerName}`}
                      onClick={() => {
                        if (soldOut) {
                          fire("Free a spot first — the class is full");
                          return;
                        }
                        void runRegisterOp(w.enrollmentId, giveSpotAction, `✅ ${w.learnerName} moved off the waitlist`);
                      }}
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        color: soldOut ? "var(--muted)" : "#22C55E",
                        cursor: "pointer",
                        flexShrink: 0,
                        border: `1px solid ${soldOut ? "var(--el)" : "#22C55E55"}`,
                        borderRadius: 999,
                        padding: "4px 10px",
                        opacity: opPending === w.enrollmentId ? 0.5 : 1,
                      }}
                    >
                      Give spot
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      aria-label={`Remove ${w.learnerName} from the waitlist`}
                      onClick={() =>
                        void runRegisterOp(w.enrollmentId, removeFromWaitlistAction, `${w.learnerName} removed from the waitlist`)
                      }
                      style={{ fontSize: 13, color: "var(--muted)", cursor: "pointer", flexShrink: 0, padding: "0 2px" }}
                    >
                      ✕
                    </span>
                  </div>
                ))}
              </Sec>
            )}

            {/* the register itself (12117-12137) */}
            <Sec
              col={col}
              label={`${sessionPhase === "ended" ? "FINAL REGISTER" : "LIVE REGISTER"} · ${checkedInCount}/${c.capacity} IN`}
              icon={
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                  <path d="m8.5 14.5 2.3 2.3 4.7-4.7" />
                </svg>
              }
            >
              <div style={{ height: 6, borderRadius: 3, background: "var(--el)", marginBottom: 10 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 3,
                    width: `${Math.min(100, (100 * checkedInCount) / Math.max(1, c.capacity))}%`,
                    background: soldOut ? "#EF4444" : `linear-gradient(90deg,${col},${col}88)`,
                  }}
                />
              </div>
              {register.rows.map((r, i) => (
                <div
                  key={r.enrollmentId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 0",
                    borderBottom: i === register.rows.length - 1 ? "none" : "1px solid var(--el)",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 900,
                      background: r.checkedIn ? `linear-gradient(135deg,${col},#7C3AED)` : "var(--el)",
                      color: r.checkedIn ? "#fff" : "var(--sub)",
                    }}
                  >
                    {r.learnerName.split(" ").map((x) => x[0]).join("").slice(0, 2)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{r.learnerName}</div>
                  </div>
                  {sessionPhase === "ended" ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "6px 12px",
                        borderRadius: 999,
                        flexShrink: 0,
                        background: r.checkedIn ? "rgba(34,197,94,.22)" : "var(--el)",
                        color: r.checkedIn ? "#22C55E" : "var(--sub)",
                      }}
                    >
                      {r.checkedIn ? "✓ In" : "—"}
                    </span>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      aria-label={r.checkedIn ? `Check ${r.learnerName} out` : `Check ${r.learnerName} in`}
                      onClick={() =>
                        void runRegisterOp(
                          r.enrollmentId,
                          r.checkedIn ? undoCheckInAction : checkInAction,
                          r.checkedIn ? `${r.learnerName} checked out` : `${r.learnerName} checked in`
                        )
                      }
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: "6px 12px",
                        borderRadius: 999,
                        cursor: "pointer",
                        flexShrink: 0,
                        background: r.checkedIn ? "rgba(34,197,94,.22)" : "var(--el)",
                        color: r.checkedIn ? "#22C55E" : "var(--text)",
                        opacity: opPending === r.enrollmentId ? 0.5 : 1,
                      }}
                    >
                      {r.checkedIn ? "✓ In" : "Check in"}
                    </span>
                  )}
                </div>
              ))}
              {register.rows.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Nobody has booked yet.</div>
              )}
            </Sec>
          </>
        )}
      </div>

      {/* ── ROOM FOR THE ONE THING YOU CAN PRESS — the booking bar (12405-12444).
          The two-step pay flow arrives with Razorpay (Step 9); booking is free/stubbed. ── */}
      {showBar && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 430,
            boxSizing: "border-box",
            padding: "12px 16px 22px",
            zIndex: 400,
            background: "var(--solid)",
            borderTop: "1px solid var(--el)",
            boxShadow: "0 -6px 22px rgba(0,0,0,.28)",
          }}
        >
          {!isSignedIn ? (
            <Link
              href="/login"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "15px",
                borderRadius: 999,
                fontWeight: 900,
                fontSize: 14.5,
                background: "var(--text)",
                color: "var(--solid)",
                textDecoration: "none",
                boxShadow: "0 5px 16px rgba(0,0,0,.32)",
              }}
            >
              Sign in to book
            </Link>
          ) : soldOut && !booked ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "13px 14px",
                borderRadius: 16,
                background: "rgba(239,68,68,.12)",
                border: "1px solid rgba(239,68,68,.4)",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F87171"
                strokeWidth="1.9"
                strokeLinecap="round"
                style={{ flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#F87171" }}>Sold out</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>
                  All {c.capacity} spots are taken — join the waitlist and we&rsquo;ll tell you if one opens.
                </div>
              </div>
              <form action={enrollForm} style={{ flexShrink: 0, display: "flex" }}>
                <input type="hidden" name="sessionId" value={c.session!.id} />
                <button
                  type="submit"
                  disabled={enrollPending}
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: "#F87171",
                    cursor: "pointer",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                  }}
                >
                  {enrollPending ? "Joining…" : "Waitlist"}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)" }}>
                  {isFree ? "FREE TRIAL" : "PER SESSION"}
                </div>
                <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, lineHeight: 1.15 }}>{price}</div>
              </div>
              {booked ? (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  onClick={() => fire("Already booked — it’s on your Home deck")}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "15px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 14.5,
                    background: "var(--card)",
                    color: "var(--text)",
                    border: "1.5px solid var(--el)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  Booked
                </div>
              ) : (
                /* two steps now, in the order a person thinks in (12439): free goes
                   straight to the confirm sheet, paid chooses how it's paying first */
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  onClick={() => setFlowOpen(true)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "15px",
                    borderRadius: 999,
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 14.5,
                    background: "var(--text)",
                    color: "var(--solid)",
                    boxShadow: "0 5px 16px rgba(0,0,0,.32)",
                    fontFamily: DOS_UI,
                  }}
                >
                  {isFree ? "Book free trial" : "Book this class"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M5 12h13M13 6.5 18.5 12 13 17.5" />
                  </svg>
                </div>
              )}
            </div>
          )}
          {enrollState.outcome === "waitlisted" && (
            <div style={{ fontSize: 10.5, color: GOLD, fontWeight: 800, marginTop: 8, textAlign: "center" }}>
              📋 On the waitlist — you get the next freed spot.
            </div>
          )}
          {actionError && (
            <div style={{ fontSize: 10.5, color: "#EF4444", fontWeight: 700, marginTop: 8, textAlign: "center" }}>
              {actionError}
            </div>
          )}
        </div>
      )}

      {/* ── a draft has no attendance and no refunds — editing it is the only move (12446-12455) ── */}
      {canManage && isDraft && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 400,
            maxWidth: 430,
            margin: "0 auto",
            background: "var(--solid)",
            borderTop: "1px solid var(--el)",
            padding: "12px 16px 26px",
            boxShadow: "0 -6px 20px rgba(0,0,0,.32)",
          }}
        >
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 8, fontFamily: DOS_UI }}>
            YOUR DRAFT · PUBLISH TO OPEN BOOKINGS
          </div>
          <Link
            href={`/business/${c.tenantId}/classes/${c.id}/edit`}
            style={{
              display: "block",
              textAlign: "center",
              padding: "13px",
              borderRadius: 999,
              background: "var(--text)",
              color: "var(--solid)",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
              textDecoration: "none",
            }}
          >
            Edit class
          </Link>
        </div>
      )}

      {passOpen && (
        <PassSheet
          posterItem={posterItem}
          posterK={posterK}
          col={col}
          title={c.title}
          styleName={c.style}
          levelWord={levelWord}
          pass={pass}
          slug={c.shareSlug}
          fire={fire}
          onClose={() => setPassOpen(false)}
        />
      )}
      {flowOpen && c.session && (
        <PayFlow
          sessionId={c.session.id}
          isFree={isFree}
          priceInr={c.priceInr}
          posterItem={posterItem}
          posterK={posterK}
          col={col}
          metaTop={`${c.style}${time ? ` · ${time}` : ""}`}
          metaBottom={`${c.room ?? c.tenantName}${c.tenantCity ? `, ${c.tenantCity}` : ""}`}
          businessName={c.tenantName}
          classLabel={c.title}
          onClose={() => setFlowOpen(false)}
          onDone={(msg) => {
            setFlowOpen(false);
            fire(msg);
          }}
        />
      )}
      {invoiceOpen && mine && (
        <InvoiceSheet
          title={c.title}
          whenText={whenText}
          whereText={whereText}
          enrollmentId={mine.id}
          amountInr={receipt?.amountInr ?? null}
          method={receipt?.method ?? null}
          onClose={() => setInvoiceOpen(false)}
        />
      )}
      {refundOpen && mine && (
        <RefundSheet
          enrollmentId={mine.id}
          title={c.title}
          timeText={whenText}
          amountInr={receipt?.amountInr ?? 0}
          onClose={() => setRefundOpen(false)}
          onDone={(msg) => {
            setRefundOpen(false);
            fire(msg);
            router.refresh();
          }}
        />
      )}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 110,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--el)",
            border: "1.5px solid #EC4899",
            color: "var(--text)",
            padding: "11px 18px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 700,
            maxWidth: 390,
            textAlign: "center",
            zIndex: 650,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
