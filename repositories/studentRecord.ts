import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
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

/** a routine taught in one class — what the class tile's breakup links to */
export interface StudentClassRoutine {
  routineId: string;
  title: string;
  style: string;
  songTitle: string | null;
  songUrl: string | null;
  songIsFile: boolean;
  videoUrl: string | null;
}

/** ONE CLASS OF THEIRS HERE — every class they BOOKED a seat on, not only the ones
 *  they were checked in to (4 Oct 2026, the user: "Student detail page classes
 *  section should be handled similarly to how we did for team members but … should
 *  be relevant according to the student"). What is relevant to a student is their
 *  OWN seats on it: booked, checked in, missed, still to come. */
export interface StudentClass {
  classId: string;
  shareSlug: string;
  style: string;
  level: string;
  /** sessions of it they were checked in to */
  sessions: number;
  /** the time those sessions ran */
  minutes: number;
  /** seats they booked on it — live, not cancelled, not a waitlist place */
  booked: number;
  /** booked, over, and nobody checked them in */
  missed: number;
  /** booked and not started yet */
  upcoming: number;
  /** their last session of it that has started, and their next one */
  lastAt: string | null;
  nextAt: string | null;
  /** who took the class — its confirmed artist (4 Oct 2026); null when none */
  artist: { userId: string; name: string; photoPath: string | null } | null;
  /** where it is held — the venue that said yes, else this business — and the room */
  venueName: string | null;
  venuePhoto: string | null;
  room: string | null;
  /** the routines this class teaches */
  routines: StudentClassRoutine[];
}

/** one payment this business took from this student (4 Oct 2026) */
export interface StudentPayment {
  id: string;
  what: string;
  kind: "class" | "membership" | "enquiry" | "other";
  amountInr: number;
  /** processed refunds against it — the label follows the money (3 Oct 2026) */
  refundedInr: number;
  paidAt: string;
  method: string | null;
  href: string | null;
}

export interface StudentEarnings {
  /** everything captured from them here, refunded or not */
  cameInInr: number;
  refundedInr: number;
  netInr: number;
  byKind: { class: number; membership: number; enquiry: number; other: number };
  payments: StudentPayment[];
  /** false when the read hit its guard and the totals are not the whole story */
  complete: boolean;
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
  /** what this business took from them (4 Oct 2026) — the Earnings column */
  earnings: StudentEarnings;
}

/** a runaway guard, not a page size — the totals say when it is hit */
const MAX_PAYMENTS = 500;

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

/** what a class row carries for the Classes column — its name, its room, and
 *  where it is held (the venue that said yes) */
const CLASS_COLS = "style, level, share_slug, room, venue_business_id, venue_status";
type ClassCols = { style: string; level: string; share_slug: string; room: string | null; venue_business_id: string | null; venue_status: string | null };

export async function findStudentRecord(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  now: Date = new Date(),
): Promise<StudentRecord | null> {
  const [profile, attendance, bookings, passes, payments] = await Promise.all([
    supabase.from("profiles").select("id, full_name, profile_photo_path, city").eq("id", userId).is("deleted_at", null).maybeSingle(),
    supabase
      .from("attendance")
      .select(`class_booking_id, class_id, class_sessions (starts_at, ends_at), classes (${CLASS_COLS})`)
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .limit(2000),
    supabase
      .from("class_bookings")
      .select(`id, status, class_id, class_sessions (starts_at, ends_at), classes (${CLASS_COLS})`)
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
    /* ⚠ MONEY THIS BUSINESS TOOK FROM THIS PERSON (4 Oct 2026, the user: "replace
       with earnings from this student"). Orders only — `subscription_*` is a
       studio paying DanceOS, never a student paying the studio. A refunded
       payment still CAME IN; what went back is its own figure. */
    supabase
      .from("payments")
      .select("id, amount_inr, method, created_at, refunds (amount_inr, status, deleted_at), orders!inner (membership_id, enquiry_quote_id, enquiry_part, classes (style, level, share_slug), memberships (name))")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .eq("kind", "order")
      .in("status", ["captured", "refunded"])
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_PAYMENTS),
  ]);

  const p = profile.data as { id: string; full_name: string | null; profile_photo_path: string | null; city: string | null } | null;
  if (!p) return null;

  /* ── what they danced here ── */
  type AttRow = {
    class_booking_id: string;
    class_id: string;
    class_sessions: One<{ starts_at: string; ends_at: string }>;
    classes: One<ClassCols>;
  };
  /* every class row met on the way, for the Classes column — a booked class
     they have not danced yet is one of theirs too (4 Oct 2026) */
  const classCols = new Map<string, ClassCols>();
  const sessions: StudentSession[] = [];
  const checkedBookings = new Set<string>();
  for (const r of (attendance.data ?? []) as unknown as AttRow[]) {
    checkedBookings.add(r.class_booking_id);
    const s = one(r.class_sessions);
    const c = one(r.classes);
    if (c) classCols.set(r.class_id, c);
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
  /* per class, their own seats — what the Classes column counts */
  type Seats = { booked: number; missed: number; upcoming: number; lastAt: string | null; nextAt: string | null };
  const seatsByClass = new Map<string, Seats>();
  for (const b of (bookings.data ?? []) as unknown as Array<{ id: string; status: string; class_id: string; class_sessions: One<{ starts_at: string; ends_at: string }>; classes: One<ClassCols> }>) {
    if (b.status === "cancelled") {
      cancelled += 1;
      continue;
    }
    if (b.status !== "enrolled") continue; // a waitlist place is not a seat
    booked += 1;
    const c = one(b.classes);
    if (c) classCols.set(b.class_id, c);
    const seat = seatsByClass.get(b.class_id) ?? { booked: 0, missed: 0, upcoming: 0, lastAt: null, nextAt: null };
    seat.booked += 1;
    seatsByClass.set(b.class_id, seat);
    const s = one(b.class_sessions);
    if (!s) continue;
    if (new Date(s.starts_at).getTime() > nowMs) {
      upcoming += 1;
      seat.upcoming += 1;
      if (!seat.nextAt || s.starts_at < seat.nextAt) seat.nextAt = s.starts_at;
    } else {
      if (!seat.lastAt || s.starts_at > seat.lastAt) seat.lastAt = s.starts_at;
      if (new Date(s.ends_at).getTime() <= nowMs && !checkedBookings.has(b.id)) {
        missed += 1;
        seat.missed += 1;
      }
    }
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
  const allClassIds = [...classCols.keys()];
  /* where each class is held — the venue that said yes, else this business —
     with its name and picture, read once for the column; degrade, never fail */
  const venueOf = (c: ClassCols) => (c.venue_status === "accepted" && c.venue_business_id ? c.venue_business_id : businessId);
  const venueIds = [...new Set([...classCols.values()].map(venueOf))];
  const [artists, venueRes] = await Promise.all([
    findClassArtists(supabase, allClassIds).catch(() => new Map()),
    venueIds.length ? supabase.from("businesses").select("id, name, profile_photo_path").in("id", venueIds) : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const venues = new Map<string, { name: string; photo: string | null }>();
  for (const b of (venueRes.data ?? []) as Array<{ id: string; name: string; profile_photo_path: string | null }>) venues.set(b.id, { name: b.name, photo: b.profile_photo_path });
  const byTeacher = new Map<string, { userId: string; name: string; photoPath: string | null; n: number }>();
  for (const s of sessions) {
    const a = artists.get(s.classId);
    if (!a) continue;
    const t = byTeacher.get(a.userId) ?? { userId: a.userId, name: a.name, photoPath: a.avatarPath ?? null, n: 0 };
    t.n += 1;
    byTeacher.set(a.userId, t);
  }
  const teachers = [...byTeacher.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  /* ── THE CLASSES, ONE ROW EACH (4 Oct 2026) — every class they hold or held a
     seat on here, with their OWN seats on it, and the check-ins counted off the
     same attendance rows the Stats column counts ── */
  const byClass = new Map<string, StudentClass>();
  for (const [classId, cols] of classCols) {
    const a = artists.get(classId);
    const seat = seatsByClass.get(classId);
    const v = venues.get(venueOf(cols));
    byClass.set(classId, {
      classId,
      shareSlug: cols.share_slug,
      style: cols.style,
      level: cols.level,
      sessions: 0,
      minutes: 0,
      booked: seat?.booked ?? 0,
      missed: seat?.missed ?? 0,
      upcoming: seat?.upcoming ?? 0,
      lastAt: seat?.lastAt ?? null,
      nextAt: seat?.nextAt ?? null,
      artist: a ? { userId: a.userId, name: a.name, photoPath: a.avatarPath ?? null } : null,
      venueName: v?.name ?? null,
      venuePhoto: v?.photo ?? null,
      room: cols.room || null,
      routines: [],
    });
  }
  for (const s of sessions) {
    const c = byClass.get(s.classId);
    if (!c) continue;
    c.sessions += 1;
    c.minutes += s.minutes;
    if (!c.lastAt || s.startsAt > c.lastAt) c.lastAt = s.startsAt;
  }
  /* what is coming first (soonest), then what is over (most recent) */
  const classes = [...byClass.values()].sort(
    (a, b) =>
      Number(Boolean(b.nextAt)) - Number(Boolean(a.nextAt)) ||
      (a.nextAt && b.nextAt ? a.nextAt.localeCompare(b.nextAt) : (b.lastAt ?? "").localeCompare(a.lastAt ?? "")),
  );

  /* ── the routines those classes taught. `class_routines` is readable by
     whoever can read the class (20260919160000), and a business's runners read
     its classes. ⚠ It DEGRADES to none rather than failing the page — the
     record must not 500 over a list beside it. ── */
  const routines: StudentRoutine[] = [];
  if (classes.length > 0) {
    type RtRow = {
      class_id: string;
      routines: One<{ id: string; title: string; style: string; level: string; song_title: string | null; song_url: string | null; song_is_file: boolean | null; video_url: string | null; profiles: One<{ full_name: string | null; profile_photo_path: string | null }> }>;
    };
    const { data: rt } = await supabase
      .from("class_routines")
      .select("class_id, routines (id, title, style, level, song_title, song_url, song_is_file, video_url, profiles (full_name, profile_photo_path))")
      .in("class_id", classes.map((c) => c.classId))
      .is("deleted_at", null)
      .limit(200);
    const byRoutine = new Map<string, StudentRoutine & { classIds: Set<string> }>();
    for (const row of (rt ?? []) as unknown as RtRow[]) {
      const r = one(row.routines);
      if (!r) continue;
      /* the class tile's breakup — this routine, on this class, with its links */
      const cls = byClass.get(row.class_id);
      if (cls && !cls.routines.some((x) => x.routineId === r.id)) {
        cls.routines.push({ routineId: r.id, title: r.title, style: r.style, songTitle: r.song_title, songUrl: r.song_url, songIsFile: Boolean(r.song_is_file), videoUrl: r.video_url });
      }
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

  /* ── what this business took from them — the Earnings column (4 Oct 2026) ── */
  type PayRow = {
    id: string;
    amount_inr: number;
    method: string | null;
    created_at: string;
    refunds: Array<{ amount_inr: number; status: string; deleted_at: string | null }> | null;
    orders: One<{ membership_id: string | null; enquiry_quote_id: string | null; enquiry_part: string | null; classes: One<{ style: string; level: string; share_slug: string }>; memberships: One<{ name: string }> }>;
  };
  const payRows = (payments.data ?? []) as unknown as PayRow[];
  const byKind = { class: 0, membership: 0, enquiry: 0, other: 0 };
  const payList: StudentPayment[] = payRows.map((r) => {
    const o = one(r.orders);
    const cls = one(o?.classes ?? null);
    const mem = one(o?.memberships ?? null);
    const kind: StudentPayment["kind"] = cls ? "class" : o?.membership_id ? "membership" : o?.enquiry_quote_id ? "enquiry" : "other";
    const amount = n(r.amount_inr);
    /* the processed refund ROWS, never the stored word (3 Oct 2026) */
    const back = Math.min(amount, (r.refunds ?? []).filter((x) => x.status === "processed" && !x.deleted_at).reduce((s, x) => s + n(x.amount_inr), 0));
    byKind[kind] += amount;
    return {
      id: r.id,
      what: cls ? dosClassLabel(cls.style, cls.level) : mem ? mem.name : kind === "enquiry" ? `Enquiry · ${o?.enquiry_part === "advance" ? "advance" : o?.enquiry_part === "balance" ? "balance" : "paid in full"}` : "Booking",
      kind,
      amountInr: amount,
      refundedInr: back,
      paidAt: r.created_at,
      method: r.method,
      /* a membership's details live under the studio that sold it (5 Oct 2026):
         every payment here is this business's (`business_id` above), so the
         seller is this studio and the switcher stays on it */
      href: cls ? `/c/${cls.share_slug}` : o?.membership_id ? `/business/${businessId}/memberships/${o.membership_id}` : null,
    };
  });
  const cameIn = payList.reduce((s, x) => s + x.amountInr, 0);
  const refunded = payList.reduce((s, x) => s + x.refundedInr, 0);

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
    earnings: {
      cameInInr: cameIn,
      refundedInr: refunded,
      netInr: cameIn - refunded,
      byKind,
      payments: payList,
      complete: payRows.length < MAX_PAYMENTS,
    },
  };
}
