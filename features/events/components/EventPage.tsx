"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { PassSheet } from "@/features/classes/components/PassSheet";
import { DOS_SLEEVE, DosPosterSleeve, dosPosterAuto, useDosFold } from "@/features/classes/components/poster";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { bookEventAction, cancelEventBookingAction } from "@/features/events/server-actions/events";
import { PeoplePicker } from "@/features/people/components/PeoplePicker";
import { DOS_DISPLAY, DOS_UI, GOLD, GREEN } from "@/lib/design/tokens";
import type { Profile } from "@/types/profile";
import {
  EVENT_CRITERIA,
  EV_TINT,
  FORMAT_WORD,
  TYPE_LABEL,
  entriesOf,
  entryCapacityOf,
  seatCapacityOf,
  seatsSoldOf,
  takesEntries,
  type DanceEvent,
  type EntryFormat,
  type EventBooking,
} from "@/types/event";
import { EventCard } from "./EventCard";
import { EvFormatIcon, bookingWords, eventCodeOf, eventTimeWords, eventWhen } from "./event-kit";

/** The event page at its booking link — /e/{slug}. Lifted from prototype S_event
 *  (DanceOSApp.jsx:12810-13516): the same player-lit sleeve the class page
 *  wears, then THE CARD ITSELF ON THE PAGE ("this IS the card component,
 *  rendered without a click: the page cannot disagree with the card by
 *  construction"), PRIZE MONEY, WHEN, VENUE, FORMAT, TICKETS (or ENTRY),
 *  WHAT TO KNOW, POLICY, and ONE BAR STUCK TO THE BOTTOM because booking IS the
 *  page — "Book as participant" / "Book as a spectator" — opening the confirm
 *  sheet (entering as · your partner · which crew · how many) and then THE
 *  PAYMENT STEP, "one sheet, both kinds of booking". Money, honestly: every
 *  free seat or entry books through `book_event`; a priced one prints Step 9's
 *  sentence instead of a methods list, because the rail has no account yet.
 *
 *  Departures, stated (tracked in the parity backlog): the duet partner and the
 *  crew are typed names, not the PeoplePicker / the crews you lead (crews are
 *  Step 22); the venue's amenity chips are not printed (the prototype seeds the
 *  same five for every event — we hold no venue amenities); the event waitlist,
 *  the judging sheet and the completed page's WHO ATTENDED are not drawn (no
 *  rows behind them, and who attended is private data). */

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/* one k/v line inside a section — prototype DRowFlat (11593) */
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5.5px 0", fontSize: 13 }}>
      <span style={{ color: "var(--sub)" }}>{k}</span>
      <b style={{ fontWeight: strong ? 900 : 700, textAlign: "right", minWidth: 0 }}>{v}</b>
    </div>
  );
}

/* one section shape for the whole page — prototype DSecTint (11545-11551) */
function Sec({ icon, label, col, children }: { icon: ReactNode; label: string; col: string; children: ReactNode }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderLeft: `3px solid ${col}55`, borderRadius: 16, padding: "12px 14px", marginBottom: 10, textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: 1.2, color: "var(--sub)" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

/* the page's own host, read the sanctioned way (same pattern as ShareSheet) */
const subscribeNever = () => () => {};
const readHost = () => window.location.host;
const readServerHost = () => "";

const sheetStyle: React.CSSProperties = {
  background: "var(--solid)",
  borderRadius: "24px 24px 0 0",
  padding: "18px 16px 30px",
  width: "100%",
  maxWidth: 430,
  boxSizing: "border-box",
  color: "var(--text)",
  animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)",
};
const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  zIndex: 600,
};
const ghostBtn: React.CSSProperties = {
  flex: 1,
  textAlign: "center",
  padding: "13px",
  borderRadius: 999,
  background: "var(--card)",
  border: "1px solid var(--el)",
  fontWeight: 700,
  fontSize: 13.5,
  cursor: "pointer",
  color: "var(--text)",
  fontFamily: "inherit",
};
const solidBtn: React.CSSProperties = {
  flex: 1.3,
  textAlign: "center",
  padding: "13px",
  borderRadius: 999,
  background: "var(--text)",
  color: "var(--solid)",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  border: "none",
  fontFamily: "inherit",
};
const eyebrow: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6, color: "var(--muted)", margin: "0 0 6px", textTransform: "uppercase" };
export interface EventPageProps {
  event: DanceEvent;
  isSignedIn: boolean;
  /** the viewer belongs to the organiser — "you run this event", never a ticket */
  isMember: boolean;
  /** owner or trainer — sees the draft footer's Edit event */
  canManage: boolean;
  /** the viewer's own live bookings on this event */
  mine: EventBooking[];
  /** Step 22: the crews the viewer LEADS — a crew is entered from these (13397-13420) */
  ledCrews?: Array<{ id: string; name: string; members: number }>;
  /** the IST day, stamped server-side so the page never runs a clock in render */
  todayKey: string;
}

export function EventPage({ event: ev, isSignedIn, isMember, canManage, mine, ledCrews = [], todayKey }: EventPageProps) {
  const router = useRouter();
  const cat = ev.cat;
  const col = EV_TINT[cat];
  const CRIT = EVENT_CRITERIA[cat] ?? [];
  const heroGone = useDosFold(DOS_SLEEVE);
  const host = useSyncExternalStore(subscribeNever, readHost, readServerHost);
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };
  const [tier, setTier] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [evPass, setEvPass] = useState(false);
  const [bookMode, setBookMode] = useState<"audience" | "participant">("audience");
  const [entryAs, setEntryAs] = useState<EntryFormat | null>(null);
  /* Step 22: the partner is a PERSON on DanceOS, the crew one you lead */
  const [partner, setPartner] = useState<Profile | null>(null);
  const [crewId, setCrewId] = useState<string | null>(ledCrews.length === 1 ? ledCrews[0].id : null);
  const crewName = ledCrews.find((c) => c.id === crewId)?.name ?? "";
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [cancelAsk, setCancelAsk] = useState<EventBooking | null>(null);

  /* a finished event is a record, not a product — no booking, the final figures instead */
  const done = ev.status === "completed" || ev.endDate < todayKey;
  const isDraft = ev.status === "draft";
  /* the page agrees with the card that opened it: live only inside its own days */
  const liveNow = ev.status === "published" && ev.startDate <= todayKey && todayKey <= ev.endDate && !done;

  const tick = ev.ticketsOn && ev.ticketTiers.length > 0;
  const tiers = ev.ticketTiers;
  const sold = seatsSoldOf(ev);
  const cap = seatCapacityOf(ev);
  const sel = tiers[Math.min(tier, Math.max(0, tiers.length - 1))] ?? null;
  const allGone = tick && tiers.every((t) => t.sold >= t.capacity);
  const price = sel ? (sel.priceInr === 0 ? "Free" : `₹${sel.priceInr}`) : "Free";

  /* WHAT IT COSTS TO ENTER — the ways in, each its own price and places (16070) */
  const open = takesEntries(cat) ? ev.entryTiers : [];
  const entryFmt: EntryFormat | "all" | null = open.length === 0 ? null : open.length === 1 ? open[0].format : "all";
  const fees = open.map((t) => t.feeInr);
  const compFeeLow = fees.length ? Math.min(...fees) : 0;
  const entered = entriesOf(ev);
  const entryCap = entryCapacityOf(ev);

  /* ── ONE BOOKING, DESCRIBED ONCE (12880-12898) ── */
  const seatsLeft = sel ? Math.max(0, sel.capacity - sel.sold) : 0;
  const asFmt: EntryFormat | null = bookMode === "participant" ? (entryFmt === "all" ? entryAs : entryFmt) : null;
  const asTier = asFmt ? open.find((t) => t.format === asFmt) ?? null : null;
  const dueNow = bookMode === "audience" ? (sel?.priceInr ?? 0) * Math.max(1, qty) : asTier?.feeInr ?? 0;
  const whatFor =
    bookMode === "audience"
      ? `${ev.title} · ${qty} × ${sel?.name ?? "Ticket"}`
      : `${ev.title} · ${asFmt === "crew" ? `${crewName || "crew"} entry` : asFmt === "duo" ? `duet entry${partner ? ` with ${partner.fullName}` : ""}` : "solo entry"}`;
  /* the one place that knows whether this booking may go ahead */
  const whyNotReady = (): string | null => {
    if (bookMode === "audience") return seatsLeft < 1 ? "Sold out" : null;
    if (entryFmt === "all" && !entryAs) return "Pick solo, duet or crew";
    if (asFmt === "crew" && !crewId) return ledCrews.length ? "Pick the crew you are entering" : "Only the person who leads a crew can enter it";
    if (asFmt === "duo" && !partner) return "A duet needs your partner — pick them from DanceOS";
    return null;
  };
  /* and the one place that writes it */
  const commitBooking = async () => {
    if (busy) return;
    setBusy(true);
    const out = await bookEventAction(
      bookMode === "audience"
        ? { eventId: ev.id, slug: ev.shareSlug, kind: "spectator", ticketTierId: sel?.id ?? null, qty: Math.max(1, qty) }
        : {
            eventId: ev.id,
            slug: ev.shareSlug,
            kind: "participant",
            format: asFmt,
            crewId: asFmt === "crew" ? crewId : null,
            partnerId: asFmt === "duo" ? partner?.id ?? null : null,
          }
    );
    setBusy(false);
    if (out.error) {
      fire(out.error);
      return;
    }
    setPayOpen(false);
    fire(bookMode === "audience" ? `🎟 ${qty > 1 ? `${qty} tickets` : "Ticket"} booked — in My classes` : "🎉 Entered — your entry is in My classes");
    router.refresh();
  };
  const cancelBooking = async (b: EventBooking) => {
    if (busy) return;
    setBusy(true);
    const out = await cancelEventBookingAction({ bookingId: b.id, slug: ev.shareSlug });
    setBusy(false);
    setCancelAsk(null);
    fire(out.error ?? (b.kind === "spectator" ? "Ticket cancelled — the seat is back on sale" : "Entry withdrawn"));
    router.refresh();
  };

  const Ic = (p: ReactNode) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
  const posterItem = { title: ev.title, style: ev.style, styleColor: col };
  const posterK = ev.poster && ev.poster !== "none" ? ev.poster : dosPosterAuto(ev.title);
  const held = mine.length > 0;
  /* the pass behind the poster (dosCodeFor 115-121): a ticket you hold shows its
     code, everyone else gets the booking link */
  const pass = held
    ? { code: eventCodeOf(mine[0].id), label: "Entry code", note: "Show this at the door." }
    : { code: `${host || ""}/e/${ev.shareSlug}`, label: "Booking link", note: isMember ? "Anyone who scans this can book your event." : "Anyone who scans this can book this event." };
  const canEnter = !isMember && takesEntries(cat) && open.length > 0;
  /* a ticket you hold does not need a bar offering to sell you one (13236) */
  const showBar = !isDraft && !held;
  const mapsHref = /^https?:\/\//i.test(ev.mapsUrl) ? ev.mapsUrl : `https://maps.google.com/?q=${encodeURIComponent([ev.venue, ev.address ?? ev.city].filter(Boolean).join(", "))}`;
  const prizePool = ev.prizes.reduce((a, x) => a + (x || 0), 0);
  const PL = ["1st", "2nd", "3rd"];

  return (
    <div style={{ background: "var(--bg)", maxWidth: 430, margin: "0 auto", color: "var(--text)", paddingBottom: showBar || (canManage && isDraft) ? 130 : 40, fontFamily: DOS_UI }}>
      <style>{`@keyframes dosSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      {/* ── THE SLEEVE — the same player-lit sleeve the class page uses (12921) ── */}
      <DosPosterSleeve item={posterItem} design={posterK} col={col} heroGone={heroGone} onOpen={!isDraft ? () => setEvPass(true) : undefined} label={`Open the poster for ${ev.title}`} />

      {/* ── THE CARD ITSELF, ON THE PAGE (12928-12951) ── */}
      <div style={{ padding: "0 16px 10px", position: "relative", zIndex: 1, background: "var(--bg)" }}>
        <div style={{ height: 1, background: "var(--el)", margin: "16px 0 20px" }} />
        <EventCard event={ev} />
        {liveNow ? (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, padding: "4px 11px", borderRadius: 999, background: GREEN, color: "#fff" }}>● LIVE NOW</span>
          </div>
        ) : null}
      </div>

      <div style={{ padding: "12px 16px 0", position: "relative", zIndex: 1, background: "var(--bg)" }}>
        {/* a ticket you hold: the same block as a class booking (BookingActions compact, 12956) */}
        {held && !isMember && !done
          ? mine.map((b) => (
              <div key={b.id} data-testid="held-booking" style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "12px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: GREEN, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.kind === "spectator" ? "You’re booked" : "You’re entered"}</span>
                  <span style={{ fontFamily: DOS_MONO, fontSize: 10, color: "var(--muted)", marginLeft: "auto", flexShrink: 0 }}>{eventCodeOf(b.id)}</span>
                </div>
                <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>
                  {bookingWords(b)} · {b.amountInr > 0 ? `paid ₹${b.amountInr.toLocaleString("en-IN")}` : "free"} · see it under My classes.
                </div>
                <div style={{ display: "flex", alignItems: "stretch", marginTop: 10, border: "1px solid var(--el)", borderRadius: 999, overflow: "hidden", background: "var(--solid)" }}>
                  <span role="button" tabIndex={0} onKeyDown={dosKey} aria-label={b.kind === "spectator" ? "Cancel ticket" : "Withdraw entry"} onClick={() => setCancelAsk(b)} style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 6px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", color: "#F87171" }}>
                    {b.kind === "spectator" ? "Cancel ticket" : "Withdraw entry"}
                  </span>
                </div>
              </div>
            ))
          : null}

        {/* final figures — shown only once the event is over (12968-12995). The
            counts are public; who came in and what it made are the organiser's. */}
        {done ? (
          <Sec
            col={col}
            icon={Ic(
              <>
                <circle cx="12" cy="12" r="8.5" />
                <path d="m8.5 12.5 2.5 2.5 4.5-5" />
              </>
            )}
            label="EVENT COMPLETED · FINAL FIGURES"
          >
            <div style={{ display: "flex", gap: 7 }}>
              {(
                [
                  ...(tick ? [["TICKETS SOLD", `${sold}/${cap}`]] : []),
                  ...(takesEntries(cat) ? [["PARTICIPANTS", `${entered}${entryCap ? `/${entryCap}` : ""}`]] : []),
                ] as Array<[string, string]>
              ).map(([lab, val]) => (
                <div key={lab} style={{ flex: 1, background: "var(--el)", borderRadius: 11, padding: "8px 9px", minWidth: 0 }}>
                  <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.5, color: "var(--muted)" }}>{lab}</div>
                  <div style={{ fontFamily: DOS_MONO, fontSize: 14, fontWeight: 700, marginTop: 2 }}>{val}</div>
                </div>
              ))}
            </div>
          </Sec>
        ) : null}

        {/* ── WHAT YOU ARE COMPETING FOR (13001-13019) ── */}
        {prizePool > 0 ? (
          <Sec
            col={col}
            icon={Ic(
              <>
                <path d="M7.5 3.5h9v5a4.5 4.5 0 0 1-9 0z" />
                <path d="M7.5 4.8H4.9v2a2.6 2.6 0 0 0 2.6 2.6M16.5 4.8h2.6v2a2.6 2.6 0 0 1-2.6 2.6" />
                <path d="M12 13v3.5M8.8 20.5h6.4l-.7-4H9.5z" />
              </>
            )}
            label="PRIZE MONEY"
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 24, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.8, color: GOLD }}>₹{prizePool.toLocaleString("en-IN")}</span>
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)" }}>TOTAL POOL</span>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              {ev.prizes.map((amt, pi) =>
                amt > 0 ? (
                  <div key={pi} style={{ flex: 1, minWidth: 0, background: "var(--el)", borderRadius: 12, padding: "9px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: pi === 0 ? GOLD : "var(--muted)" }}>{PL[pi] ?? `${pi + 1}th`}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, fontFamily: DOS_MONO, marginTop: 3, color: pi === 0 ? GOLD : "var(--text)" }}>₹{amt.toLocaleString("en-IN")}</div>
                  </div>
                ) : null
              )}
            </div>
          </Sec>
        ) : null}

        {/* WHEN — the card says the date; this adds the SPAN (13020-13029) */}
        <Sec
          col={col}
          icon={Ic(
            <>
              <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
              <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
            </>
          )}
          label="WHEN"
        >
          <Row k="Dates" v={eventWhen(ev.startDate, ev.endDate)} />
          <Row k="Time" v={eventTimeWords(ev.startTime)} />
          <Row k="Styles" v={ev.style || "Open format"} />
          {takesEntries(cat) ? <Row k="Entry" v={entryFmt === "solo" ? "Solo" : entryFmt === "crew" ? "Crews" : entryFmt === "duo" ? "Duets" : entryFmt === "all" ? "All formats" : "—"} /> : null}
        </Sec>

        {/* VENUE (13030-13046) — the amenity chips are not printed: we hold none */}
        <Sec
          col={col}
          icon={Ic(
            <>
              <path d="M12 21s-6.5-5.7-6.5-10A6.5 6.5 0 0 1 12 4.5 6.5 6.5 0 0 1 18.5 11c0 4.3-6.5 10-6.5 10z" />
              <circle cx="12" cy="10.8" r="2.3" />
            </>
          )}
          label="VENUE"
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "2px 0 2px" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg,${col}55,${col}22)`, border: `1px solid ${col}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 20V9l8-5 8 5v11" />
                <path d="M9 20v-6h6v6" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 900 }}>{ev.venue}</div>
              <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2, lineHeight: 1.45 }}>{ev.address ?? ev.city}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>by {ev.tenantName}</div>
            </div>
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" aria-label="Open the venue in Maps" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, color: col, cursor: "pointer", flexShrink: 0, textDecoration: "none" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
              Maps
            </a>
          </div>
        </Sec>

        {/* FORMAT (13066-13071) — how a battle or a tournament runs */}
        {cat === "battle" || cat === "tournament" ? (
          <Sec
            col={col}
            icon={Ic(
              <>
                <path d="M6 4h12v5a6 6 0 0 1-12 0z" />
                <path d="M9 20h6M12 15v5" />
              </>
            )}
            label="FORMAT"
          >
            <Row k="Format" v={cat === "battle" ? `Top ${ev.bracket || 16} knockout` : `${ev.rounds || 3} rounds`} />
            <Row k="Registered" v={`${entered} ${entryFmt === "crew" ? "crews" : "competitors"}${entryCap ? ` of ${entryCap}` : ""}`} />
            {open.map((t) => (
              <Row key={t.format} k={`${FORMAT_WORD[t.format]} entry`} v={t.feeInr > 0 ? `₹${t.feeInr.toLocaleString("en-IN")}` : "Free"} strong={t.feeInr > 0} />
            ))}
            {CRIT.length > 0 ? <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>Scored on {CRIT.join(" · ")} — 0–10 each.</div> : null}
          </Sec>
        ) : null}

        {/* TICKETS (13072-13094) — the tiers, radio-shaped, and the seats bar; or ENTRY when there are none */}
        {done ? null : tick ? (
          <Sec
            col={col}
            icon={Ic(
              <>
                <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a2.5 2.5 0 0 0 0-5z" />
                <path d="M13.5 6v2M13.5 11v2M13.5 16v2" />
              </>
            )}
            label="TICKETS"
          >
            {tiers.map((t, i) => {
              const left = Math.max(0, t.capacity - t.sold);
              const on = tier === i;
              const pct = Math.round((100 * t.sold) / Math.max(1, t.capacity));
              return (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  key={t.id}
                  aria-pressed={on}
                  aria-label={`${t.name} tier`}
                  onClick={() => left > 0 && setTier(i)}
                  style={{ position: "relative", overflow: "hidden", padding: "12px 13px", borderRadius: 16, marginBottom: 8, cursor: left > 0 ? "pointer" : "default", background: on ? `${col}14` : "var(--el)", border: `2px solid ${on ? col : "transparent"}`, opacity: left > 0 ? 1 : 0.5, transition: "all .15s" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, border: `2px solid ${on ? col : "var(--muted)"}`, background: on ? col : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {on ? (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" aria-hidden="true">
                          <path d="m5 12.5 4.5 4.5L19 7.5" />
                        </svg>
                      ) : null}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 900 }}>{t.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 2 }}>{left > 0 ? (left <= 10 ? `Only ${left} left` : `${left} of ${t.capacity} available`) : "Sold out"}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: t.priceInr === 0 ? "#4ADE80" : on ? col : "var(--text)" }}>{t.priceInr === 0 ? "Free" : `₹${t.priceInr}`}</div>
                      {left > 0 && left <= 10 ? <div style={{ fontSize: 8.5, fontWeight: 900, color: GOLD, letterSpacing: 0.4 }}>SELLING FAST</div> : null}
                    </div>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,.12)", marginTop: 10 }}>
                    <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: on ? col : "var(--muted)" }} />
                  </div>
                </div>
              );
            })}
            <div style={{ height: 6, borderRadius: 3, background: "var(--el)", marginTop: 4 }}>
              <div style={{ height: 6, borderRadius: 3, width: `${Math.round((100 * sold) / Math.max(1, cap))}%`, background: `linear-gradient(90deg,${col},${col}99)` }} />
            </div>
            <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 6 }}>
              {sold} booked · {Math.max(0, cap - sold)} still available
            </div>
          </Sec>
        ) : (
          <Sec
            col={col}
            icon={Ic(
              <>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 8v5M12 16v.01" />
              </>
            )}
            label="ENTRY"
          >
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--sub)" }}>
              {cat === "showcase" ? "No spectator tickets for this one — the host invites the audience, and the line-up is theirs to build." : "No spectator tickets for this event. Registration is for participants only."}
            </div>
            {compFeeLow > 0 ? <Row k="Registration fee" v={`₹${compFeeLow}`} strong /> : null}
          </Sec>
        )}

        {/* WHAT TO KNOW (13124-13131) — what the organiser wrote for the people reading this */}
        {ev.about ? (
          <Sec
            col={col}
            icon={Ic(
              <>
                <path d="M12 3.6 14.4 9l5.6.6-4.2 3.9 1.1 5.6-4.9-2.9-4.9 2.9L8.2 13.5 4 9.6 9.6 9z" />
              </>
            )}
            label="WHAT TO KNOW"
          >
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--sub)", whiteSpace: "pre-wrap" }}>{ev.about}</div>
          </Sec>
        ) : null}

        {/* POLICY (13132-13136) — only promises the code keeps: a booking cancels until
            the event ends and the seat goes back on sale; the pass is on this page */}
        <Sec
          col={col}
          icon={Ic(
            <>
              <rect x="4" y="7" width="16" height="13" rx="2.5" />
              <path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7M4 12.5h16" />
            </>
          )}
          label="POLICY"
        >
          <Row k="Cancelling" v="Any time until the event ends — the seat goes back on sale" />
          <Row k="Your pass" v="Behind the poster on this page" />
          <Row k="Gate" v="Show your code — ID for competitors" />
        </Sec>
      </div>

      {/* ── ROOM FOR THE ONE THING YOU CAN PRESS — the booking bar (13236-13330) ── */}
      {showBar ? (
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, boxSizing: "border-box", padding: "12px 16px 22px", zIndex: 400, background: "var(--solid)", borderTop: "1px solid var(--el)", boxShadow: "0 -6px 22px rgba(0,0,0,.28)" }}>
          {done ? (
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", borderRadius: 16, background: "var(--card)", border: "1px solid var(--el)" }}>
              <span style={{ width: 32, height: 32, borderRadius: 16, background: "var(--el)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--sub)" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 900 }}>Event completed</div>
                <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 1 }}>{eventWhen(ev.startDate, ev.endDate)} · final figures above</div>
              </div>
              {isMember ? (
                <Link href={`/business/${ev.tenantId}/events/${ev.id}`} style={{ fontSize: 10.5, fontWeight: 800, color: col, textDecoration: "none", flexShrink: 0 }}>
                  Full report ›
                </Link>
              ) : null}
            </div>
          ) : isMember ? (
            <>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 8, fontFamily: DOS_UI }}>YOUR EVENT · ENTRY & CHECK-IN IN ONE PLACE</div>
              <Link href={`/business/${ev.tenantId}/events/${ev.id}`} style={{ display: "block", textAlign: "center", padding: "13px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13, textDecoration: "none" }}>
                Check-in / entry
              </Link>
            </>
          ) : !isSignedIn ? (
            <Link href="/login" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "15px", borderRadius: 999, fontWeight: 900, fontSize: 14.5, background: "var(--text)", color: "var(--solid)", textDecoration: "none", boxShadow: "0 5px 16px rgba(0,0,0,.32)" }}>
              Sign in to book
            </Link>
          ) : allGone && !canEnter ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 16, background: "rgba(239,68,68,.12)", border: "1px solid rgba(239,68,68,.4)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="1.9" strokeLinecap="round" style={{ flexShrink: 0 }} aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" />
                <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#F87171" }}>Sold out</div>
                <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>Every tier is gone — a cancelled seat goes straight back on sale here.</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 9 }}>
              {/* YOU DO NOT REGISTER YOURSELF FOR A SHOWCASE (13245) — canEnter is false for one */}
              {canEnter ? (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  aria-label="Register to compete"
                  onClick={() => {
                    setEntryAs(entryFmt === "all" ? null : entryFmt);
                    setPartner(null);
                    setBookMode("participant");
                    setConfirm(true);
                  }}
                  style={{ flex: 1, textAlign: "center", padding: "14px 8px", borderRadius: 999, cursor: "pointer", fontWeight: 900, fontSize: 13, WebkitTapHighlightColor: "transparent", background: "var(--card)", border: `1.5px solid ${col}`, color: col }}
                >
                  <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, opacity: 0.75 }}>{compFeeLow > 0 ? `₹${compFeeLow}` : "FREE"}</div>
                  Book as participant
                </div>
              ) : null}
              {tick && !allGone ? (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={dosKey}
                  aria-label="Book as a spectator"
                  onClick={() => {
                    setBookMode("audience");
                    setQty(1);
                    setConfirm(true);
                  }}
                  style={{ flex: 1.15, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "14px 8px", borderRadius: 999, cursor: "pointer", fontWeight: 900, fontSize: 13, WebkitTapHighlightColor: "transparent", background: "var(--text)", color: "var(--solid)", boxShadow: "0 5px 16px rgba(0,0,0,.32)" }}
                >
                  <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, opacity: 0.7 }}>{price}</div>
                  Book as a spectator
                </div>
              ) : null}
              {!canEnter && (!tick || allGone) ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 16, background: "var(--card)", border: "1px dashed var(--el)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{cat === "showcase" ? "Invite-only line-up" : "Nothing to book here"}</div>
                    <div style={{ fontSize: 10.5, color: "var(--sub)", marginTop: 1 }}>{cat === "showcase" ? "The host builds the line-up — no tickets are on sale." : "No tickets and no open entries."}</div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* a draft has no bookings — editing it is the only move (the class page's own footer) */}
      {canManage && isDraft ? (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 400, maxWidth: 430, margin: "0 auto", background: "var(--solid)", borderTop: "1px solid var(--el)", padding: "12px 16px 26px", boxShadow: "0 -6px 20px rgba(0,0,0,.32)" }}>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 8, fontFamily: DOS_UI }}>YOUR DRAFT · PUBLISH TO OPEN BOOKINGS</div>
          <Link href={`/business/${ev.tenantId}/events/${ev.id}/edit`} style={{ display: "block", textAlign: "center", padding: "13px", borderRadius: 999, background: "var(--text)", color: "var(--solid)", fontWeight: 900, fontSize: 13, cursor: "pointer", textDecoration: "none" }}>
            Edit event
          </Link>
        </div>
      ) : null}

      {/* ── THE CONFIRM SHEET (13331-13470): what you are entering as, then how many ── */}
      {confirm ? (
        <div onClick={() => setConfirm(false)} style={backdrop}>
          <div role="dialog" aria-modal="true" aria-label={bookMode === "participant" ? "Register to perform" : "Complete your booking"} onClick={(e) => e.stopPropagation()} style={sheetStyle}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <b style={{ fontSize: 16.5 }}>{bookMode === "participant" ? "Register to perform" : "Complete your booking"}</b>
            <div style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 12px", lineHeight: 1.5 }}>
              {ev.title}
              <br />
              {eventWhen(ev.startDate, ev.endDate)} · {eventTimeWords(ev.startTime)} · {ev.venue}
              <br />
              {bookMode === "participant" ? (asTier ? (asTier.feeInr > 0 ? `Entry · ₹${asTier.feeInr}` : "Entry · free") : "Entry") : `${sel?.name ?? "Ticket"} · ${sel && sel.priceInr ? `₹${sel.priceInr} each` : "Free"}`}
            </div>

            {/* ENTERING AS — three cards, the same size, each with its own mark (13345-13360) */}
            {bookMode === "participant" && entryFmt === "all" ? (
              <>
                <div style={eyebrow}>Entering as</div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${open.length},1fr)`, gap: 7, marginBottom: 12 }}>
                  {open.map((t) => {
                    const k = t.format;
                    const l = FORMAT_WORD[k];
                    const sub = k === "solo" ? "just you" : k === "duo" ? "you + 1" : "your crew";
                    const on = entryAs === k;
                    return (
                      <div
                        role="button"
                        tabIndex={0}
                        onKeyDown={dosKey}
                        key={k}
                        aria-pressed={on}
                        aria-label={`Enter as ${l}`}
                        onClick={() => {
                          setEntryAs(k);
                          setPartner(null);
                        }}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "11px 4px", borderRadius: 14, cursor: "pointer", boxSizing: "border-box", background: on ? `${col}18` : "var(--card)", border: `2px solid ${on ? col : "var(--el)"}`, color: on ? col : "var(--sub)" }}
                      >
                        <EvFormatIcon fmt={k} size={19} />
                        <span style={{ fontSize: 11.5, fontWeight: 900 }}>{l}</span>
                        <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--muted)", textAlign: "center" }}>{t.feeInr > 0 ? `₹${t.feeInr}` : sub}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            {/* A DUET IS TWO PEOPLE (13362-13395) — a person on DanceOS, picked, then ASKED;
                the entry stands either way (1815: what changes is what the organiser sees) */}
            {bookMode === "participant" && asFmt === "duo" ? (
              <>
                <div style={eyebrow}>Your partner</div>
                {partner ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--card)", border: `1.5px solid ${col}`, borderRadius: 14, padding: "10px 12px", marginBottom: 12 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>{partner.fullName}</span>
                      <span style={{ display: "block", fontSize: 9.5, color: "var(--muted)", marginTop: 1 }}>They will be asked to confirm — the entry holds either way.</span>
                    </span>
                    <button type="button" aria-label="Pick a different partner" onClick={() => setPartner(null)} style={{ fontSize: 10, fontWeight: 800, color: "var(--sub)", background: "var(--el)", border: "none", borderRadius: 999, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                      Change
                    </button>
                  </div>
                ) : (
                  <div style={{ background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 14, padding: "10px 12px", marginBottom: 12 }}>
                    <PeoplePicker title="YOUR PARTNER" placeholder="The dancer you are entering with" ariaLabel="Search DanceOS for your partner" actionWord="Pick ›" actionColor={col} pickLabel={(p) => `Enter with ${p.fullName}`} onPick={(p) => setPartner(p)} />
                  </div>
                )}
              </>
            ) : null}

            {/* A CREW IS ENTERED BY THE PERSON WHO LEADS IT (13397-13420) — from the crews you lead */}
            {bookMode === "participant" && asFmt === "crew" ? (
              <>
                <div style={eyebrow}>Which crew</div>
                {ledCrews.length === 0 ? (
                  <div style={{ background: "var(--card)", border: "1.5px dashed var(--el)", borderRadius: 14, padding: "12px", marginBottom: 12, fontSize: 11.5, color: "var(--sub)", lineHeight: 1.5 }}>
                    Only the person who leads a crew can put it forward — you don&apos;t lead one yet.{" "}
                    <Link href="/crews/new" style={{ color: col, fontWeight: 800 }}>
                      Create a crew ›
                    </Link>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 7, marginBottom: 12 }}>
                    {ledCrews.map((c) => {
                      const on = crewId === c.id;
                      return (
                        <div role="button" tabIndex={0} onKeyDown={dosKey} key={c.id} aria-pressed={on} aria-label={`Enter as ${c.name}`} onClick={() => setCrewId(c.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, cursor: "pointer", background: on ? `${col}18` : "var(--card)", border: `2px solid ${on ? col : "var(--el)"}` }}>
                          <EvFormatIcon fmt="crew" size={16} color={on ? col : "var(--sub)"} />
                          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                          <span style={{ fontSize: 9.5, color: "var(--muted)", flexShrink: 0 }}>
                            {c.members} member{c.members === 1 ? "" : "s"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : null}

            {/* HOW MANY (13422-13439): one stepper, and every figure below it counts what you bought */}
            {bookMode === "audience" ? (
              <>
                <div style={eyebrow}>How many</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card)", border: "1px solid var(--el)", borderRadius: 14, padding: "9px 12px", marginBottom: 12 }}>
                  {(
                    [
                      ["-", -1],
                      ["+", 1],
                    ] as Array<[string, number]>
                  ).map(([g, delta], gi) => (
                    <span
                      role="button"
                      tabIndex={0}
                      onKeyDown={dosKey}
                      key={g}
                      aria-label={delta < 0 ? "One fewer ticket" : "One more ticket"}
                      onClick={() => setQty((v) => Math.max(1, Math.min(seatsLeft || 1, 20, v + delta)))}
                      style={{ order: gi ? 3 : 1, width: 34, height: 34, borderRadius: 17, flexShrink: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900, background: "var(--el)", color: "var(--text)", opacity: (delta < 0 ? qty > 1 : qty < (seatsLeft || 1)) ? 1 : 0.35 }}
                    >
                      {g}
                    </span>
                  ))}
                  <span style={{ order: 2, flex: 1, textAlign: "center", minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 19, fontWeight: 900, fontFamily: DOS_MONO, fontVariantNumeric: "tabular-nums" }}>{qty}</span>
                    <span style={{ display: "block", fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginTop: 1 }}>
                      {qty === 1 ? "TICKET" : "TICKETS"} · {seatsLeft} LEFT
                    </span>
                  </span>
                </div>
              </>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button type="button" onClick={() => setConfirm(false)} style={ghostBtn}>
                Close
              </button>
              {/* AND THEN YOU PAY (13443-13449): both kinds hand over to one payment step */}
              <button
                type="button"
                onClick={() => {
                  const bad = whyNotReady();
                  if (bad) return fire(bad);
                  setConfirm(false);
                  setPayOpen(true);
                }}
                style={solidBtn}
              >
                {dueNow > 0 ? `Continue · ₹${dueNow.toLocaleString("en-IN")}` : "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── THE PAYMENT STEP (13452-13510): one sheet, both kinds of booking ── */}
      {payOpen ? (
        <div onClick={() => setPayOpen(false)} style={backdrop}>
          <div role="dialog" aria-modal="true" aria-label={dueNow > 0 ? "How are you paying?" : bookMode === "participant" ? "Confirm your entry" : "Confirm your booking"} onClick={(e) => e.stopPropagation()} style={sheetStyle}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <b style={{ fontSize: 16.5 }}>{dueNow > 0 ? "How are you paying?" : bookMode === "participant" ? "Confirm your entry" : "Confirm your booking"}</b>
            <div style={{ fontSize: 12, color: "var(--sub)", margin: "4px 0 14px", lineHeight: 1.5 }}>{whatFor}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "12px 14px", borderRadius: 14, background: "var(--card)", border: "1px solid var(--el)", marginBottom: dueNow > 0 ? 12 : 14 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 800, color: "var(--sub)" }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 900, fontFamily: DOS_MONO, fontVariantNumeric: "tabular-nums", color: dueNow > 0 ? "var(--text)" : "#4ADE80" }}>{dueNow > 0 ? `₹${dueNow.toLocaleString("en-IN")}` : "Free"}</span>
            </div>
            {dueNow > 0 ? (
              /* the prototype lists your saved methods here; we have no rail behind
                 events yet, so the sheet says so in Step 9's own words instead */
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 14, marginBottom: 12, background: "var(--card)", border: `1.5px dashed ${col}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 900 }}>Payments aren&rsquo;t switched on yet</div>
                  <div style={{ fontSize: 10, color: "var(--sub)", marginTop: 1, lineHeight: 1.45 }}>This {bookMode === "participant" ? "entry" : "ticket"} costs money and the rail has no account behind it — ask {ev.tenantName} to book you in.</div>
                </div>
              </div>
            ) : null}
            {dueNow > 0 ? <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5, margin: "2px 0 12px" }}>Class packs and memberships do not apply to events.</div> : null}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setPayOpen(false);
                  setConfirm(true);
                }}
                style={ghostBtn}
              >
                Back
              </button>
              <button type="button" disabled={busy || dueNow > 0} aria-disabled={dueNow > 0} onClick={() => void commitBooking()} style={{ ...solidBtn, flex: 1.4, opacity: dueNow > 0 ? 0.45 : 1, cursor: busy ? "wait" : dueNow > 0 ? "default" : "pointer" }}>
                {dueNow > 0 ? `Pay ₹${dueNow.toLocaleString("en-IN")}` : bookMode === "participant" ? "Confirm entry" : "Confirm booking"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* cancelling what you hold — the seat goes back on sale by arithmetic */}
      {cancelAsk ? (
        <div onClick={() => setCancelAsk(null)} style={backdrop}>
          <div role="dialog" aria-modal="true" aria-label={cancelAsk.kind === "spectator" ? "Cancel this ticket?" : "Withdraw this entry?"} onClick={(e) => e.stopPropagation()} style={{ ...sheetStyle, textAlign: "center" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
            <b style={{ fontSize: 17 }}>{cancelAsk.kind === "spectator" ? "Cancel this ticket?" : "Withdraw this entry?"}</b>
            <div style={{ fontSize: 11.5, color: "var(--sub)", margin: "4px 0 14px", lineHeight: 1.5 }}>
              {ev.title} · {bookingWords(cancelAsk)}
              <br />
              {cancelAsk.kind === "spectator" ? "The seat goes back on sale straight away." : "Your place goes back to whoever enters next."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setCancelAsk(null)} style={ghostBtn}>
                Keep it
              </button>
              <button type="button" disabled={busy} onClick={() => void cancelBooking(cancelAsk)} style={{ ...solidBtn, background: "#EF4444", color: "#fff", cursor: busy ? "wait" : "pointer" }}>
                {cancelAsk.kind === "spectator" ? "Cancel ticket" : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {evPass ? <PassSheet posterItem={posterItem} posterK={posterK} col={col} title={ev.title} styleName={ev.style} levelWord={TYPE_LABEL[cat]} pass={pass} slug={ev.shareSlug} path="e" ariaLabel="Event pass" fire={fire} onClose={() => setEvPass(false)} /> : null}

      {toast ? (
        <div style={{ position: "fixed", bottom: 110, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: `1.5px solid ${col}`, color: "var(--text)", padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 390, textAlign: "center", zIndex: 650 }}>
          {toast}
        </div>
      ) : null}
    </div>
  );
}
