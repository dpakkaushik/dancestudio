import type { ClassPublishState } from "@/repositories/classes";

/** THE CLASSES SCREEN'S ARITHMETIC (11 Oct 2026) — shared by a person's
 *  `/my-classes` and a studio's `/business/{id}/classes`, so both file a class
 *  into the same tab and group at the same minute. Pure: the clock is handed in.
 *
 *  ⚠ RE-CUT THE SAME EVENING (the user's choices): three tabs — To do · Upcoming
 *  · Past — with role chips, and buttons on every card. The stage board and its
 *  six stages are gone; a draft's state is a chip on its card in To do. */

export type ClassesTab = "todo" | "upcoming" | "past";
export type TimeGroup = "now" | "today" | "week" | "later" | "past";

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
export const istDayKey = (ms: number): string => IST_DAY.format(new Date(ms));
const DAY = 86_400_000;

/** Now · Today · This week · Later · Past — "this week" is the six days after
 *  today, in IST */
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
 *  register's own window (`check_in`, Step 10), so Scan is offered exactly when
 *  it would be accepted */
export const DOOR_EARLY_MS = 30 * 60_000;
export const doorOpen = (startsAt: string | null, endsAt: string | null, nowMs: number): boolean =>
  startsAt !== null && endsAt !== null && Date.parse(startsAt) - DOOR_EARLY_MS <= nowMs && nowMs < Date.parse(endsAt);

/** a class whose door is open sits in Now, even in its last half-hour before the
 *  start — that is when somebody runs the door */
export const groupWithDoor = (startsAt: string | null, endsAt: string | null, nowMs: number): TimeGroup =>
  doorOpen(startsAt, endsAt, nowMs) ? "now" : timeGroupOf(startsAt, endsAt, nowMs);

/** ⚠⚠ WHAT A DRAFT IS WAITING FOR, IN TWO OR THREE WORDS. `fix` and `ready` wait
 *  on the person reading it (they are counted on To do); `waiting` waits on
 *  somebody else. Off `classes_publish_state` — the same answer Publish gives. */
export type DraftKind = "fix" | "waiting" | "ready";
export interface DraftState {
  kind: DraftKind;
  chip: string;
  tint: string;
  /** what the first button says when it is not Publish */
  fix?: "studio" | "teacher" | "edit";
}

export const draftStateOf = (st: ClassPublishState | undefined): DraftState => {
  if (!st) return { kind: "ready", chip: "Ready to publish", tint: "#22C55E" };
  if (st.venueStatus === "declined") return { kind: "fix", chip: `${st.venueName ?? "The studio"} said no`, tint: "#F87171", fix: "studio" };
  if (st.teacherStatus === "rejected") return { kind: "fix", chip: `${st.teacherName ?? "The teacher"} said no`, tint: "#F87171", fix: "teacher" };
  if (st.teacherStatus === "asked") return { kind: "waiting", chip: `Waiting on ${st.teacherName ?? "the teacher"}`, tint: "#F59E0B" };
  if (st.venueStatus === "requested") return { kind: "waiting", chip: `Waiting on ${st.venueName ?? "the studio"}`, tint: "#F59E0B" };
  if (st.why) return { kind: "fix", chip: "No teacher yet", tint: "#F87171", fix: "edit" };
  return { kind: "ready", chip: "Ready to publish", tint: "#22C55E" };
};

/** an address's `?tab=` — with the old `?show=` / `?stage=` words still landing
 *  somewhere sensible (Rule 14: a link handed out is a promise) */
export const tabFromAddress = (tab: string | undefined, show: string | undefined, stage: string | undefined): ClassesTab | null => {
  if (tab === "todo" || tab === "upcoming" || tab === "past") return tab;
  if (show === "requests") return "todo";
  if (stage === "needs" || stage === "waiting" || stage === "ready") return "todo";
  if (stage === "upcoming" || stage === "running") return "upcoming";
  if (stage === "done") return "past";
  return null;
};
