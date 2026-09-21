import type { Period } from "@/lib/format/month";

/** THE PERIOD IS THE URL'S (21 Sep 2026). Every money screen reads it the same
 *  way and falls back to the same default, so a link is shareable and a period
 *  survives a navigation — which none of the four old money screens managed,
 *  because each kept its period in component state.
 *
 *  ⚠ An unknown word is the DEFAULT, never an error: a period is a setting of
 *  the page you are on, and a typed URL must not be able to empty a ledger. */
export const asPeriod = (raw: string | undefined): Period =>
  raw === "day" || raw === "week" || raw === "year" ? raw : "month";
