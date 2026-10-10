import type { ClassPublishState } from "@/repositories/classes";
import { classPhaseAt, type DanceClass } from "@/types/class";

/** ⚠⚠ WHERE A CLASS YOU RUN IS IN ITS LIFE (11 Oct 2026, the user's choice:
 *  "Stage board for what you run"). Drafts · Upcoming · Past was three words for
 *  six different states — a draft nobody has been asked for, a draft waiting on
 *  somebody's yes, a draft a no came back on, a draft that could go out now, a
 *  class still to come and one running this minute — so a person reading the
 *  register had to open each draft to learn what it needed. Every stage here is
 *  worked out from rows the app already reads: the class's status, its session
 *  and the clock (`classPhaseAt`), and `classes_publish_state` — the same answer
 *  the Publish button prints. Nothing is stored.
 *
 *  ⚠ A plain module, not a component file: the server page counts the stages for
 *  the Needs-you strip and the register draws them, and one rule read in two
 *  places is how the strip and the board can never disagree. */
export type ClassStage = "needs" | "waiting" | "ready" | "upcoming" | "running" | "done";

export const STAGES: ClassStage[] = ["needs", "waiting", "ready", "upcoming", "running", "done"];

/** the pill's word and the section's heading */
export const STAGE_WORDS: Record<ClassStage, { pill: string; head: string; tint: string }> = {
  needs: { pill: "Needs", head: "Needs a teacher or a room", tint: "#F87171" },
  waiting: { pill: "Waiting", head: "Waiting for a yes", tint: "#F59E0B" },
  ready: { pill: "Ready", head: "Ready to publish", tint: "#22C55E" },
  upcoming: { pill: "Upcoming", head: "Upcoming", tint: "#0EA5E9" },
  running: { pill: "Running", head: "Running now", tint: "#22C55E" },
  done: { pill: "Done", head: "Done", tint: "#858585" },
};

export const stageOfClass = (c: Pick<DanceClass, "status" | "session">, st: ClassPublishState | undefined, nowMs: number): ClassStage => {
  const phase = classPhaseAt(c, nowMs);
  if (phase === "live") return "running";
  if (phase === "over") return "done";
  if (phase === "upcoming") return "upcoming";
  /* a draft — what stands between it and Publish */
  if (!st) return "ready";
  if (st.teacherStatus === "rejected" || st.venueStatus === "declined") return "needs";
  if (st.teacherStatus === "asked" || st.venueStatus === "requested") return "waiting";
  return st.why ? "needs" : "ready";
};
