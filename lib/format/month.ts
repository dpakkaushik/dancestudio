/** Month arithmetic for the ledgers, all in IST — the app is India-only for now
 *  (the same rule lib/format/session.ts follows). Pure functions: the clock is
 *  handed in, never read here, so a server component can call these without
 *  tripping react-hooks/purity. */

const IST = "Asia/Kolkata";

/** "2026-08" — the IST calendar month an instant falls in. Built from parts, not
 *  from a locale's date string, so no locale can reorder it. */
export const monthKeyOf = (iso: string): string => {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "00";
  return `${year}-${month}`;
};

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

/** The key `back` months before `key` (0 = the same month). */
export const shiftMonthKey = (key: string, back: number): string => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** The instant an IST month begins, as ISO — the lower bound of a range query. */
export const monthStartIso = (key: string): string => `${key}-01T00:00:00+05:30`;
