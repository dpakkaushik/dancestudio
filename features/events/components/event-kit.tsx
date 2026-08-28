import type { ReactNode } from "react";
import { FORMAT_WORD, type EntryFormat, type EventBooking, type EventCat } from "@/types/event";

/** The event atoms, lifted from the prototype (EV_ICON / EV_FMT_ICON 3005-3016,
 *  EvIcon 3130, EvFormatIcon 3125): one mark per kind of event, one per way in. */

const EV_ICON: Record<EventCat, ReactNode> = {
  showcase: (
    <>
      <path d="M3.5 4.5h17M5.5 4.5v3.2a6.5 6.5 0 0 0 13 0V4.5" />
      <path d="M12 14.2V21M8 21h8" />
      <circle cx="12" cy="11" r="1.6" />
    </>
  ),
  battle: (
    <>
      <circle cx="7" cy="6.2" r="2.1" />
      <path d="M7 8.6v4.2l-2 4.4M7 12.2h2.6M4.7 21l2.3-3.8" />
      <circle cx="17" cy="6.2" r="2.1" />
      <path d="M17 8.6v4.2l2 4.4M17 12.2h-2.6M19.3 21 17 17.2" />
      <path d="M12 3v18" strokeDasharray="2 2.6" />
    </>
  ),
  tournament: (
    <>
      <path d="M7.5 3.5h9v5a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 4.8H4.9v2a2.6 2.6 0 0 0 2.6 2.6M16.5 4.8h2.6v2a2.6 2.6 0 0 1-2.6 2.6" />
      <path d="M12 13v3.5M8.8 20.5h6.4l-.7-4H9.5z" />
    </>
  ),
};

const EV_FMT_ICON: Record<EntryFormat | "all", ReactNode> = {
  solo: (
    <>
      <circle cx="12" cy="5.6" r="2.4" />
      <path d="M12 8.4v5.4M12 13.8l-2.6 6.6M12 13.8l2.6 6.6M8.6 10.6h6.8" />
    </>
  ),
  duo: (
    <>
      <circle cx="7.6" cy="5.6" r="2.1" />
      <circle cx="16.4" cy="5.6" r="2.1" />
      <path d="M7.6 8v4.6l-2 7.8M7.6 12.6h3.2M16.4 8v4.6l2 7.8M16.4 12.6h-3.2" />
    </>
  ),
  crew: (
    <>
      <circle cx="5.6" cy="6.4" r="1.9" />
      <circle cx="12" cy="5.2" r="2.1" />
      <circle cx="18.4" cy="6.4" r="1.9" />
      <path d="M5.6 8.6v3.8l-1.8 8M12 7.6v4.6l-1.8 8M12 12.2h3.4M18.4 8.6v3.8l1.8 8" />
    </>
  ),
  all: (
    <>
      <path d="m12 3.2 2.4 5.2 5.6.7-4.1 3.9 1.1 5.6-5-2.8-5 2.8 1.1-5.6L4 9.1l5.6-.7z" />
    </>
  ),
};

export function EvIcon({ cat, size = 18, color = "currentColor", sw = 1.7 }: { cat: EventCat; size?: number; color?: string; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {EV_ICON[cat] ?? EV_ICON.showcase}
    </svg>
  );
}

export function EvFormatIcon({ fmt, size = 16, color = "currentColor", sw = 1.8 }: { fmt: EntryFormat | "all" | string; size?: number; color?: string; sw?: number }) {
  const k = (["solo", "duo", "crew", "all"].includes(fmt) ? fmt : "all") as EntryFormat | "all";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {EV_FMT_ICON[k]}
    </svg>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9 Aug 2026" for one day, "12 Sep → 13 Sep" for a span (EVENT_STORE `when`) */
export const eventWhen = (startDate: string, endDate: string): string => {
  const [y1, m1, d1] = startDate.split("-").map(Number);
  const [, m2, d2] = endDate.split("-").map(Number);
  if (!y1 || !m1) return startDate;
  const a = `${d1} ${MONTHS[m1 - 1]}`;
  if (endDate === startDate) return `${a} ${y1}`;
  return `${a} → ${d2} ${MONTHS[m2 - 1]}`;
};

/** "6 pm" / "6:30 pm" from "18:30" */
export const eventTimeWords = (hhmm: string): string => {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ampm}` : `${h12} ${ampm}`;
};

/** the days a span covers, for the form's "3 days · 20 Aug → 22 Aug" line (15855) */
export const eventDays = (startDate: string, endDate: string): string[] => {
  const out: string[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  const [y2, m2, d2] = endDate.split("-").map(Number);
  if (!y || !y2) return ["—"];
  const a = new Date(Date.UTC(y, m - 1, d));
  const b = new Date(Date.UTC(y2, m2 - 1, d2));
  for (let t = new Date(a); t <= b && out.length < 10; t.setUTCDate(t.getUTCDate() + 1)) {
    out.push(`${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`);
  }
  return out.length ? out : ["—"];
};

export const moneyWords = (n: number) => (n === 0 ? "Free" : `₹${n.toLocaleString("en-IN")}`);

/* the same hash the class pass uses (InvoiceSheet dosHash), so an event code
   reads like a class code — DOS-EV-1234 beside DOS-CL-1234 */
const evHash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};
/** "DOS-EV-4821" — what the pass prints and the door reads */
export const eventCodeOf = (bookingId: string): string => `DOS-EV-${String((evHash(bookingId) % 9000) + 1000)}`;

/** what a booking you hold is called on the page and on the register */
export const bookingWords = (b: EventBooking): string => {
  if (b.kind === "spectator") return `${b.ticketTierName ?? "Ticket"}${b.qty > 1 ? ` × ${b.qty}` : ""}`;
  const f = b.entryFormat ?? "solo";
  const who = f === "crew" ? b.name : f === "duo" && b.partnerName ? `with ${b.partnerName}` : "";
  return `${FORMAT_WORD[f]} entry${who ? ` · ${who}` : ""}`;
};
