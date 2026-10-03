import type { SupabaseClient } from "@supabase/supabase-js";
import { findClassArtists } from "./classPeople";
import { findPassExpiry, findPassUsesMany, type PassExpiry, type PassUse } from "./memberships";

/** ONE STUDENT, SEEN FROM ONE STUDIO OR ONE ARTIST (3 Oct 2026, the user:
 *  *"Students should also have a stats Button next to profile which should give
 *  detail students stats from that artist or Studio … another button called
 *  membership which shows membership details and usage of that particular
 *  student"*).
 *
 *  ⚠ SCOPED TO THE BUSINESS, ALWAYS, AND SAID OUT LOUD. Every read names
 *  `business_id = this one` and `user_id = this person`. RLS admits a business's
 *  runners to their own rows (`20261003110000`), but RLS is a ceiling and not a
 *  scope — this is "what they danced HERE", never their whole record, which is
 *  their own Stats page's job.
 *
 *  ⚠ NOTHING IS STORED. Attended is the attendance rows (Step 25's rule: a seat
 *  nobody marked is not a session danced), and every figure on the page is
 *  counted off the same rows the lists under it print, so a number and its list
 *  can never disagree. */

export interface StudentSession {
  classId: string;
  shareSlug: string;
  style: string;
  level: string;
  startsAt: string;
  minutes: number;
}

export interface StudentPass extends PassExpiry {
  passId: string;
  membershipId: string;
  name: string;
  unit: "classes" | "hours";
  unitsTotal: number;
  unitsUsed: number;
  status: "pending_payment" | "active" | "used_up" | "cancelled";
  priceInr: number;
  boughtAt: string | null;
  uses: PassUse[];
}

/** one class they danced here — every session of it they were checked in to */
export interface StudentClass {
  classId: string;
  shareSlug: string;
  style: string;
  level: string;
  sessions: number;
  minutes: number;
  lastAt: string;
}

/** one routine taught in a class they were checked in to here */
export interface StudentRoutine {
  routineId: string;
  title: string;
  style: string;
  level: string;
  makerName: string | null;
  makerPhotoPath: string | null;
  /** sessions they attended of the classes it is taught in */
  sessions: number;
  classes: number;
}

export interface StudentRecord {
  userId: string;
  name: string;
  photoPath: string | null;
  city: string | null;
  attended: number;
  minutes: number;
  /** seats booked here and not cancelled, whatever happened after */
  booked: number;
  upcoming: number;
  /** booked, the session is over, and nobody checked them in */
  missed: number;
  cancelled: number;
  firstAt: string | null;
  lastAt: string | null;
  /** the last six IST months, oldest first — sessions attended in each */
  months: Array<{ key: string; label: string; n: number }>;
  styles: Array<{ style: string; n: number }>;
  teachers: Array<{ userId: string; name: string; photoPath: string | null; n: number }>;
  /** every class they danced here, the most recent first (4 Oct 2026) */
  classes: StudentClass[];
  /** the routines those classes taught, most danced first (4 Oct 2026) */
  routines: StudentRoutine[];
  passes: StudentPass[];
}

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const IST = "Asia/Kolkata";
const monthKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);

/** the six month keys ending this month, oldest first — the clock is handed in */
function lastSixMonths(now: Date): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const [y, m] = monthKey(now.toISOString()).split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    out.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(d),
    });
  }
  return out;
}

const n = (v: unknown) => Number(v ?? 0);

export async function findStudentRecord(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  now: Date = new Date(),
): Promise<StudentRecord | null> {
  const [profile, attendance, bookings, passes] = await Promise.all([
    supabase.from("profiles").select("id, full_name, profile_photo_path, city").eq("id", userId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("attendance")
      .select("class_booking_id, class_id, class_sessions (starts_at, ends_at), classes (style, level, share_slug)")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(2000),
    supabase
      .from("class_bookings")
      .select("id, status, class_sessions (starts_at, ends_at)")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(2000),
    supabase
      .from("membership_passes")
      .select("id, membership_id, status, unit, units_total, units_used, price_inr, bought_at, created_at, memberships (name)")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const p = profile.data as { id: string; full_name: string | null; profile_photo_path: string | null; city: string | null } | null;
  if (!p) return null;

  /* ── what they danced here ── */
  type AttRow = {
    class_booking_id: string;
    class_id: string;
    class_sessions: One<{ starts_at: string; ends_at: string }>;
    classes: One<{ style: string; level: string; share_slug: string }>;
  };
  const sessions: StudentSession[] = [];
  const checkedBookings = new Set<string>();
  for (const r of (attendance.data ?? []) as unknown as AttRow[]) {
    checkedBookings.add(r.class_booking_id);
    const s = one(r.class_sessions);
    const c = one(r.classes);
    if (!s || !c) continue;
    const minutes = Math.max(0, Math.round((new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 60000));
    sessions.push({ classId: r.class_id, shareSlug: c.share_slug, style: c.style, level: c.level, startsAt: s.starts_at, minutes });
  }
  sessions.sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  /* ── what they booked, and what became of it ── */
  let booked = 0;
  let upcoming = 0;
  let missed = 0;
  let cancelled = 0;
  const nowMs = now.getTime();
  for (const b of (bookings.data ?? []) as unknown as Array<{ id: string; status: string; class_sessions: One<{ starts_at: string; ends_at: string }> }>) {
    if (b.status === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (b.status !== "enrolled") continue; // a waitlist place is not a seat
    booked += 1;
    const s = one(b.class_sessions);
    if (!s) continue;
    if (new Date(s.starts_at).getTime() > nowMs) upcoming += 1;
    else if (new Date(s.ends_at).getTime() <= nowMs && !checkedBookings.has(b.id)) missed += 1;
  }

  /* ── the six months ── */
  const byMonth = new Map<string, number>();
  for (const s of sessions) {
    const k = monthKey(s.startsAt);
    byMonth.set(k, (byMonth.get(k) ?? 0) + 1);
  }
  const months = lastSixMonths(now).map((m) => ({ ...m, n: byMonth.get(m.key) ?? 0 }));

  /* ── the styles, busiest first ── */
  const byStyle = new Map<string, number>();
  for (const s of sessions) byStyle.set(s.style, (byStyle.get(s.style) ?? 0) + 1);
  const styles = [...byStyle.entries()].map(([style, count]) => ({ style, n: count })).sort((a, b) => b.n - a.n || a.style.localeCompare(b.style));

  /* ── who taught them here — the class's confirmed artist, one read for all ── */
  const artists = await findClassArtists(supabase, sessions.map((s) => s.classId)).catch(() => new Map());
  const byTeacher = new Map<string, { userId: string; name: string; photoPath: string | null; n: number }>();
  for (const s of sessions) {
    const a = artists.get(s.classId);
    if (!a) continue;
    const t = byTeacher.get(a.userId) ?? { userId: a.userId, name: a.name, photoPath: a.avatarPath ?? null, n: 0 };
    t.n += 1;
    byTeacher.set(a.userId, t);
  }
  const teachers = [...byTeacher.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  /* ── the classes, one row each — counted off the same sessions (4 Oct 2026) ── */
  const byClass = new Map<string, StudentClass>();
  for (const s of sessions) {
    const c = byClass.get(s.classId) ?? { classId: s.classId, shareSlug: s.shareSlug, style: s.style, level: s.level, sessions: 0, minutes: 0, lastAt: s.startsAt };
    c.sessions += 1;
    c.minutes += s.minutes;
    if (s.startsAt > c.lastAt) c.lastAt = s.startsAt;
    byClass.set(s.classId, c);
  }
  const classes = [...byClass.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  /* ── the routines those classes taught. `class_routines` is readable by
     whoever can read the class (20260919160000), and a business's runners read
     its classes. ⚠ It DEGRADES to none rather than failing the page — the
     record must not 500 over a list beside it. ── */
  const routines: StudentRoutine[] = [];
  if (classes.length > 0) {
    type RtRow = { class_id: string; routines: One<{ id: string; title: string; style: string; level: string; profiles: One<{ full_name: string | null; profile_photo_path: string | null }> }> };
    const { data: rt } = await supabase
      .from("class_routines")
      .select("class_id, routines (id, title, style, level, profiles (full_name, profile_photo_path))")
      .in("class_id", classes.map((c) => c.classId))
      .is("deleted_at", null)
      .limit(200);
    const byRoutine = new Map<string, StudentRoutine & { classIds: Set<string> }>();
    for (const row of (rt ?? []) as unknown as RtRow[]) {
      const r = one(row.routines);
      if (!r) continue;
      const maker = one(r.profiles);
      const entry = byRoutine.get(r.id) ?? { routineId: r.id, title: r.title, style: r.style, level: r.level, makerName: maker?.full_name ?? null, makerPhotoPath: maker?.profile_photo_path ?? null, sessions: 0, classes: 0, classIds: new Set<string>() };
      if (!entry.classIds.has(row.class_id)) {
        entry.classIds.add(row.class_id);
        entry.sessions += byClass.get(row.class_id)?.sessions ?? 0;
      }
      byRoutine.set(r.id, entry);
    }
    for (const { classIds, ...r } of byRoutine.values()) routines.push({ ...r, classes: classIds.size });
    routines.sort((a, b) => b.sessions - a.sessions || a.title.localeCompare(b.title));
  }

  /* ── the passes they hold or held with this business, and where each went ── */
  type PassRow = { id: string; membership_id: string; status: StudentPass["status"]; unit: StudentPass["unit"]; units_total: number; units_used: number; price_inr: number; bought_at: string | null; memberships: One<{ name: string }> };
  const passRows = (passes.data ?? []) as unknown as PassRow[];
  const [usesByPass, expiry] = await Promise.all([
    findPassUsesMany(supabase, passRows.map((r) => ({ passId: r.id, unitsUsed: n(r.units_used) }))).catch(() => ({} as Record<string, PassUse[]>)),
    findPassExpiry(supabase, passRows.map((r) => r.id)).catch(() => new Map<string, PassExpiry>()),
  ]);
  const passList: StudentPass[] = passRows.map((r) => ({
    ...(expiry.get(r.id) ?? { validityDays: null, expiresAt: null, expired: false }),
    passId: r.id,
    membershipId: r.membership_id,
    name: one(r.memberships)?.name ?? "Membership",
    unit: r.unit,
    unitsTotal: n(r.units_total),
    unitsUsed: n(r.units_used),
    status: r.status,
    priceInr: n(r.price_inr),
    boughtAt: r.bought_at,
    uses: usesByPass[r.id] ?? [],
  }));

  return {
    userId: p.id,
    name: p.full_name?.trim() || "Someone on DanceOS",
    photoPath: p.profile_photo_path ?? null,
    city: p.city ?? null,
    attended: sessions.length,
    minutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
    booked,
    upcoming,
    missed,
    cancelled,
    firstAt: sessions.length ? sessions[sessions.length - 1].startsAt : null,
    lastAt: sessions.length ? sessions[0].startsAt : null,
    months,
    styles,
    teachers,
    classes,
    routines,
    passes: passList,
  };
}
