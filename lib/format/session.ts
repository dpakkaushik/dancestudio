/** One grammar for session dates and durations, shared by the card and the page
 *  the card opens (prototype rule, DanceOSApp.jsx:70-79) — so the tile and the
 *  class detail page can never print the same session differently. All read in
 *  IST: the app is India-only for now. */

const IST = "Asia/Kolkata";

export const dateParts = (iso: string) => {
  const d = new Date(iso);
  const get = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...opts }).format(d);
  return {
    weekday: get({ weekday: "short" }).toUpperCase(),
    day: get({ day: "numeric" }),
    month: get({ month: "short" }).toUpperCase(),
  };
};

/** "Fri 7 Aug" — the same one grammar, for a row that needs only the day
 *  (the pay ledger's session lines). Built from `dateParts` rather than its own
 *  Intl call, so it can never drift from the tile and the page. */
export const sessionDayLabel = (iso: string) => {
  const p = dateParts(iso);
  const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
  return `${title(p.weekday)} ${p.day} ${title(p.month)}`;
};

/** "August" — the month a ledger is reporting on. */
export const monthLabelOf = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, month: "long" }).format(new Date(iso));

export const timeOf = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));

export const timeRangeOf = (startsAt: string, endsAt: string) =>
  `${timeOf(startsAt)} – ${timeOf(endsAt)}`;

/** "6–7 pm", "6:30–8 pm", "11:30am–12:30pm" — the range as short as it can be
 *  said: no ":00", one am/pm when both ends share it, and both (unspaced) when a
 *  class crosses noon. For the class card's one-line when-tile (5 Oct 2026, the
 *  user: "keep date day and time in the same line"), where the long form
 *  measured up to 49px too wide for a 360px phone. Falls back to the long form
 *  if the clock ever prints something this does not recognise. */
export const compactRangeOf = (startsAt: string, endsAt: string) => {
  const parse = (s: string) => {
    const m = s.match(/^(\d{1,2}):(\d{2})\s*([ap])\.?\s?m\.?$/i);
    return m ? { h: m[1], mm: m[2], ap: `${m[3].toLowerCase()}m` } : null;
  };
  const a = parse(timeOf(startsAt));
  const b = parse(timeOf(endsAt));
  if (!a || !b) return timeRangeOf(startsAt, endsAt);
  const short = (p: { h: string; mm: string }) => (p.mm === "00" ? p.h : `${p.h}:${p.mm}`);
  return a.ap === b.ap ? `${short(a)}–${short(b)} ${b.ap}` : `${short(a)}${a.ap}–${short(b)}${b.ap}`;
};

/** "1h 30m", never "90 min" — prototype durText (line 79). */
export const durText = (startsAt: string, endsAt: string) => {
  const mins = Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return h ? (mm ? `${h}h ${mm}m` : `${h}h`) : `${mm}m`;
};
