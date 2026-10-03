import type { SupabaseClient } from "@supabase/supabase-js";

/** THE STUDENTS OF A STUDIO, DERIVED (21 Sep 2026).
 *
 *  The user: *"Students section dont need to track a lead should just simply be
 *  able to send invite to a new user from here through mobile no. or email. rest
 *  all students are added automatically when they attend a class or take a
 *  membership."*
 *
 *  So a student is not a row somebody types any more — it is a CONSEQUENCE, and
 *  this file is the one place that word is defined:
 *
 *    a student of this business  =  somebody CHECKED IN here at least once
 *                                OR somebody holding a pass it sold
 *                                OR a walk-in its own desk added (kept, below)
 *
 *  ⚠ CHECKED IN, NOT BOOKED — the user's own choice when asked, and this repo's
 *  standing rule since Step 25: *a booking nobody marked is not a session
 *  danced*. Somebody who booked next Tuesday and has not come yet is not yet a
 *  student, and the desk says so where it matters (their `booked` figure is
 *  still printed, so a studio can see the difference).
 *
 *  ⚠ NOTHING IS WRITTEN. There is no `students` table and no migration here: the
 *  attendance rows and the membership passes already say all of this, under
 *  policies Steps 4, 10 and the memberships slice already set. A table would be
 *  a second source of truth for a fact the database can answer.
 *
 *  ⚠ AND THE WALK-INS STAY (the user's third answer: "keep the people, drop the
 *  pipeline"). `leads` rows are still read — a person the front desk typed in is
 *  a real student who simply has no DanceOS account to count against — but the
 *  five stages, the funnel and the trial class are never read or written again.
 *  The columns are untouched: taking a field off a screen must not delete what
 *  it held (16 Sep). */

export type StudentSource = "attended" | "membership" | "added";

export interface Student {
  /** the profile id where there is one; a walk-in has none */
  userId: string | null;
  /** the `leads` row this came from, when it is a walk-in the desk may remove */
  leadId: string | null;
  name: string;
  photoPath: string | null;
  mobile: string | null;
  /** how they got here — the first of these that is true, in this order */
  sources: StudentSource[];
  booked: number;
  attended: number;
  /** routines taught in the classes they were checked in to here (4 Oct 2026) */
  routines: number;
  /** distinct dance styles of those classes (4 Oct 2026) */
  styles: number;
  /** a live pass they hold with this business, if any */
  passName: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  profile_photo_path: string | null;
  phone: string | null;
}

/** Everybody who has danced here or bought something here, plus the walk-ins.
 *  ⚠ Four reads for the whole desk, never one per person, and each one fails
 *  SOFT: a studio's student list must still draw when one of them is refused. */
export async function findStudents(supabase: SupabaseClient, businessId: string): Promise<Student[]> {
  const [attendance, bookings, passes, leads] = await Promise.all([
    /* the class and its style ride along (4 Oct 2026) — the card's Routines and
       Styles boxes are counted off the same rows as Attended, so the three can
       never disagree */
    supabase.from("attendance").select("user_id, class_id, classes (style)").eq("business_id", businessId).is("deleted_at", null).limit(4000),
    supabase.from("class_bookings").select("user_id, status").eq("business_id", businessId).is("deleted_at", null).limit(4000),
    /* the passes this business sold, and who holds them. `memberships` carries
       the business; `membership_passes` carries the holder. */
    supabase
      .from("membership_passes")
      .select("user_id, status, memberships!inner (name, business_id)")
      .eq("memberships.business_id", businessId)
      .eq("status", "active")
      .is("deleted_at", null)
      .limit(2000),
    supabase.from("leads").select("id, name, mobile, user_id").eq("business_id", businessId).is("deleted_at", null).limit(500),
  ]);

  const attended = new Map<string, number>();
  const classesOf = new Map<string, Set<string>>();
  const stylesOf = new Map<string, Set<string>>();
  type AttRow = { user_id: string | null; class_id: string; classes: { style: string } | Array<{ style: string }> | null };
  for (const r of ((attendance.data ?? []) as unknown as AttRow[])) {
    /* a walk-in's attendance names nobody (20260929130000) — it is not a student row */
    if (!r.user_id) continue;
    attended.set(r.user_id, (attended.get(r.user_id) ?? 0) + 1);
    (classesOf.get(r.user_id) ?? classesOf.set(r.user_id, new Set()).get(r.user_id)!).add(r.class_id);
    const c = Array.isArray(r.classes) ? r.classes[0] : r.classes;
    if (c?.style) (stylesOf.get(r.user_id) ?? stylesOf.set(r.user_id, new Set()).get(r.user_id)!).add(c.style);
  }
  /* ⚠ BOOKED IS A LIVE SEAT, said the same way the student's own page says it
     (4 Oct 2026): a cancelled seat and a waitlist place were counted here and not
     there, so the card and the page behind it printed two different numbers */
  const booked = new Map<string, number>();
  for (const r of ((bookings.data ?? []) as Array<{ user_id: string | null; status: string }>)) {
    if (!r.user_id || r.status !== "enrolled") continue;
    booked.set(r.user_id, (booked.get(r.user_id) ?? 0) + 1);
  }

  /* the routines those classes taught — ONE read for the whole desk. It DEGRADES
     to none: a routine count must not be the reason the student list fails. */
  const routinesOfClass = new Map<string, Set<string>>();
  const allClassIds = [...new Set([...classesOf.values()].flatMap((s) => [...s]))];
  if (allClassIds.length > 0) {
    /* ⚠ `routines!inner`, so a link to a routine this reader cannot see (a draft,
       one taken down) does not count — the student's own page drops the same
       rows, and the probe caught the card saying 2 where the page said 1 */
    const { data: rt } = await supabase.from("class_routines").select("class_id, routine_id, routines!inner (id)").in("class_id", allClassIds.slice(0, 500)).is("deleted_at", null).limit(2000);
    for (const row of ((rt ?? []) as Array<{ class_id: string; routine_id: string }>)) {
      (routinesOfClass.get(row.class_id) ?? routinesOfClass.set(row.class_id, new Set()).get(row.class_id)!).add(row.routine_id);
    }
  }
  const routineCount = (userId: string) => {
    const seen = new Set<string>();
    for (const c of classesOf.get(userId) ?? []) for (const r of routinesOfClass.get(c) ?? []) seen.add(r);
    return seen.size;
  };
  const holding = new Map<string, string>();
  /* ⚠ PostgREST types an `!inner` embed as an ARRAY even where it resolves to
     one row, so the name is read off whichever shape arrives rather than
     asserted into the one this code would prefer. */
  for (const r of ((passes.data ?? []) as unknown as Array<{ user_id: string; memberships: { name: string } | Array<{ name: string }> | null }>)) {
    if (!r.user_id || holding.has(r.user_id)) continue;
    const m = Array.isArray(r.memberships) ? r.memberships[0] : r.memberships;
    holding.set(r.user_id, m?.name ?? "a membership");
  }

  const leadRows = (leads.data ?? []) as Array<{ id: string; name: string; mobile: string | null; user_id: string | null }>;
  /* a lead that NAMES somebody is that person's row — the desk should not print
     them twice, so the lead is only its own entry when it names nobody */
  const leadByUser = new Map<string, { id: string; mobile: string | null }>();
  for (const l of leadRows) {
    if (l.user_id) leadByUser.set(l.user_id, { id: l.id, mobile: l.mobile });
  }

  const userIds = [...new Set([...attended.keys(), ...holding.keys(), ...leadByUser.keys()])];

  /* the names and faces. `profiles` is signed-in readable (Step 1), so one read
     covers every id; an empty answer simply leaves a row without a face. */
  const profiles = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, profile_photo_path, phone")
      .in("id", userIds.slice(0, 400))
      .is("deleted_at", null);
    for (const p of ((data ?? []) as ProfileRow[])) profiles.set(p.id, p);
  }

  const out: Student[] = [];
  for (const id of userIds) {
    const p = profiles.get(id);
    const sources: StudentSource[] = [];
    if ((attended.get(id) ?? 0) > 0) sources.push("attended");
    if (holding.has(id)) sources.push("membership");
    if (leadByUser.has(id)) sources.push("added");
    out.push({
      userId: id,
      leadId: leadByUser.get(id)?.id ?? null,
      name: p?.full_name?.trim() || "Someone on DanceOS",
      photoPath: p?.profile_photo_path ?? null,
      mobile: leadByUser.get(id)?.mobile ?? p?.phone ?? null,
      sources,
      booked: booked.get(id) ?? 0,
      attended: attended.get(id) ?? 0,
      routines: routineCount(id),
      styles: stylesOf.get(id)?.size ?? 0,
      passName: holding.get(id) ?? null,
    });
  }

  /* the walk-ins: a real student with no account, so no figures to print */
  for (const l of leadRows) {
    if (l.user_id) continue;
    out.push({ userId: null, leadId: l.id, name: l.name, photoPath: null, mobile: l.mobile, sources: ["added"], booked: 0, attended: 0, routines: 0, styles: 0, passName: null });
  }

  /* busiest first, then alphabetical — a studio looks for its regulars */
  return out.sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));
}
