import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import { classOwnerOf } from "@/types/class";
import type { ClassPersonKind, ClassArtist, ClassPerson, MyClassPersonAsk } from "@/types/classPerson";

/** ClassPeople move only through the RPCs: the studio asks, and only the person asked
 *  can answer. Reads are RLS-shaped — the public sees confirmed classPeople on
 *  published classes, a member sees their business's, and you always see your own. */

interface ClassPersonRow {
  id: string;
  class_id: string;
  user_id: string;
  kind: ClassPersonKind;
  status: "asked" | "confirmed" | "rejected";
  can_attendance: boolean;
  can_refunds: boolean;
  pay_per_session_inr: number;
  created_at: string;
  profiles: { full_name: string; city: string | null; profile_photo_path?: string | null } | null;
}

const CLAIM_COLUMNS =
  "id, class_id, user_id, kind, status, can_attendance, can_refunds, pay_per_session_inr, created_at, profiles (full_name, city, profile_photo_path)";

const toClassPerson = (row: ClassPersonRow): ClassPerson => ({
  id: row.id,
  classId: row.class_id,
  userId: row.user_id,
  kind: row.kind,
  status: row.status,
  canAttendance: row.can_attendance,
  canRefunds: row.can_refunds,
  payPerSessionInr: row.pay_per_session_inr ?? 0,
  createdAt: row.created_at,
  personName: row.profiles?.full_name ?? "Someone",
  personCity: row.profiles?.city ?? null,
  avatarPath: row.profiles?.profile_photo_path ?? null,
});

/** Everybody on one class — what the viewer may see is decided by RLS. */
export async function findClassPeopleByClass(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassPerson[]> {
  const { data, error } = await supabase
    .from("class_people")
    .select(CLAIM_COLUMNS)
    .eq("class_id", classId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`classPeople.findByClass failed: ${error.message}`);
  }
  const rows = data as unknown as ClassPersonRow[];
  const people = rows.map(toClassPerson);
  /* ⚠ THE TEACHER'S FACE FOR A STRANGER (3 Oct 2026) — the same decision as the
     card's, on the class page: a confirmed artist whose profile this reader may
     not see is named from `public_class_teachers`, which answers for exactly
     the rows Step 11 publishes. Assistants are untouched; the decision was the
     teacher's face. A failed call leaves the page as it was. */
  const hidden = people.findIndex((p, i) => p.kind === "artist" && p.status === "confirmed" && !rows[i].profiles);
  if (hidden >= 0) {
    const { data: pub, error: pubErr } = await supabase.rpc("public_class_teachers", { p_class_ids: [classId] });
    const t = !pubErr ? ((pub ?? []) as Array<{ user_id: string; full_name: string | null; profile_photo_path: string | null }>)[0] : undefined;
    if (t && t.full_name && t.user_id === people[hidden].userId) {
      people[hidden] = { ...people[hidden], personName: t.full_name, avatarPath: t.profile_photo_path ?? null };
    }
  }
  return people;
}

/** THE TEACHER ON EACH OF THESE CLASSES (18 Sep 2026, the user: "class cards
 *  should show teacher photo instead of dance style in centre"). One read for a
 *  whole shelf, never one per card.
 *
 *  ⚠ WHAT A SIGNED-OUT VISITOR GETS, and why the card still has a fallback:
 *  Step 11's policy makes a CONFIRMED classPerson on a PUBLISHED class of a LISTED
 *  business readable by anybody, so the row itself arrives — but `profiles` has
 *  been signed-in-only since Step 1, so the embedded name and photo come back
 *  NULL for anon. A row with no readable name is dropped rather than drawn as
 *  "Someone" (the rule `publicProfile`'s Faculty list already follows), so on a
 *  signed-out Discover the card kept the style square.
 *  ⚠ DECIDED 3 Oct 2026 — the user: a stranger "should see teachers face". The
 *  rows a stranger's read drops are filled from `public_class_teachers`
 *  (20261003100000), which hands back the name and picture of exactly the
 *  confirmed artists Step 11 already publishes, and nothing else. */
export async function findClassArtists(
  supabase: SupabaseClient,
  classIds: string[]
): Promise<Map<string, ClassArtist>> {
  const ids = [...new Set(classIds)].filter(Boolean);
  const out = new Map<string, ClassArtist>();
  if (!ids.length) return out;

  const { data, error } = await supabase
    .from("class_people")
    .select("class_id, user_id, profiles (full_name, profile_photo_path)")
    .in("class_id", ids)
    .eq("kind", "artist")
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .limit(500);

  if (error) {
    throw new Error(`classPeople.findClassArtists failed: ${error.message}`);
  }
  for (const row of (data ?? []) as unknown as Array<{
    class_id: string;
    user_id: string;
    profiles: { full_name: string; profile_photo_path: string | null } | null;
  }>) {
    if (!row.profiles?.full_name) continue;
    if (out.has(row.class_id)) continue;
    out.set(row.class_id, {
      name: row.profiles.full_name,
      avatarPath: row.profiles.profile_photo_path ?? null,
      userId: row.user_id,
    });
  }

  /* ⚠ A STRANGER SEES THE TEACHER'S FACE TOO (3 Oct 2026, the user's decision).
     `profiles` is signed-in only, so for a signed-out reader every row above
     came back with no name and was dropped — and the card fell back to the
     style square. `public_class_teachers` hands back the name and the picture
     of the CONFIRMED artist of a PUBLISHED class of a LISTED business, and
     nothing else of the profile. It is asked only for the classes still
     missing, so a signed-in reader's own drafts keep coming from the read above.
     ⚠ A failed call (before 20261003100000 is applied it is PGRST202) leaves
     the card as it was rather than failing a public shelf. */
  const missing = ids.filter((id) => !out.has(id));
  if (missing.length > 0) {
    const { data: pub, error: pubErr } = await supabase.rpc("public_class_teachers", { p_class_ids: missing.slice(0, 500) });
    if (!pubErr) {
      for (const r of (pub ?? []) as Array<{ class_id: string; user_id: string; full_name: string | null; profile_photo_path: string | null }>) {
        if (!r.full_name || out.has(r.class_id)) continue;
        out.set(r.class_id, { name: r.full_name, avatarPath: r.profile_photo_path ?? null, userId: r.user_id });
      }
    }
  }
  return out;
}

/** WHICH OF THESE CLASSES HAS A TEACHER AT ALL (18 Sep 2026, the user: "remove
 *  all classes on discover without an artist in it").
 *
 *  ⚠ THIS IS A SEPARATE READ FROM `findClassArtists` ON PURPOSE, and the reason
 *  is the whole trick: a CONFIRMED classPerson on a PUBLISHED class of a LISTED
 *  business is readable by ANYBODY (Step 11), while the teacher's NAME and PHOTO
 *  live on `profiles`, which is signed-in-only (Step 1). So everyone — signed
 *  out included — can be told WHETHER a class has a teacher, even where only a
 *  signed-in reader can be told WHO. Filtering on the row rather than on the
 *  hydrated name is what keeps Discover's shelf identical for both, instead of
 *  emptying it for every stranger. */
export async function findClassesWithArtist(
  supabase: SupabaseClient,
  classIds: string[]
): Promise<Set<string>> {
  const ids = [...new Set(classIds)].filter(Boolean);
  const out = new Set<string>();
  if (!ids.length) return out;

  const { data, error } = await supabase
    .from("class_people")
    .select("class_id")
    .in("class_id", ids)
    .eq("kind", "artist")
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .limit(500);

  if (error) {
    throw new Error(`classPeople.findClassesWithArtist failed: ${error.message}`);
  }
  for (const row of (data ?? []) as Array<{ class_id: string }>) out.add(row.class_id);
  return out;
}

interface MyAskRow extends ClassPersonRow {
  deleted_at?: string | null;
  business_id?: string | null;
  classes: {
    id: string;
    deleted_at?: string | null;
    style: string;
    level: string;
    share_slug: string;
    room: string | null;
    price_inr: number;
    capacity: number;
    status: "draft" | "published" | "completed";
    poster_path: string | null;
    venue_status: "requested" | "accepted" | "declined" | null;
    businesses: { name: string; city: string | null; type: string | null; profile_photo_path: string | null } | null;
    venue: { name: string; type: string | null; profile_photo_path: string | null } | null;
    class_sessions: Array<{ id: string; starts_at: string; ends_at: string; deleted_at?: string | null }> | null;
  } | null;
}

/** ONE SHAPE FOR EVERY "ask" READ (19 Sep 2026): enough of the class to draw
 *  the app's own class card from it — the user: "assisting should also show
 *  class cards in same way" — and the ask's own STATUS, so an answered ask can
 *  still be listed in the Inbox ("enquiries and requests don't get removed
 *  after accepting"). */
const ASK_SELECT = `${CLAIM_COLUMNS}, deleted_at, business_id, classes (id, deleted_at, style, level, share_slug, room, price_inr, capacity, status, poster_path, venue_status, businesses!classes_business_id_fkey (name, city, type, profile_photo_path), venue:businesses!classes_venue_business_id_fkey (name, type, profile_photo_path), class_sessions (id, starts_at, ends_at, deleted_at))`;
const toAsk = (r: MyAskRow): MyClassPersonAsk => {
  /* the session the ask is about: the live one still to run, else the last */
  const live = [...(r.classes!.class_sessions ?? [])].filter((s) => !s.deleted_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const now = Date.now();
  const first = live.find((s) => Date.parse(s.ends_at) > now) ?? live[live.length - 1] ?? null;
  return {
    ...toClassPerson(r),
    withdrawn: Boolean(r.deleted_at) && r.status === "asked",
    classBusinessId: r.business_id ?? null,
    classTitle: dosClassLabel(r.classes!.style, r.classes!.level),
    classStyle: r.classes!.style,
    classShareSlug: r.classes!.share_slug,
    businessName: r.classes!.businesses?.name ?? "",
    startsAt: first?.starts_at ?? null,
    classLevel: r.classes!.level,
    classRoom: r.classes!.room,
    classPriceInr: r.classes!.price_inr,
    classCapacity: r.classes!.capacity,
    classStatus: r.classes!.status,
    classPosterPath: r.classes!.poster_path ?? null,
    sessionId: first?.id ?? null,
    endsAt: first?.ends_at ?? null,
    businessCity: r.classes!.businesses?.city ?? null,
    owner: classOwnerOf(r.classes!.businesses),
    venue: r.classes!.venue_status === "accepted" ? classOwnerOf(r.classes!.venue) : null,
  };
};
export type AskStatus = "asked" | "confirmed" | "rejected";

/** ⚠⚠ A CLASS THAT IS GONE IS NOT A CARD (11 Oct 2026, the user: "dates to be set
 *  should never be the case"). A studio's own members read its DELETED classes
 *  ("members read own classes" has no `deleted_at` filter — a soft-deleting role
 *  must see the row it deleted), and deleting a class soft-deletes its sessions
 *  and leaves the people on it. So every claim on a deleted class came back with
 *  NO session and was drawn as a card reading "to be set" — 46 live confirmed
 *  claims sat on deleted classes on production. A row is drawn only when its
 *  class is live AND has a session. */
const drawable = (r: MyAskRow): boolean =>
  Boolean(r.classes) && !r.classes!.deleted_at && (r.classes!.class_sessions ?? []).some((s) => !s.deleted_at);

/** The asks waiting for the signed-in person, newest first.
 *
 *  Says `user_id = auth.uid()` OUT LOUD. This leaned on RLS to mean "my asks",
 *  but Step 11 lets a business's members read every classPerson on their business — so
 *  for a studio owner this returned the asks the studio SENT as if they were
 *  asks waiting for the owner. The fourth time this lesson has surfaced: RLS is
 *  a ceiling, not a scoping mechanism. (No caller hit it yet; fixed at Step 14
 *  while the calendar was reading the same table.) */
/** ⚠ `withdrawn` (2 Oct 2026, the user: "check … doesnt get removed from the
 *  system"): a withdrawn ask is SOFT-deleted while still `asked`, and both ends'
 *  SELECT policies admit a deleted row — so the Inbox can keep it under Completed
 *  as "Withdrawn" rather than have it vanish. A confirmed row deleted later (the
 *  seat ended) is not an ask any more and stays out. */
/* ⚠ AND A NO IS A CLOSED ASK SINCE 11 Oct 2026 (20261016090000): declining sets
   `status = 'rejected'` AND `deleted_at`, so the answered list has to admit a
   deleted `rejected` row too, or every no would vanish from Answered. A
   deleted CONFIRMED row (the seat ended) still stays out. */
const liveOrWithdrawn = "deleted_at.is.null,status.in.(asked,rejected)";

export async function findMyPendingClassPeople(supabase: SupabaseClient, statuses: AskStatus[] = ["asked"], opts: { withdrawn?: boolean } = {}): Promise<MyClassPersonAsk[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }
  const base = supabase
    .from("class_people")
    .select(ASK_SELECT)
    .eq("user_id", user.id)
    .in("status", statuses);
  const { data, error } = await (opts.withdrawn ? base.or(liveOrWithdrawn) : base.is("deleted_at", null))
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`classPeople.findMinePending failed: ${error.message}`);
  }
  return (data as unknown as MyAskRow[]).filter(drawable).map(toAsk);
}

/** THE CLASSES YOU ASSIST ON, OR TEACH (18 Sep 2026, the user's Home grid: a
 *  person's Classes tile is "Booked, Assist"). Confirmed classPeople of one kind for
 *  the signed-in person, with the class behind each — the same row shape the
 *  Inbox's asks use, so the tile draws them with the same card. Says
 *  `user_id = auth.uid()` out loud for the reason findMyPendingClassPeople does. */
export async function findMyConfirmedClassPeople(supabase: SupabaseClient, kind: ClassPersonKind): Promise<MyClassPersonAsk[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }
  const { data, error } = await supabase
    .from("class_people")
    .select(ASK_SELECT)
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("status", "confirmed")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`classPeople.findMineConfirmed failed: ${error.message}`);
  }
  return (data as unknown as MyAskRow[]).filter(drawable).map(toAsk);
}

export async function askClassPerson(
  supabase: SupabaseClient,
  input: {
    classId: string;
    userId: string;
    kind: ClassPersonKind;
    canAttendance?: boolean;
    canRefunds?: boolean;
    payPerSessionInr?: number;
  }
): Promise<void> {
  const { error } = await supabase.rpc("ask_class_person", {
    p_class_id: input.classId,
    p_user_id: input.userId,
    p_kind: input.kind,
    p_can_attendance: input.canAttendance ?? false,
    p_can_refunds: input.canRefunds ?? false,
    p_pay_per_session_inr: input.payPerSessionInr ?? 0,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** What a session pays is the OWNER's call alone — separate from the jobs an
 *  owner or trainer hands out, which is why this is not part of setClassPersonPowers. */
export async function setClassPersonPay(
  supabase: SupabaseClient,
  classPersonId: string,
  payPerSessionInr: number
): Promise<void> {
  const { error } = await supabase.rpc("set_class_person_pay", {
    p_class_person_id: classPersonId,
    p_pay_per_session_inr: payPerSessionInr,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** the sentence for an ask whose class has already started — it is closed */
export const ASK_CLOSED_SENTENCE = "This class has already started — the request is closed.";

/** has the class this ask is about already started? (11 Oct 2026, the user:
 *  "classes which have not got approval and dates have crossed … should be just
 *  closed directly"). A yes to a class that has begun is a yes to nothing, so
 *  accepting is refused here, before the RPC; a no still goes through. */
export async function askHasStarted(supabase: SupabaseClient, classPersonId: string): Promise<boolean> {
  const { data } = await supabase
    .from("class_people")
    .select("id, classes (class_sessions (starts_at, deleted_at))")
    .eq("id", classPersonId)
    .maybeSingle();
  const row = data as { classes: { class_sessions: Array<{ starts_at: string; deleted_at: string | null }> | null } | null } | null;
  const starts = (row?.classes?.class_sessions ?? []).filter((s) => !s.deleted_at).map((s) => Date.parse(s.starts_at));
  return starts.length > 0 && Math.max(...starts) <= Date.now();
}

export async function respondToClassAsk(
  supabase: SupabaseClient,
  classPersonId: string,
  accept: boolean
): Promise<void> {
  if (accept && (await askHasStarted(supabase, classPersonId))) {
    throw new Error(ASK_CLOSED_SENTENCE);
  }
  const { error } = await supabase.rpc("respond_to_class_ask", {
    p_class_person_id: classPersonId,
    p_accept: accept,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** STEP DOWN (11 Oct 2026, D4): a confirmed teacher or assistant takes themself
 *  off a class that has not started. On a PUBLISHED class whose teacher steps
 *  down the database pauses booking and tells the runners and the people booked;
 *  the RPC decides all of it (`step_down_from_class`). */
export async function stepDownFromClass(supabase: SupabaseClient, classPersonId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc("step_down_from_class", {
    p_class_person_id: classPersonId,
    p_reason: reason,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function withdrawClassAsk(supabase: SupabaseClient, classPersonId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_class_ask", { p_class_person_id: classPersonId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function setClassPersonPowers(
  supabase: SupabaseClient,
  classPersonId: string,
  canAttendance: boolean,
  canRefunds: boolean
): Promise<void> {
  const { error } = await supabase.rpc("set_class_person_powers", {
    p_class_person_id: classPersonId,
    p_can_attendance: canAttendance,
    p_can_refunds: canRefunds,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** ⚠⚠ THE CLASSES THE VIEWER RUNS, OF THE ONES A PAGE IS ABOUT TO OFFER A SEAT
 *  ON (11 Oct 2026, `20261016090000`). The database now refuses a booking by the
 *  people who run a class — "You run this class — it is not yours to book" —
 *  which is the owner or a manager of the class's OWN business (`runs_business`
 *  on `classes.business_id`, never the venue's) or anybody confirmed on it,
 *  either kind. So a shelf must not offer Book Now there and be refused after the
 *  press. One call per page: the viewer's running seats and their confirmed rows
 *  on these classes, read together. Both say `user_id` out loud — RLS is a
 *  ceiling, not a scope — and a failed read answers "runs nothing", because the
 *  database still refuses the press. */
export async function findClassIdsIRun(supabase: SupabaseClient, userId: string | null | undefined, classIdsIn: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const classIds = [...new Set(classIdsIn.filter(Boolean))];
  if (!userId || classIds.length === 0) {
    return out;
  }
  try {
    /* the classes' own businesses (a card's data carries the maker's name, not
       its id) and the viewer's confirmed rows, together; then the running seats */
    const [owners, rows] = await Promise.all([
      supabase.from("classes").select("id, business_id").in("id", classIds),
      supabase.from("class_people").select("class_id").eq("user_id", userId).eq("status", "confirmed").in("class_id", classIds).is("deleted_at", null),
    ]);
    for (const r of ((rows.error ? null : rows.data) as Array<{ class_id: string }> | null) ?? []) {
      out.add(r.class_id);
    }
    const ownerRows = ((owners.error ? null : owners.data) as Array<{ id: string; business_id: string }> | null) ?? [];
    const businessIds = [...new Set(ownerRows.map((o) => o.business_id))];
    if (businessIds.length > 0) {
      const { data: seats, error } = await supabase
        .from("business_members")
        .select("business_id")
        .eq("user_id", userId)
        .in("business_id", businessIds)
        .in("member_role", ["owner", "manager"])
        .is("deleted_at", null);
      const seatRows = ((error ? null : seats) as Array<{ business_id: string }> | null) ?? [];
      const running = new Set(seatRows.map((s) => s.business_id));
      for (const o of ownerRows) {
        if (running.has(o.business_id)) out.add(o.id);
      }
    }
  } catch {
    /* runs nothing — the database still refuses the press */
  }
  return out;
}

/** Asks a set of businesses have SENT and are still waiting on — the Requests
 *  desk's Sent side for whoever runs those businesses (prototype 5734: "it is
 *  the reason a class of yours is still a draft, so it says so"). Says which
 *  businesses out loud: members read their business's classPeople under RLS, and a person
 *  on two teams would otherwise see both as one list. */
export async function findAskedClassPeopleForBusinesses(supabase: SupabaseClient, businessIds: string[], statuses: AskStatus[] = ["asked"], opts: { withdrawn?: boolean } = {}): Promise<MyClassPersonAsk[]> {
  if (businessIds.length === 0) {
    return [];
  }
  const base = supabase
    .from("class_people")
    .select(ASK_SELECT)
    .in("business_id", businessIds)
    .in("status", statuses);
  const { data, error } = await (opts.withdrawn ? base.or(liveOrWithdrawn) : base.is("deleted_at", null))
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`classPeople.findAskedForBusinesses failed: ${error.message}`);
  }
  return (data as unknown as MyAskRow[]).filter(drawable).map(toAsk);
}
