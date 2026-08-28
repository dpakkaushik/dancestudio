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
