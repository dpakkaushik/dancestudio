"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { QRBlock } from "@/components/ui/QRBlock";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { PassSheet } from "@/features/classes/components/PassSheet";
import { dosPosterAuto } from "@/features/classes/components/poster";
import { dosKey } from "@/features/classes/components/ShareSheet";
import { EventCard } from "@/features/events/components/EventCard";
import { eventCodeOf } from "@/features/events/components/event-kit";
import { InvoiceSheet, bookingCodeOf } from "@/features/payments/components/InvoiceSheet";
import { RefundSheet } from "@/features/payments/components/RefundSheet";
import { DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, GREEN, LINE, PINK } from "@/lib/design/tokens";
import { dateParts, timeRangeOf } from "@/lib/format/session";
import { EV_TINT, TYPE_LABEL } from "@/types/event";
import type { DeckClassItem, DeckEventItem, DeckItem } from "@/types/home";

const DOS_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/** THE PASS DECK — lifted from the prototype (PassDeck 6863-7204, the rail at
 *  7183-7199): today's sessions as ONE swiped rail of 88%-width cards, snapped to
 *  centre, a row of dots under them saying where you are. One card, everywhere —
 *  the same ClassTile the calendar and Discover draw, the same EventCard the desk
 *  draws — each wearing the chip that says what the session is to you and, on
 *  exactly one of them, the Live badge.
 *
 *  A booked card carries its BookingActions strip (6399-6448): the drawn code
 *  (tap it and the ticket opens full screen — the same PassSheet the class page
 *  keeps behind its poster), "You're booked" with the entry code, and the one
 *  segmented pill for the money side of the booking — Invoice, and Cancel
 *  booking. Nothing here is a second implementation: the sheets are the class
 *  page's own. */

/* one grammar for the money sheets — the same date and time the card prints */
const whenTextOf = (startsAt: string, endsAt: string) => {
  const when = dateParts(startsAt);
  return `${when.weekday} ${when.day} ${when.month} · ${timeRangeOf(startsAt, endsAt)}`;
};

/* the chip the event card cannot wear itself — the class tile draws its own */
const RoleChip = ({ label }: { label: string }) => (
  <span
    style={{
      flexShrink: 0,
      fontSize: 8.5,
      fontWeight: 900,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      padding: "2px 7px",
      borderRadius: 999,
      background: "var(--el)",
      color: "var(--sub)",
    }}
  >
    {label}
  </span>
);

const LiveBadge = () => (
  <span
    style={{
      marginLeft: "auto",
      flexShrink: 0,
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 8.5,
      fontWeight: 800,
      padding: "2px 7px",
      borderRadius: 999,
      background: GREEN,
      color: "#fff",
    }}
  >
    <span style={{ position: "relative", width: 4, height: 4 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 2, background: "#fff" }} />
      <span style={{ position: "absolute", inset: -3, borderRadius: 5, border: "1.5px solid #fff", opacity: 0.5, animation: "dosPulseH 1.4s ease-out infinite" }} />
    </span>
    Live
  </span>
);

/** The booking, in the card's own clothes (BookingActions 6399-6448): the drawn
 *  code, the green DOT carrying "confirmed", the entry code — and the two money
 *  actions merged into one segmented pill, when the booking has a money side. */
function BookingStrip({
  title,
  code,
  going,
  onCode,
  onInvoice,
  onCancel,
}: {
  title: string;
  code: string;
  going: boolean;
  onCode: () => void;
  onInvoice?: () => void;
  onCancel?: () => void;
}) {
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span
          role="button"
          tabIndex={0}
          onKeyDown={dosKey}
          aria-label={`Show the entry code for ${title}`}
          onClick={onCode}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", lineHeight: 0, flexShrink: 0 }}
        >
          <QRBlock code={code} size={54} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: GREEN, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              You’re {going ? "going" : "booked"}
            </span>
            <span style={{ fontFamily: DOS_MONO, fontSize: 10, color: "var(--muted)", marginLeft: "auto", flexShrink: 0 }}>{code}</span>
          </div>
          <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3 }}>Tap the code to show it full screen.</div>
        </div>
      </div>
      {onInvoice && onCancel ? (
        /* one bordered pill, two segments, a hairline between — merged, and both visible */
        <div style={{ display: "flex", alignItems: "stretch", marginTop: 10, border: `1px solid ${LINE}`, borderRadius: 999, overflow: "hidden", background: "var(--solid)" }}>
          <span
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            aria-label="Invoice"
            onClick={onInvoice}
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 6px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", color: "var(--text)", WebkitTapHighlightColor: "transparent" }}
          >
            Invoice
          </span>
          <span aria-hidden="true" style={{ width: 1, background: LINE }} />
          <span
            role="button"
            tabIndex={0}
            onKeyDown={dosKey}
            aria-label="Cancel booking"
            onClick={onCancel}
            style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 6px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", color: "#F87171", WebkitTapHighlightColor: "transparent" }}
          >
            Cancel booking
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function PassDeck({ items }: { items: DeckItem[] }) {
  const router = useRouter();
  const [at, setAt] = useState(0);
  const [pass, setPass] = useState<DeckItem | null>(null);
  const [inv, setInv] = useState<DeckClassItem | null>(null);
  const [ref, setRef] = useState<DeckClassItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  };

  const classCard = (p: DeckClassItem): ReactNode => {
    const c = p.danceClass;
    const booked = p.enrollment?.status === "enrolled";
    return (
      <ClassTile
        danceClass={c}
        filled={p.filled}
        tenantName={p.tenantName}
        city={p.tenantCity}
        href={p.href}
        /* every card in this rail is today, so the date block says so (8290-8293) */
        isToday
        roleLabel={p.roleLabel}
        live={p.live}
        actions={
          booked && p.enrollment ? (
            <BookingStrip
              title={c.title}
              code={bookingCodeOf(p.enrollment.id)}
              going={false}
              onCode={() => setPass(p)}
              onInvoice={() => setInv(p)}
              onCancel={() => setRef(p)}
            />
          ) : undefined
        }
      />
    );
  };

  const eventCard = (p: DeckEventItem): ReactNode => (
    <div data-kind="event" style={{ marginBottom: 10 }}>
      <EventCard event={p.event} href={p.href} />
      {/* the event card has no line for what the session is to you — it gets one
          under it, with the strip when you hold a way in */}
      <div style={{ margin: "-4px 0 0", padding: "8px 12px 10px", background: "var(--card)", border: `1px solid ${LINE}`, borderTop: "none", borderRadius: "0 0 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <RoleChip label={p.roleLabel} />
          {p.booking ? (
            <span style={{ minWidth: 0, fontSize: 10.5, fontWeight: 700, color: "var(--sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.booking.words}</span>
          ) : null}
          {p.live ? <LiveBadge /> : null}
        </div>
        {p.booking ? (
          <div style={{ marginTop: 9 }}>
            <BookingStrip title={p.event.title} code={eventCodeOf(p.booking.id)} going onCode={() => setPass(p)} />
          </div>
        ) : null}
      </div>
    </div>
  );

  /* the ticket, for whichever kind of card asked for it — the class page's own sheet */
  const passSheet = (p: DeckItem) => {
    if (p.kind === "class") {
      const c = p.danceClass;
      const col = dosStyleColor(c.style);
      return (
        <PassSheet
          posterItem={{ title: c.title, style: c.style, styleColor: col }}
          posterK={c.poster && c.poster !== "none" ? c.poster : dosPosterAuto(c.title)}
          col={col}
          title={c.title}
          styleName={c.style}
          levelWord={DOS_LEVEL_LABEL[c.level] ?? c.level}
          pass={{ code: bookingCodeOf(p.enrollment?.id ?? ""), label: "Entry code", note: "Scan this at the door." }}
          slug={c.shareSlug}
          path="c"
          fire={fire}
          onClose={() => setPass(null)}
        />
      );
    }
    const ev = p.event;
    const tint = EV_TINT[ev.cat];
    return (
      <PassSheet
        posterItem={{ title: ev.title, style: ev.style, styleColor: tint }}
        posterK={ev.poster ?? dosPosterAuto(ev.title)}
        col={tint}
        title={ev.title}
        styleName={ev.style}
        levelWord={TYPE_LABEL[ev.cat]}
        pass={{ code: eventCodeOf(p.booking?.id ?? ""), label: "Entry code", note: "Show this at the door." }}
        slug={ev.shareSlug}
        path="e"
        ariaLabel="Event pass"
        fire={fire}
        onClose={() => setPass(null)}
      />
    );
  };

  return (
    <>
      {/* one card, everywhere — the same component the calendar and Discover draw, swiped (7183-7192) */}
      <div
        data-testid="home-deck"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth * 0.88)));
        }}
        style={{
          display: "flex",
          gap: 10,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          margin: "0 -16px",
          padding: "0 16px 2px",
          fontFamily: DOS_UI,
        }}
      >
        {items.map((p) => (
          <div key={p.key} data-testid="deck-card" style={{ flex: "0 0 88%", scrollSnapAlign: "center", minWidth: 0 }}>
            {p.kind === "class" ? classCard(p) : eventCard(p)}
          </div>
        ))}
      </div>
      {items.length > 1 ? (
        <div style={{ display: "flex", gap: 5, justifyContent: "center", marginTop: 2, marginBottom: 4 }} aria-hidden="true">
          {items.map((p, i) => (
            <span key={p.key} style={{ width: i === at ? 14 : 5, height: 5, borderRadius: 3, transition: "width .2s", background: i === at ? PINK : LINE }} />
          ))}
        </div>
      ) : null}

      {pass ? passSheet(pass) : null}
      {inv && inv.enrollment ? (
        <InvoiceSheet
          title={inv.danceClass.title}
          whenText={whenTextOf(inv.startsAt, inv.endsAt)}
          whereText={[inv.danceClass.room, inv.tenantCity].filter(Boolean).join(", ")}
          enrollmentId={inv.enrollment.id}
          amountInr={inv.receipt?.amountInr ?? null}
          method={inv.receipt?.method ?? null}
          onClose={() => setInv(null)}
        />
      ) : null}
      {ref && ref.enrollment ? (
        <RefundSheet
          enrollmentId={ref.enrollment.id}
          title={ref.danceClass.title}
          timeText={whenTextOf(ref.startsAt, ref.endsAt)}
          amountInr={ref.receipt?.amountInr ?? 0}
          onClose={() => setRef(null)}
          onDone={(msg) => {
            setRef(null);
            fire(msg);
            router.refresh();
          }}
        />
      ) : null}
      {toast ? (
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
            fontFamily: DOS_UI,
          }}
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
