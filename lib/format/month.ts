/** Month and day arithmetic for the ledgers and the calendar, all in IST — the
 *  app is India-only for now (the same rule lib/format/session.ts follows). Pure
 *  functions: the clock is handed in, never read here, so a server component can
 *  call these without tripping react-hooks/purity. */

import type { CalendarMonth } from "@/types/calendar";

const IST = "Asia/Kolkata";

const pad = (n: number) => String(n).padStart(2, "0");

const istParts = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, ...opts }).formatToParts(new Date(iso));

const part = (parts: Intl.DateTimeFormatPart[], type: string, fallback: string) =>
  parts.find((p) => p.type === type)?.value ?? fallback;

/** "2026-08" — the IST calendar month an instant falls in. Built from parts, not
 *  from a locale's date string, so no locale can reorder it. */
export const monthKeyOf = (iso: string): string => {
  const parts = istParts(iso, { year: "numeric", month: "2-digit" });
  return `${part(parts, "year", "0000")}-${part(parts, "month", "00")}`;
};

/** "2026-08-28" — the IST calendar day an instant falls in. */
export const dayKeyOf = (iso: string): string => {
  const parts = istParts(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${part(parts, "year", "0000")}-${part(parts, "month", "00")}-${part(parts, "day", "00")}`;
};

/** The IST hour (0–23) an instant falls in — the day view's rail. */
export const hourOf = (iso: string): number =>
  Number(part(istParts(iso, { hour: "numeric", hour12: false }), "hour", "0")) % 24;

const monthNameOf = (year: number, month1: number): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", month: "long" }).format(
    new Date(Date.UTC(year, month1 - 1, 15))
  );

export interface MonthRef {
  key: string;
  /** "July" */
  monthName: string;
  /** "July 2026" */
  label: string;
}

/** The month a key names, plus its words. */
export const monthRefOf = (key: string): MonthRef => {
  const [y, m] = key.split("-").map(Number);
  const monthName = monthNameOf(y, m);
  return { key, monthName, label: `${monthName} ${y}` };
};

/** The key `back` months before `key` (0 = the same month; negative = ahead). */
export const shiftMonthKey = (key: string, back: number): string => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

/** The instant an IST month begins, as ISO — the lower bound of a range query. */
export const monthStartIso = (key: string): string => `${key}-01T00:00:00+05:30`;

// ── days ────────────────────────────────────────────────────────────────────
// A day key is a calendar date, so its arithmetic is time-zone free: the
// weekday of 28 August 2026 is the same weekday everywhere.

export const daysInMonth = (monthKey: string): number => {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** Monday-first weekday index (0 = Mon … 6 = Sun) — the prototype's calendar
 *  grids start on Monday (MONTHS `off`, DOW 8637). */
export const mondayIndexOf = (dayKey: string): number => {
  const [y, m, d] = dayKey.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

export const addDays = (dayKey: string, n: number): string => {
  const [y, m, d] = dayKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

export const dayKeyFor = (monthKey: string, day: number): string => `${monthKey}-${pad(day)}`;
export const monthOfDay = (dayKey: string): string => dayKey.slice(0, 7);
export const dayNumberOf = (dayKey: string): number => Number(dayKey.slice(8, 10));

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
/** "THU" — the prototype's DOW vocabulary (8637). */
export const dowOf = (dayKey: string): string => DOW[mondayIndexOf(dayKey)];
/** "Aug" */
export const monthShortOf = (monthKey: string): string => monthRefOf(monthKey).monthName.slice(0, 3);

export const calendarMonthOf = (key: string): CalendarMonth => ({
  ...monthRefOf(key),
  days: daysInMonth(key),
  offset: mondayIndexOf(dayKeyFor(key, 1)),
});

/** The months a calendar shows: `back` months of history through `ahead` months
 *  of what is coming, oldest first. */
export const monthsWindow = (nowIso: string, back: number, ahead: number): CalendarMonth[] => {
  const current = monthKeyOf(nowIso);
  const keys: string[] = [];
  for (let i = back; i >= -ahead; i--) keys.push(shiftMonthKey(current, i));
  return keys.map(calendarMonthOf);
};

// ── periods: day · week · month · year ──────────────────────────────────────
// 21 Sep 2026, the user: "give day, week, month, year filters and toggles with
// graphs". One vocabulary for the four, so the ledger, the chart and the URL all
// name a bucket the same way — and all of it IST, because a studio's Tuesday is
// a Tuesday in India (00:15 on the 1st here is the previous month in UTC, which
// is the boundary `rls-proof-studio-income` check 4 plants a payment on).
//
// ⚠ A WEEK IS NAMED BY ITS MONDAY'S DAY KEY, not by an ISO week number. Week
// numbering has its own year-boundary rules (week 1, week 53) that nothing in
// this app needs, and a Monday is a date everybody can check against a calendar.

export type Period = "day" | "week" | "month" | "year";

export const PERIODS: ReadonlyArray<readonly [Period, string]> = [
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
  ["year", "Year"],
];

/** how many buckets of each size the chart draws — enough to show a shape,
 *  few enough to stay legible on a 430px phone */
export const BUCKETS: Record<Period, number> = { day: 14, week: 12, month: 12, year: 5 };

/** the Monday that begins the week a day falls in */
export const weekStartOf = (dayKey: string): string => addDays(dayKey, -mondayIndexOf(dayKey));

/** the bucket of this size that an instant falls in */
export const bucketKeyOf = (iso: string, period: Period): string => {
  if (period === "day") return dayKeyOf(iso);
  if (period === "week") return weekStartOf(dayKeyOf(iso));
  if (period === "year") return monthKeyOf(iso).slice(0, 4);
  return monthKeyOf(iso);
};

/** the bucket `back` buckets before this one (0 = the same bucket) */
export const shiftBucketKey = (key: string, period: Period, back: number): string => {
  if (period === "day") return addDays(key, -back);
  if (period === "week") return addDays(key, -back * 7);
  if (period === "year") return String(Number(key) - back);
  return shiftMonthKey(key, back);
};

/** the instant a bucket begins, as ISO — the lower bound of a range query */
export const bucketStartIso = (key: string, period: Period): string => {
  if (period === "day" || period === "week") return `${key}T00:00:00+05:30`;
  if (period === "year") return `${key}-01-01T00:00:00+05:30`;
  return `${key}-01T00:00:00+05:30`;
};

/** the buckets a chart shows: `n` of them, oldest first, ending with the one
 *  `nowIso` falls in */
export const bucketsWindow = (nowIso: string, period: Period, n: number): string[] => {
  const current = bucketKeyOf(nowIso, period);
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(shiftBucketKey(current, period, i));
  return keys;
};

const dayWords = (dayKey: string) => `${dayNumberOf(dayKey)} ${monthShortOf(monthOfDay(dayKey))}`;

/** what a bucket is called on the chart's axis — short, because fourteen of them
 *  share a phone's width */
export const bucketTickOf = (key: string, period: Period): string => {
  if (period === "day") return String(dayNumberOf(key));
  if (period === "week") return String(dayNumberOf(key));
  if (period === "year") return key.slice(2);
  return monthShortOf(key).slice(0, 1);
};

/** what a bucket is called in prose — the figure above the chart names it */
export const bucketLabelOf = (key: string, period: Period): string => {
  if (period === "day") return dayWords(key);
  if (period === "week") return `${dayWords(key)} – ${dayWords(addDays(key, 6))}`;
  if (period === "year") return key;
  return monthRefOf(key).label;
};
