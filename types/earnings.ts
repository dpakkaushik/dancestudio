import type { Period } from "@/lib/format/month";

/** EARNINGS, THE SAME SHAPE FOR EVERY KIND OF PROFILE (21 Sep 2026, the user:
 *  "lets fix earnings for all profile types … earnings should consist of Revenue
 *  with breakup and Expenses with breakup. and what is left after that. figure
 *  it out for all types of profiles").
 *
 *  So this is the contract, and each kind fills it with what it actually has:
 *
 *    A PERSON      revenue = what studios have paid them. No expenses — they
 *                  employ nobody — so what is left IS the revenue, and the
 *                  screen says that rather than drawing an empty Expenses block.
 *    AN ARTIST     the same, PLUS their own page's business figures.
 *    A STUDIO      revenue from class seats, memberships and enquiry advances;
 *                  expenses are what it pays its people, what it refunded, and
 *                  what it bought.
 *    AN ORGANIZATION  every studio it owns and its own hosting row, added up,
 *                  with a row per source and a row per studio.
 *
 *  ⚠ ONE RULE HOLDS ACROSS ALL FOUR: a line is only drawn when the app can
 *  actually count it — and since 2 Oct 2026 a line it CAN count is drawn at ₹0
 *  too, so the breakup always says what the total is made of. The prototype's S_earn prints a DanceOS fee, GST on the
 *  fee and TDS; none of those exists — there is no platform fee and no rate a
 *  studio has set — so printing them at ₹0 would be a classPerson about money rather
 *  than a measurement of it. The backlog carries them. */

/** one line of a breakup — a name, an amount, and where to go and see it */
export type MoneyLine = {
  key: string;
  label: string;
  amountInr: number;
  /** the desk that holds the rows behind this number, when there is one */
  href?: string;
  /** printed under the label when the number needs a word to be honest */
  note?: string;
  /** ⚠ THE ROWS BEHIND THE NUMBER (2 Oct 2026, the user: *"Revenue and expenses
   *  also give breakup of all parts as collapsible. should also be visible even if
   *  0. so can identify what all has been put in it for both"*). Each line opens
   *  onto what it is made of — which class, which membership, who was paid, which
   *  asset — newest first, so a total is never a number you have to take on
   *  trust. Empty for a line that carried nothing in this period. */
  items?: MoneyItem[];
};

/** one row behind a line: what it was, how much, and when */
export type MoneyItem = { label: string; amountInr: number; at: string };

/** ⚠ THE TINTS LIVE HERE, AS DATA, so the repository can name a line without
 *  importing a client module — and so a source wears one colour wherever it is
 *  drawn. They are the tool colours the rest of the app already uses for the
 *  same subjects (`DOS_TOOLS`), copied as plain strings rather than imported,
 *  because `biz-kit` is a `"use client"` file and a repository is not. */
export const EARNING_TINT: Record<string, string> = {
  classes: "#0D9488",
  memberships: "#B45309",
  /* `events: "#EC4899"` went with events (29 Sep 2026) — the one revenue line
     that could ever be filled by a ticket or an entry */
  enquiries: "#8B5CF6",
  teaching: "#22C55E",
  pay: "#9A3412",
  refunds: "#F87171",
  assets: "#64748B",
  plan: "#A855F7",
};

/** one column of the chart — already bucketed, oldest first */
export type EarningsBucket = {
  key: string;
  revenueInr: number;
  expensesInr: number;
};

export type EarningsReport = {
  period: Period;
  /** every bucket in the window, oldest first — the chart's columns */
  buckets: EarningsBucket[];
  /** the bucket the figures describe, keyed into `lines` */
  lines: Record<string, { revenue: MoneyLine[]; expenses: MoneyLine[] }>;
  /** ⚠ false when a read hit its runaway guard: the screen then says it is
   *  counting the latest N rows only rather than printing a total that looks
   *  finished and is not (the 28 Aug rule, kept) */
  complete: boolean;
};

export const sumLines = (lines: MoneyLine[]): number => lines.reduce((n, l) => n + l.amountInr, 0);
