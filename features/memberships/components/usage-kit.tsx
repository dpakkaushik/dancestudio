import Link from "next/link";
import { DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { INK, SUB } from "@/lib/design/tokens";
import type { PassUse } from "@/repositories/memberships";

/** THE PIECES EVERY MEMBERSHIP SCREEN DRAWS — the bar and where a pass went.
 *
 *  ⚠ A PLAIN MODULE, NOT "use client" (3 Oct 2026): the usage page and the
 *  student page are server components and the Memberships desk is a client one,
 *  and all three draw the same bar. No state and no hooks here, so it renders on
 *  either side. */

export type MembershipUnit = "classes" | "hours";

/** a unit count in words; hours may be a half (numeric(6,1)) */
export const unitWord = (unit: MembershipUnit, n: number) => {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit === "hours" ? `${v} ${n === 1 ? "hour" : "hours"}` : `${v} ${n === 1 ? "class" : "classes"}`;
};

const numWord = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** HOW LONG IT LASTS, in one phrase (3 Oct 2026) — "valid 30 days" on a
 *  membership; null when it never expires, so nothing is printed */
export const validityWords = (days: number | null | undefined) => (days ? `valid ${days} days` : null);

const shortDate = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** what a PASS says about its own expiry — "valid till 2 Nov 2026", "expired 2
 *  Nov 2026", or before payment "valid 30 days from payment"; null when it never
 *  expires. "Expired" comes from the date — there is no status for it. */
export function expiryWords(p: { validityDays: number | null; expiresAt: string | null; expired: boolean }): string | null {
  if (p.expiresAt) return p.expired ? `expired ${shortDate(p.expiresAt)}` : `valid till ${shortDate(p.expiresAt)}`;
  if (p.validityDays) return `valid ${p.validityDays} days from payment`;
  return null;
}

const dayWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(iso));

/** HOW FAR THROUGH — the one thing a membership is for (the user: "progress bar
 *  for completion"). Drawn from two real numbers, never a stored percentage.
 *
 *  ⚠⚠ RE-CUT 3 Oct 2026 (the user: *"better progress bar … price and classes
 *  should not be repeated"*). It was a 6px line with "3 of 10 used · 7 left"
 *  under it — while the card above already printed Size, Used and Left as tiles,
 *  so every number on a pass was said twice. Now the BAR IS the figure: what is
 *  LEFT at figure size on the left (the number somebody holding a pass actually
 *  wants), the share used on the right, and a 10px bar under them. A class pack
 *  of up to 20 is drawn as SEGMENTS, one per class, with a 2px surface gap
 *  between them, so "3 of 10" is seen rather than read; hours and big packs are
 *  one continuous fill.
 *
 *  ⚠ The `aria-label` keeps its exact old words ("3 of 10 used") and `data-pct`
 *  is unchanged — the e2e and two shoot scripts read both. */
export function ProgressBar({
  used,
  total,
  tint = "#22C55E",
  testId,
  unit = "classes",
  leftWord = "left",
  usedWord = "used",
}: {
  used: number;
  total: number;
  tint?: string;
  testId?: string;
  unit?: MembershipUnit;
  /** what the remainder IS to this reader — a holder's "left", a seller's "still owed" */
  leftWord?: string;
  /** what the used share IS — "used" for a holder, "danced" for a seller */
  usedWord?: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const left = Math.max(0, total - used);
  const done = total > 0 && left === 0;
  const segmented = unit === "classes" && Number.isInteger(total) && total > 1 && total <= 20;
  const fill = done ? "#22C55E" : tint;
  return (
    <div
      data-testid={testId}
      data-pct={pct}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={used}
      aria-label={`${used} of ${total} used`}
      style={{ marginTop: 10 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ minWidth: 0, fontSize: 11, color: SUB, fontWeight: 700 }}>
          <b style={{ fontSize: 20, fontWeight: 900, color: INK, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums", marginRight: 5 }}>{numWord(left)}</b>
          {done ? "all done" : `${unitWord(unit, left).replace(/^\S+\s/, "")} ${leftWord}`}
        </span>
        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 900, color: INK, fontVariantNumeric: "tabular-nums" }}>
          {pct}% <span style={{ color: SUB, fontWeight: 700 }}>{usedWord}</span>
        </span>
      </div>
      {segmented ? (
        <div aria-hidden="true" style={{ display: "flex", gap: 2, marginTop: 7 }}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: 10,
                borderRadius: i === 0 ? "999px 3px 3px 999px" : i === total - 1 ? "3px 999px 999px 3px" : 3,
                background: i < used ? fill : "var(--el)",
              }}
            />
          ))}
        </div>
      ) : (
        <div aria-hidden="true" style={{ height: 10, borderRadius: 999, background: "var(--el)", overflow: "hidden", marginTop: 7 }}>
          <div style={{ width: `${pct}%`, minWidth: used > 0 ? 10 : 0, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${fill}aa, ${fill})` }} />
        </div>
      )}
    </div>
  );
}

/** WHAT ONE PASS WAS SPENT ON (30 Sep 2026) — `pass_uses`, one line per seat,
 *  newest first. ⚠ Not drawn at all for a pass nothing has been spent on — an
 *  empty "Spent on" under a full bar would be the heading said twice. */
export function SpentOn({ uses, unit }: { uses: PassUse[]; unit: MembershipUnit }) {
  if (uses.length === 0) return null;
  return (
    <div data-testid="spent-on" style={{ marginTop: 10, paddingTop: 8, borderTop: "1.5px solid var(--el)" }}>
      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.9, color: "var(--muted)", marginBottom: 4 }}>SPENT ON</div>
      {uses.map((u) => (
        <Link key={`${u.classId}-${u.startsAt}`} href={`/c/${u.shareSlug}`} aria-label={`Open ${u.style} · ${DOS_LEVEL_LABEL[u.level] ?? u.level}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "4px 0", fontSize: 10.5, textDecoration: "none", color: INK, pointerEvents: "auto" }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <b>{u.style}</b> · {DOS_LEVEL_LABEL[u.level] ?? u.level}
            <span style={{ color: SUB }}> · {dayWords(u.startsAt)}</span>
          </span>
          <span style={{ flexShrink: 0, color: SUB }}>{unitWord(unit, u.units)}</span>
        </Link>
      ))}
    </div>
  );
}
