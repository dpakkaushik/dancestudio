import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import type {
  ClassLevel,
  ClassStatus,
  DanceClass,
  PosterChoice,
  PublicClassListing,
  VenueStatus,
} from "@/types/class";

interface SessionRow {
  id: string;
  starts_at: string;
  ends_at: string;
}

interface ClassRow {
  id: string;
  business_id: string;
  share_slug: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  room_id: string | null;
  poster: PosterChoice | null;
  price_inr: number;
  capacity: number;
  status: ClassStatus;
  venue_business_id: string | null;
  venue_status: VenueStatus | null;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  class_sessions: SessionRow[] | null;
}

interface PublicClassRow extends ClassRow {
  businesses: { name: string; area: string | null; city: string | null; type?: "studio" | "artist_page" } | null;
}

/* no `title` in the read: the label is derived from style and level (types/class.ts) */
const CLASS_COLUMNS =
  "id, business_id, share_slug, style, level, room, room_id, poster, price_inr, capacity, status, venue_business_id, venue_status, lat, lng, maps_url, class_sessions (id, starts_at, ends_at)";

const firstSession = (rows: SessionRow[] | null) => {
  const live = [...(rows ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const s = live[0];
  return s ? { id: s.id, startsAt: s.starts_at, endsAt: s.ends_at } : null;
};

const toClass = (row: ClassRow): DanceClass => ({
  id: row.id,
  tenantId: row.business_id,
  title: dosClassLabel(row.style, row.level),
  shareSlug: row.share_slug,
  style: row.style,
  level: row.level,
  room: row.room,
  roomId: row.room_id,
  poster: row.poster,
  priceInr: row.price_inr,
  capacity: row.capacity,
  status: row.status,
  session: firstSession(row.class_sessions),
  venueBusinessId: row.venue_business_id ?? null,
  venueStatus: row.venue_status ?? null,
  lat: row.lat ?? null,
  lng: row.lng ?? null,
  mapsUrl: row.maps_url ?? null,
});

export interface CreateClassInput {
  tenantId: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  roomId: string | null;
  poster: PosterChoice | null;
  priceInr: number;
  capacity: number;
  status: "draft" | "published";
  startsAt: string; // ISO
  endsAt: string;
  /** an artist's class in a STUDIO's room (18 Sep 2026): the studio asked for
   *  its room — `roomId` is then one of ITS rooms — or null for a class in the
   *  business's own room or at a map link */
  venueBusinessId: string | null;
  /** an artist's class at a place of their own */
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
}

/** Atomic create: class + first session via the create_class_with_session RPC.
 *  The room and poster arguments default to null in SQL, so ten-argument
 *  callers (the earlier proof scripts) still hit this one creation path. */
export async function createClassWithSession(
  supabase: SupabaseClient,
  input: CreateClassInput
): Promise<string> {
  const { data, error } = await supabase.rpc("create_class_with_session", {
    p_business_id: input.tenantId,
    /* the column and the RPC argument still exist (Rule 4 — the overload lesson);
       what goes in is the label, never a typed name */
    p_title: dosClassLabel(input.style, input.level),
    p_style: input.style,
    p_level: input.level,
    p_room: input.room,
    p_price_inr: input.priceInr,
    p_capacity: input.capacity,
    p_status: input.status,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_room_id: input.roomId,
    p_poster: input.poster,
    p_venue_business_id: input.venueBusinessId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_maps_url: input.mapsUrl,
  });

  if (error) {
    throw new Error(`classes.create failed: ${error.message}`);
  }
  return (data as { id: string }).id;
}

/** A tenant's full catalogue, drafts included — RLS admits members only. */
export async function findClassesByTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<DanceClass[]> {
  const { data, error } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("business_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`classes.findByTenant failed: ${error.message}`);
  }
  return (data as unknown as ClassRow[]).map(toClass);
}

/** Every class of every business in the list, drafts included — the read behind
 *  "everything you manage" (S_managed). The caller passes the ids of the
 *  businesses the person BELONGS to (findMyTenants says `user_id = auth.uid()`
 *  out loud), so the query is scoped by membership and RLS is only the ceiling:
 *  a person who can also read published classes of every listed studio must not
 *  see them here as things they run. Empty list, empty result, no query. */
export async function findClassesByTenants(
  supabase: SupabaseClient,
  tenantIds: string[]
): Promise<DanceClass[]> {
  if (tenantIds.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .in("business_id", tenantIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`classes.findByTenants failed: ${error.message}`);
  }
  return (data as unknown as ClassRow[]).map(toClass);
}

/** One class by id (members only via RLS) — for the edit form. */
export async function findClassById(
  supabase: SupabaseClient,
  classId: string
): Promise<DanceClass | null> {
  const { data, error } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("id", classId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`classes.findById failed: ${error.message}`);
  }
  return data ? toClass(data as unknown as ClassRow) : null;
}

/** Published classes with the business behind them — the learner listing.
 *
 *  `city` NARROWS IN THE QUERY, and it matters more than it looks (11 Sep 2026).
 *  Discover used to ask for the 200 most recently created published classes
 *  across the WHOLE COUNTRY and then keep the ones whose city matched, in
 *  JavaScript. That works while the platform is small and fails silently the
 *  moment it is not: once there are more than 200 published classes nationally,
 *  the newest 200 can all be Delhi's, and Pune's classes simply stop appearing —
 *  no error, no empty state, just a shorter list. The style rail is ordered by
 *  how many classes each style has, so it goes wrong at the same moment and in
 *  the same silence. Filtering on the tenant's city with an inner join keeps the
 *  limit meaning what a limit should mean: the most of THIS list, not the most
 *  of every list. */
export async function findPublishedClasses(
  supabase: SupabaseClient,
  limit = 50,
  city?: string | null
): Promise<PublicClassListing[]> {
  let query = supabase
    .from("classes")
    /* ⚠ THE KEY IS NAMED (18 Sep 2026): `classes` gains a second foreign key
       into `businesses` — the VENUE an artist's class is held at — and PostgREST
       answers 300 Multiple Choices to an unqualified embed through an ambiguous
       relationship (the 28 Aug lesson, `follows` → `profiles`). Every embed
       from classes to businesses says which key it means. */
    .select(`${CLASS_COLUMNS}, businesses!classes_business_id_fkey${city ? "!inner" : ""} (name, area, city, type)`)
    .eq("status", "published")
    .is("deleted_at", null);

  if (city) {
    query = query.eq("businesses.city", city);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`classes.findPublished failed: ${error.message}`);
  }
  return (data as unknown as PublicClassRow[]).map((row) => ({
    ...toClass(row),
    tenantName: row.businesses?.name ?? "",
    tenantType: row.businesses?.type ?? "studio",
    tenantArea: row.businesses?.area ?? null,
    tenantCity: row.businesses?.city ?? null,
  }));
}

/** One class by its share slug — the /c/{slug} detail page. No policy of its own:
 *  the public resolves published classes of listed businesses, a member resolves
 *  their tenant's drafts too, and anyone else gets null. */
export async function findClassBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<PublicClassListing | null> {
  const { data, error } = await supabase
    .from("classes")
    .select(`${CLASS_COLUMNS}, businesses!classes_business_id_fkey (name, area, city, type)`)
    .eq("share_slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`classes.findBySlug failed: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  const row = data as unknown as PublicClassRow;
  return {
    ...toClass(row),
    tenantName: row.businesses?.name ?? "",
    tenantType: row.businesses?.type ?? "studio",
    tenantArea: row.businesses?.area ?? null,
    tenantCity: row.businesses?.city ?? null,
  };
}

/** Draft → published, or published → completed. RLS admits owners/trainers only. */
export async function updateClassStatus(
  supabase: SupabaseClient,
  classId: string,
  status: ClassStatus
): Promise<void> {
  const { data, error } = await supabase
    .from("classes")
    .update({ status })
    .eq("id", classId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw new Error(`classes.updateStatus failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Class not found or not yours to change");
  }
}

export interface UpdateClassInput {
  style: string;
  level: ClassLevel;
  room: string | null;
  roomId: string | null;
  poster: PosterChoice | null;
  priceInr: number;
  capacity: number;
  startsAt: string;
  endsAt: string;
  venueBusinessId: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl: string | null;
}

/** Edit a class's fields and move its session — two updates, both RLS-guarded. */
export async function updateClassDetails(
  supabase: SupabaseClient,
  classId: string,
  input: UpdateClassInput
): Promise<void> {
  const { data, error } = await supabase
    .from("classes")
    .update({
      /* renamed with its style or level, so the database's own words (the
         notification triggers, the admin desks) follow the label */
      title: dosClassLabel(input.style, input.level),
      style: input.style,
      level: input.level,
      room: input.room,
      room_id: input.roomId,
      poster: input.poster,
      price_inr: input.priceInr,
      capacity: input.capacity,
      /* a different venue or room is a new ask — the database resets the
         venue's answer, and refuses to move a published class (18 Sep 2026) */
      venue_business_id: input.venueBusinessId,
      lat: input.lat,
      lng: input.lng,
      maps_url: input.mapsUrl,
    })
    .eq("id", classId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw new Error(`classes.update failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Class not found or not yours to edit");
  }

  const { error: sessionError } = await supabase
    .from("class_sessions")
    .update({ starts_at: input.startsAt, ends_at: input.endsAt })
    .eq("class_id", classId)
    .is("deleted_at", null);

  if (sessionError) {
    throw new Error(`classes.updateSession failed: ${sessionError.message}`);
  }
}

/** Soft delete — the class and its sessions get deleted_at, nothing is ever dropped.
 *  No `.select()` after the update: a soft-deleted row satisfies no SELECT policy,
 *  so asking for it back (RETURNING) would make Postgres reject the whole update. */
export async function softDeleteClass(
  supabase: SupabaseClient,
  classId: string
): Promise<void> {
  const mine = await findClassById(supabase, classId);
  if (!mine) {
    throw new Error("Class not found or not yours to delete");
  }

  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from("classes")
    .update({ deleted_at: deletedAt })
    .eq("id", classId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`classes.delete failed: ${error.message}`);
  }

  const { error: sessionError } = await supabase
    .from("class_sessions")
    .update({ deleted_at: deletedAt })
    .eq("class_id", classId)
    .is("deleted_at", null);

  if (sessionError) {
    throw new Error(`classes.deleteSessions failed: ${sessionError.message}`);
  }
}

/** The styles each business teaches, off its PUBLISHED classes — what Discover's
 *  style rail narrows a studio or artist by (Step 23). Public rows only, by RLS. */
export async function findPublishedStylesByTenant(
  supabase: SupabaseClient,
  tenantIds: string[]
): Promise<Map<string, string[]>> {
  const ids = [...new Set(tenantIds)];
  const out = new Map<string, string[]>();
  if (ids.length === 0) {
    return out;
  }
  const { data, error } = await supabase
    .from("classes")
    .select("business_id, style")
    .in("business_id", ids)
    .eq("status", "published")
    .is("deleted_at", null)
    .limit(2000);
  if (error) {
    throw new Error(`classes.findPublishedStylesByTenant failed: ${error.message}`);
  }
  ((data ?? []) as Array<{ business_id: string; style: string }>).forEach((r) => {
    const cur = out.get(r.business_id) ?? [];
    if (!cur.includes(r.style)) cur.push(r.style);
    out.set(r.business_id, cur);
  });
  return out;
}

/** One field, from the class page's own poster sheet (prototype 11812 → 12768-12780):
 *  the design changes without dragging the whole edit form along. RLS-guarded like
 *  every other write here — no row comes back for anybody who may not. */
export async function updateClassPoster(
  supabase: SupabaseClient,
  classId: string,
  poster: PosterChoice
): Promise<void> {
  const { data, error } = await supabase
    .from("classes")
    .update({ poster })
    .eq("id", classId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw new Error(`classes.updatePoster failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Class not found or not yours to edit");
  }
}

/** WHAT STANDS BETWEEN EACH CLASS AND PUBLISH (18 Sep 2026): who was asked to
 *  teach and what they said, which studio was asked for its room and what it
 *  said, and the one sentence still in the way — `classes_publish_state`, one
 *  call for the whole register, the database's own decision (the same function
 *  the publish trigger raises). Keyed by class id. */
export interface ClassPublishState {
  classId: string;
  teacherUserId: string | null;
  teacherName: string | null;
  teacherStatus: "asked" | "confirmed" | "rejected" | null;
  venueBusinessId: string | null;
  venueName: string | null;
  venueStatus: VenueStatus | null;
  /** null means Publish would be accepted */
  why: string | null;
}

export async function findClassPublishState(supabase: SupabaseClient, tenantId: string): Promise<Map<string, ClassPublishState>> {
  const { data, error } = await supabase.rpc("classes_publish_state", { p_business_id: tenantId });
  if (error) {
    throw new Error(`classes.publishState failed: ${error.message}`);
  }
  const out = new Map<string, ClassPublishState>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    out.set(r.class_id as string, {
      classId: r.class_id as string,
      teacherUserId: (r.teacher_user_id as string) ?? null,
      teacherName: (r.teacher_name as string) ?? null,
      teacherStatus: (r.teacher_status as ClassPublishState["teacherStatus"]) ?? null,
      venueBusinessId: (r.venue_business_id as string) ?? null,
      venueName: (r.venue_name as string) ?? null,
      venueStatus: (r.venue_status as VenueStatus) ?? null,
      why: (r.why as string) ?? null,
    });
  }
  return out;
}

/** THE ONE SENTENCE BETWEEN A BUSINESS AND A NEW CLASS — `why_no_class`
 *  (17 Sep 2026's trigger, read by a screen since 18 Sep 2026): null means the
 *  form may open; a sentence means the register prints it where Create class
 *  was, instead of letting the form be filled and refused on Publish. An
 *  organization's hosting row never carries a class; an artist page only while
 *  its owner's plan is live. A failed read answers null — the trigger still
 *  decides, so the worst case is the old behaviour. */
export async function findWhyNoClass(supabase: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("why_no_class", { p_business_id: tenantId });
  if (error) return null;
  const s = typeof data === "string" ? data.trim() : "";
  return s.length > 0 ? s : null;
}

/** The venue studio's owner answers for its room (18 Sep 2026). */
export async function respondToVenueRequest(supabase: SupabaseClient, classId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_to_venue_request", { p_class_id: classId, p_accept: accept });
  if (error) {
    throw new Error(error.message);
  }
}

/** An artist's ask for a studio's room, as the Inbox's Requests desk draws it
 *  from either end (18 Sep 2026). */
export interface VenueRequest {
  classId: string;
  label: string;
  style: string;
  room: string | null;
  startsAt: string | null;
  shareSlug: string;
  createdAt: string;
  artistBusinessId: string;
  artistName: string;
  venueBusinessId: string;
  venueName: string;
  venueStatus: VenueStatus;
}

interface VenueRow {
  id: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  share_slug: string;
  created_at: string;
  business_id: string;
  venue_business_id: string;
  venue_status: VenueStatus;
  class_sessions: Array<{ starts_at: string; deleted_at: string | null }> | null;
}

/* two reads rather than one embed: `classes` has two keys into `businesses` now,
   so the names are fetched by id and joined here */
const namesOf = async (supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("businesses").select("id, name").in("id", unique);
  if (error) {
    throw new Error(`businesses.names failed: ${error.message}`);
  }
  return new Map(((data ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]));
};

const toVenueRequests = async (supabase: SupabaseClient, rows: VenueRow[]): Promise<VenueRequest[]> => {
  const names = await namesOf(
    supabase,
    rows.flatMap((r) => [r.business_id, r.venue_business_id])
  );
  return rows.map((r) => ({
    classId: r.id,
    label: dosClassLabel(r.style, r.level),
    style: r.style,
    room: r.room,
    startsAt:
      [...(r.class_sessions ?? [])]
        .filter((s) => !s.deleted_at)
        .map((s) => s.starts_at)
        .sort((a, b) => a.localeCompare(b))[0] ?? null,
    shareSlug: r.share_slug,
    createdAt: r.created_at,
    artistBusinessId: r.business_id,
    artistName: names.get(r.business_id) ?? "An artist",
    venueBusinessId: r.venue_business_id,
    venueName: names.get(r.venue_business_id) ?? "a studio",
    venueStatus: r.venue_status,
  }));
};

const VENUE_SELECT = "id, style, level, room, share_slug, created_at, business_id, venue_business_id, venue_status, class_sessions (starts_at, deleted_at)";

/** The asks waiting on a set of STUDIOS for their rooms — the Requests desk's
 *  Received side for whoever runs them. Says which studios out loud. */
export async function findVenueRequestsForTenants(supabase: SupabaseClient, tenantIds: string[]): Promise<VenueRequest[]> {
  if (tenantIds.length === 0) return [];
  const { data, error } = await supabase
    .from("classes")
    .select(VENUE_SELECT)
    .in("venue_business_id", tenantIds)
    .eq("venue_status", "requested")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`classes.venueRequests failed: ${error.message}`);
  }
  return toVenueRequests(supabase, (data ?? []) as unknown as VenueRow[]);
}

/** The rooms an ARTIST has asked for and not yet been given — waiting, or
 *  declined — the Requests desk's Sent side. Says which pages out loud. */
export async function findMyVenueAsks(supabase: SupabaseClient, pageIds: string[]): Promise<VenueRequest[]> {
  if (pageIds.length === 0) return [];
  const { data, error } = await supabase
    .from("classes")
    .select(VENUE_SELECT)
    .in("business_id", pageIds)
    .in("venue_status", ["requested", "declined"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`classes.myVenueAsks failed: ${error.message}`);
  }
  return toVenueRequests(supabase, (data ?? []) as unknown as VenueRow[]);
}

/** IS THE ROOM BUSY THEN? (parity audit F3 — the prototype's dosClash, 4023,
 *  behind the confirm sheet's ROOM ALREADY BUSY panel, 15628-15632.) The same
 *  question `assert_room_ok` asks in the database — a PUBLISHED class of this
 *  room with a live session that overlaps — asked early, so the person reads
 *  the answer in the confirm sheet instead of as a refusal after pressing
 *  Publish. Members read their own tenant's classes and sessions (Step 3), so
 *  this is a plain RLS-shaped read; the class being edited is left out, because
 *  a class does not clash with itself. Drafts are not in any room yet (Step 11:
 *  "a draft holds no room at all", 9729), so they never clash. */
export async function findRoomClash(
  supabase: SupabaseClient,
  input: { tenantId: string; roomId: string; startsAt: string; endsAt: string; excludeClassId?: string | null }
): Promise<{ label: string; startsAt: string } | null> {
  let q = supabase
    .from("class_sessions")
    .select("starts_at, ends_at, class_id, classes!inner (id, style, level, room_id, status, deleted_at)")
    .eq("business_id", input.tenantId)
    .is("deleted_at", null)
    .eq("classes.room_id", input.roomId)
    .eq("classes.status", "published")
    .is("classes.deleted_at", null)
    .lt("starts_at", input.endsAt)
    .gt("ends_at", input.startsAt)
    .order("starts_at", { ascending: true })
    .limit(2);
  if (input.excludeClassId) {
    q = q.neq("class_id", input.excludeClassId);
  }
  const { data, error } = await q;
  if (error) {
    throw new Error(`classes.roomClash failed: ${error.message}`);
  }
  const row = ((data ?? []) as unknown as Array<{ starts_at: string; classes: { style: string; level: string } | null }>)[0];
  return row
    ? { label: row.classes ? dosClassLabel(row.classes.style, row.classes.level) : "a session", startsAt: row.starts_at }
    : null;
}
