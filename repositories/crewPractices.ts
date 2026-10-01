import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarPracticeEntry } from "@/types/calendar";
import type { CrewPractice, PracticePerson, PracticeStanding, PracticeStatus } from "@/types/crewPractice";

/** THE CREW PRACTICE READS AND ITS FIVE DOORS (27 Sep 2026).
 *
 *  Every read here is a SECURITY DEFINER function of `20260927140000` and every
 *  one is scoped to `auth.uid()` INSIDE its own SQL — there is no `p_user_id` on
 *  any of them to aim at anybody else. So this file passes no viewer id and
 *  cannot: what comes back is the caller's own crews' practices and nothing more.
 *
 *  ⚠ NOTHING HERE IS PUBLIC. The three tables carry no anon policy and no anon
 *  grant: a crew's page prints its roster and its battle record, and a rehearsal
 *  schedule is the crew's own business. */

interface PracticeRow {
  practice_id: string;
  crew_id: string;
  crew_name: string;
  crew_style: string;
  starts_at: string;
  ends_at: string;
  place: string;
  note: string | null;
  status: PracticeStatus;
  i_lead: boolean;
  my_status: PracticeStanding;
  going: number;
  asked: number;
}

const toPractice = (r: PracticeRow): CrewPractice => ({
  id: r.practice_id,
  crewId: r.crew_id,
  crewName: r.crew_name,
  crewStyle: r.crew_style,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  place: r.place,
  note: r.note,
  status: r.status,
  iLead: Boolean(r.i_lead),
  myStatus: r.my_status,
  going: Number(r.going ?? 0),
  asked: Number(r.asked ?? 0),
});

/** Every practice of every crew the caller leads or is confirmed on, in time
 *  order. The Practice desk, the crew's calendar and a person's calendar all read
 *  this one function — so the three cannot come to disagree about what is on.
 *
 *  ⚠ A FAILED READ IS AN EMPTY LIST, NEVER A THROW. A practice is a section of a
 *  page that has other things on it (a crew's home, a person's calendar), and the
 *  rule this repo keeps is that a preference or a panel must not be the reason a
 *  whole screen refuses to render — `arrangeTiles` and `artist_page_of` are the
 *  same shape. The caller that NEEDS the distinction is the desk, which is about
 *  nothing else; it says so with `strict`. */
export async function findMyCrewPractices(
  supabase: SupabaseClient,
  opts: { from?: string | null; to?: string | null; strict?: boolean } = {}
): Promise<CrewPractice[]> {
  const { data, error } = await supabase.rpc("my_crew_practices", { p_from: opts.from ?? null, p_to: opts.to ?? null });
  if (error) {
    if (opts.strict) throw new Error(`my_crew_practices failed: ${error.message}`);
    return [];
  }
  return ((data ?? []) as PracticeRow[]).map(toPractice);
}

/** One crew's, off the same read — the desk narrows rather than asking a second
 *  question, because the function is already scoped to what this person may see
 *  and a per-crew argument would be a second place for that rule to live. */
export async function findCrewPractices(supabase: SupabaseClient, crewId: string): Promise<CrewPractice[]> {
  const all = await findMyCrewPractices(supabase, { strict: true });
  return all.filter((p) => p.crewId === crewId);
}

/** ⚠ THE CALENDAR ROW, DERIVED HERE AND NOT IN THE SCREEN (27 Sep 2026). The
 *  `dayKey` and the `hour` are IST, computed ONCE at the read boundary exactly as
 *  `findMyCalendar` computes them for a class — so the client never runs a clock
 *  or a time-zone conversion during render, which is this repo's own lint rule
 *  (`react-hooks/purity`) as much as a correctness one. */
export function practiceToCalendar(p: CrewPractice): CalendarPracticeEntry {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const parts = Object.fromEntries(f.formatToParts(new Date(p.startsAt)).map((x) => [x.type, x.value]));
  return {
    practiceId: p.id,
    crewId: p.crewId,
    crewName: p.crewName,
    style: p.crewStyle,
    startsAt: p.startsAt,
    endsAt: p.endsAt,
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    place: p.place,
    note: p.note,
    cancelled: p.status === "cancelled",
    standing: p.myStatus,
    going: p.going,
    asked: p.asked,
    /* ⚠ A ROW OPENS A SCREEN THAT CAN ACT ON IT (27 Sep 2026, the user: "no way
       to check practices you have been a part of"). The leader's goes to their
       own desk, which has the register and Call it off. A member's went to the
       crew's PUBLIC page — a link that was true and useless, since that page says
       nothing about practices and can answer none — and goes to the Crews hub
       now, where `MyPractices` carries the same card with the same two buttons.
       A member cannot open `/crews/{id}/manage/practice` at all: `requireLedCrew`
       fronts every route under `manage`, and a link that bounces is worse than a
       link somewhere true.
       ⚠ AND THAT SCREEN IS `/practice` NOW, IN ITS "You are in" COLUMN (1 Oct
       2026): practice left the Crews hub for its own Home tile on 29 Sep and this
       line went on pointing at a hub that no longer carries any practice. */
    href: p.iLead ? `/crews/${p.crewId}/manage/practice` : "/practice?show=in",
  };
}

interface PersonRow {
  user_id: string;
  full_name: string;
  avatar_path: string | null;
  status: PracticeStanding;
  is_leader: boolean;
  present: boolean;
}

/** The register: who is on this practice, what they said, and who turned up.
 *  Readable by the crew; an empty list for anybody else, which is the function's
 *  own answer rather than a check this file repeats. */
export async function findPracticePeople(supabase: SupabaseClient, practiceId: string): Promise<PracticePerson[]> {
  const { data, error } = await supabase.rpc("practice_people", { p_practice_id: practiceId });
  if (error) return [];
  return ((data ?? []) as PersonRow[]).map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    avatarPath: r.avatar_path ?? null,
    status: r.status,
    isLeader: Boolean(r.is_leader),
    present: Boolean(r.present),
  }));
}

/* ── the five doors ─────────────────────────────────────────────────────────
   Each is the RPC and nothing else: every rule — who may arrange, who may
   answer, who runs the register, that a practice ends after it starts, that
   moving re-asks nobody — is in the database, so there is no second copy here
   to drift from it. The actions in front of these validate SHAPE only. */

export async function saveCrewPractice(
  supabase: SupabaseClient,
  input: { crewId: string; startsAt: string; endsAt: string; place: string; note: string | null; practiceId: string | null }
): Promise<string> {
  const { data, error } = await supabase.rpc("save_crew_practice", {
    p_crew_id: input.crewId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_place: input.place,
    p_note: input.note,
    p_practice_id: input.practiceId,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { id: string } | null;
  return row?.id ?? "";
}

export async function cancelCrewPractice(supabase: SupabaseClient, practiceId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_crew_practice", { p_practice_id: practiceId });
  if (error) throw new Error(error.message);
}

export async function respondToPractice(supabase: SupabaseClient, practiceId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_to_practice", { p_practice_id: practiceId, p_accept: accept });
  if (error) throw new Error(error.message);
}

export async function checkInPractice(supabase: SupabaseClient, practiceId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("check_in_practice", { p_practice_id: practiceId, p_user_id: userId });
  if (error) throw new Error(error.message);
}

export async function undoPracticeCheckIn(supabase: SupabaseClient, practiceId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("undo_practice_check_in", { p_practice_id: practiceId, p_user_id: userId });
  if (error) throw new Error(error.message);
}
