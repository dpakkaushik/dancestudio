import type { ClassPublishState } from "@/repositories/classes";
import type { RefundLedgerRow } from "@/repositories/refunds";
import type { DanceClass } from "@/types/class";
import type { NeedLink, TimeGroup } from "@/features/classes/components/ClassesHome";
import { stageOfClass } from "@/features/classes/stages";

/** THE CLASSES SCREEN'S ARITHMETIC (11 Oct 2026) — shared by a person's
 *  `/my-classes` and a studio's `/business/{id}/classes`, so the two screens
 *  file a class into the same band and open the same door at the same minute.
 *  Pure: the clock is handed in. */

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
export const istDayKey = (ms: number): string => IST_DAY.format(new Date(ms));
const DAY = 86_400_000;

/** Now · Today · This week · Later · Past — "this week" is the six days after
 *  today, in IST, so a Sunday class seen on a Saturday is not "later" */
export const timeGroupOf = (startsAt: string | null, endsAt: string | null, nowMs: number): TimeGroup => {
  const s = startsAt ? Date.parse(startsAt) : null;
  const e = endsAt ? Date.parse(endsAt) : null;
  if (e !== null && e <= nowMs) return "past";
  if (s === null) return "later";
  if (s <= nowMs) return "now";
  const day = istDayKey(s);
  if (day === istDayKey(nowMs)) return "today";
  if (day <= istDayKey(nowMs + 6 * DAY)) return "week";
  return "later";
};

/** ⚠ THE DOOR IS OPEN from thirty minutes before the start until the end — the
 *  register's own window (`check_in`, Step 10), so the Running now card appears
 *  exactly when Scan would be accepted */
export const DOOR_EARLY_MS = 30 * 60_000;
export const doorOpen = (startsAt: string | null, endsAt: string | null, nowMs: number): boolean =>
  startsAt !== null && endsAt !== null && Date.parse(startsAt) - DOOR_EARLY_MS <= nowMs && nowMs < Date.parse(endsAt);

const CLOCK = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
export const runningWhen = (startsAt: string, endsAt: string, nowMs: number): string =>
  Date.parse(startsAt) <= nowMs ? `Running · ends ${CLOCK.format(new Date(endsAt))}` : `Starts ${CLOCK.format(new Date(startsAt))}`;

/** ⚠⚠ WHAT A REGISTER NEEDS FROM THE PERSON READING IT, as Needs-you links: a
 *  class a no came back on (one link each, to the form that fixes it), the
 *  drafts ready to publish (one link, to the board's Ready stage), and the
 *  refunds waiting on a decision. Never a class waiting on SOMEBODY ELSE — that
 *  is not waiting on you, and it is on the board under Waiting for a yes.
 *  `canEdit` is the owner (RLS admits only the owner to `classes` UPDATE), so a
 *  manager is not handed a link onto a form that refuses them. */
export function needLinksOf({
  classes,
  state,
  nowMs,
  businessId,
  canEdit,
  readyHref,
  refunds,
  refundsHref,
}: {
  classes: DanceClass[];
  state: Record<string, ClassPublishState>;
  nowMs: number;
  businessId: string;
  canEdit: boolean;
  readyHref: string;
  refunds: RefundLedgerRow[];
  refundsHref: string | null;
}): NeedLink[] {
  const out: NeedLink[] = [];
  if (canEdit) {
    for (const c of classes) {
      if (stageOfClass(c, state[c.id], nowMs) !== "needs") continue;
      const st = state[c.id];
      const declined = st?.venueStatus === "declined" ? `${st.venueName ?? "The studio"} said no to the room` : st?.teacherStatus === "rejected" ? `${st.teacherName ?? "The teacher"} said no` : (st?.why ?? "Nobody is taking it yet");
      out.push({
        key: `needs-${c.id}`,
        title: c.title,
        sub: declined,
        href: `/business/${businessId}/classes/${c.id}/edit`,
        tint: "#F87171",
        cta: st?.venueStatus === "declined" ? "Pick another studio" : st?.teacherStatus === "rejected" ? "Ask someone else" : "Fix it",
      });
    }
    const ready = classes.filter((c) => stageOfClass(c, state[c.id], nowMs) === "ready").length;
    if (ready > 0) {
      out.push({
        key: "ready",
        title: `${ready} ${ready === 1 ? "class is" : "classes are"} ready to publish`,
        sub: "Everybody has said yes — publish to put it on sale",
        href: readyHref,
        tint: "#22C55E",
        cta: "Publish",
      });
    }
  }
  if (refundsHref) {
    const asked = refunds.filter((r) => r.status === "requested");
    if (asked.length > 0) {
      const sum = asked.reduce((t, r) => t + r.amountInr, 0);
      out.push({
        key: "refunds",
        title: `${asked.length} refund ${asked.length === 1 ? "request" : "requests"} to decide`,
        sub: `₹${sum.toLocaleString("en-IN")} asked back inside the 12-hour window`,
        href: refundsHref,
        tint: "#F59E0B",
        cta: "Decide",
      });
    }
  }
  return out;
}
