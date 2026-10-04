import type { SupabaseClient } from "@supabase/supabase-js";
import { dosClassLabel } from "@/lib/constants/styles";
import {
  classOwnerOf,
  type ClassLevel,
  type ClassStatus,
  type DanceClass,
  type PosterChoice,
  type PublicClassListing,
  type VenueStatus,
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
  /** The uploaded flyer, since `20260927130000`. Null means the DRAWN poster. */
  poster_path: string | null;
  price_inr: number;
  capacity: number;
  status: ClassStatus;
  venue_business_id: string | null;
  venue_status: VenueStatus | null;
  lat: number | null;
  lng: number | null;
  maps_url: string | null;
  allows_studio_memberships: boolean | null;
  allows_artist_memberships: boolean | null;
  class_sessions: SessionRow[] | null;
  /** WHO MADE IT (4 Oct 2026) — the owner business, read through `OWNER_EMBED`
   *  where no other embed of that key is in the select */
  owner?: OwnerEmbed | OwnerEmbed[] | null;
  /** the VENUE studio through the second key (4 Oct 2026) — the card's other
   *  half once the studio has accepted; null to a reader its row is not readable by */
  venue?: VenueEmbed | VenueEmbed[] | null;
}

type OwnerEmbed = { name: string; type?: string | null; profile_photo_path?: string | null };
type VenueEmbed = OwnerEmbed & { area?: string | null; city?: string | null };

/** the venue's embed, named on its key (two keys into `businesses` make an
 *  unqualified embed a 300 — the 18 Sep lesson) */
const VENUE_EMBED = "venue:businesses!classes_venue_business_id_fkey (name, type, profile_photo_path)";

/** ⚠ ALIASED, because a read that also filters on the owner (the public
 *  shelves) carries its own unaliased `businesses!classes_business_id_fkey`
 *  embed — those reads take the owner off that embed instead and never add
 *  this one, so one select never names the same key twice. */
const OWNER_EMBED = `owner:businesses!classes_business_id_fkey (name, type, profile_photo_path), ${VENUE_EMBED}`;

const ownerOfRow = (row: ClassRow & { businesses?: OwnerEmbed | null }) => {
  const o = Array.isArray(row.owner) ? row.owner[0] : row.owner;
  return classOwnerOf(o ?? row.businesses ?? null);
};

/** the studio an artist's class is held at — only once it has SAID YES; a room
 *  still asked for is nobody's to show on the card */
const venueOfRow = (row: ClassRow) => {
  if (row.venue_status !== "accepted") return null;
  const v = Array.isArray(row.venue) ? row.venue[0] : row.venue;
  return classOwnerOf(v ?? null);
};

interface PublicClassRow extends ClassRow {
  businesses: { name: string; area: string | null; city: string | null; type?: "studio" | "artist_page"; profile_photo_path?: string | null } | null;
  /** the VENUE studio, through the second key (19 Sep 2026) — null at the owner's
   *  own place, and null to a reader the venue's row is not readable by */
  venue?: { name: string; area: string | null; city: string | null; type?: string | null; profile_photo_path?: string | null } | null;
}

/** the two embeds a public class read carries: the OWNER through the first key,
 *  the VENUE through the second — both named, because two keys make an
 *  unqualified embed a 300 (the 18 Sep lesson) */
const OWNER_AND_VENUE = (inner: boolean) => `businesses!classes_business_id_fkey${inner ? "!inner" : ""} (name, area, city, type, profile_photo_path), venue:businesses!classes_venue_business_id_fkey (name, area, city, type, profile_photo_path)`;

const venueOf = (row: PublicClassRow) => ({
  venueName: row.venue?.name ?? null,
  venueArea: row.venue?.area ?? null,
  venueCity: row.venue?.city ?? null,
});

/* no `title` in the read: the label is derived from style and level (types/class.ts) */
const SESSION_EMBED = "class_sessions (id, starts_at, ends_at)";
const CLASS_COLUMNS =
  `id, business_id, share_slug, style, level, room, room_id, poster, poster_path, price_inr, capacity, status, venue_business_id, venue_status, lat, lng, maps_url, allows_studio_memberships, allows_artist_memberships, ${SESSION_EMBED}`;
/** the same columns with the session INNER-joined, so a read can filter on when
 *  the class actually runs — see `findPublishedClasses` (30 Sep 2026) */
const CLASS_COLUMNS_DATED = CLASS_COLUMNS.replace(SESSION_EMBED, "class_sessions!inner (id, starts_at, ends_at)");

const firstSession = (rows: SessionRow[] | null) => {
  const live = [...(rows ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const s = live[0];
  return s ? { id: s.id, startsAt: s.starts_at, endsAt: s.ends_at } : null;
};

const toClass = (row: ClassRow): DanceClass => ({
  id: row.id,
  businessId: row.business_id,
  owner: ownerOfRow(row),
  venue: venueOfRow(row),
  title: dosClassLabel(row.style, row.level),
  shareSlug: row.share_slug,
  style: row.style,
  level: row.level,
  room: row.room,
  roomId: row.room_id,
  poster: row.poster,
  posterPath: row.poster_path,
  priceInr: row.price_inr,
  capacity: row.capacity,
  status: row.status,
  session: firstSession(row.class_sessions),
  venueBusinessId: row.venue_business_id ?? null,
  venueStatus: row.venue_status ?? null,
  lat: row.lat ?? null,
  lng: row.lng ?? null,
  mapsUrl: row.maps_url ?? null,
  /* ?? the column's own defaults, so a row read before the columns existed
     (nothing does today, but a narrowed select might) reads as the database would */
  allowsStudioMemberships: row.allows_studio_memberships ?? true,
  allowsArtistMemberships: row.allows_artist_memberships ?? false,
});

export interface CreateClassInput {
  businessId: string;
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
  /** whose pass may pay for a seat here (19 Sep 2026) — see the note on the write */
  allowsStudioMemberships: boolean;
  allowsArtistMemberships: boolean;
}

/** Atomic create: class + first session via the create_class_with_session RPC.
 *  The room and poster arguments default to null in SQL, so ten-argument
 *  callers (the earlier proof scripts) still hit this one creation path. */
export async function createClassWithSession(
  supabase: SupabaseClient,
  input: CreateClassInput
): Promise<string> {
  const { data, error } = await supabase.rpc("create_class_with_session", {
    p_business_id: input.businessId,
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
  const id = (data as { id: string }).id;

  /* ⚠ THE TWO MEMBERSHIP SWITCHES ARE SET AFTER THE ROW EXISTS, NOT INSIDE THE
     RPC (19 Sep 2026). `create_class_with_session` is the ONE creation path and
     adding arguments to it means dropping and re-creating it — the overload
     lesson, and a second migration for two booleans. The columns carry the
     defaults the form starts from, so this patch only ever runs when the owner
     moved a switch, it goes through the owners-only UPDATE policy the edit form
     already uses, and a refusal leaves a real class wearing the defaults rather
     than no class at all. */
  /* audit-ok: the caller created this class one statement ago through an
     owner-only RPC, so the owner-only UPDATE policy cannot refuse them; and the
     documented fallback is a real class wearing the default switches, which is
     a better outcome than throwing away a class that exists. */
  if (input.allowsStudioMemberships !== true || input.allowsArtistMemberships !== false) {
    const { error: patchError } = await supabase
      .from("classes")
      .update({ allows_studio_memberships: input.allowsStudioMemberships, allows_artist_memberships: input.allowsArtistMemberships })
      .eq("id", id);
    if (patchError) {
      throw new Error(`classes.create memberships failed: ${patchError.message}`);
    }
  }
  return id;
}

/** A business's full catalogue, drafts included — RLS admits members only. */
export async function findClassesByBusiness(
  supabase: SupabaseClient,
  businessId: string
): Promise<DanceClass[]> {
  const { data, error } = await supabase
    .from("classes")
    .select(`${CLASS_COLUMNS}, ${OWNER_EMBED}`)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`classes.findByBusiness failed: ${error.message}`);
  }
  return (data as unknown as ClassRow[]).map(toClass);
}

/** THE ARTISTS' CLASSES HELD IN THIS STUDIO'S ROOMS (2 Oct 2026, the user:
 *  "artist taking class in studio not showing up in studios classes section").
 *  Such a class belongs to the ARTIST's page (`business_id`), so the register's
 *  own read above has never returned one — the studio said yes to its room and
 *  then could not see the class it was hosting, even while it ran. Accepted only:
 *  an unanswered request is the Requests tab's, a declined one is not here at all.
 *  The venue team's read is the 18 Sep policy ("a VENUE's team reads the classes
 *  held at their studio"); `venue_business_id` is said out loud because RLS is a
 *  ceiling, not a scope. Carries the owning page's name for the row's caption. */
export async function findClassesHostedByBusiness(
  supabase: SupabaseClient,
  businessId: string
): Promise<Array<{ danceClass: DanceClass; hostName: string }>> {
  const { data, error } = await supabase
    .from("classes")
    .select(`${CLASS_COLUMNS}, ${OWNER_EMBED}`)
    .eq("venue_business_id", businessId)
    .eq("venue_status", "accepted")
    .neq("business_id", businessId)
    .neq("status", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return (data as unknown as ClassRow[]).map((r) => {
    const danceClass = toClass(r);
    return { danceClass, hostName: danceClass.owner?.name ?? "An artist" };
  });
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
 *  the same silence. Filtering on the business's city with an inner join keeps the
 *  limit meaning what a limit should mean: the most of THIS list, not the most
 *  of every list. */
/* ⚠⚠ AND IT IS ONLY WHAT HAS NOT STARTED (30 Sep 2026). This read had no clock
   in it at all, and nothing in the app ever moves a class past `published` (see
   `classPhaseAt`) — so both shelves that call it, Discover's Classes tab and
   `/classes`, listed every class ever published under the heading "Upcoming
   classes", with a Book button on each. Pressing one reached
   `book_class_session`, which refuses `starts_at <= now()` — a raw refusal after
   the press, on the two surfaces whose whole convention is to say why before it.
   ⚠ A class that has STARTED goes too, not just one that has ended: it cannot be
   booked either, so a shelf whose job is "what can I book" has no business
   drawing it. Its own page still opens at `/c/{slug}` and says it is live. */
/* ⚠⚠ A CLASS IS IN THE CITY IT IS HELD IN, NOT THE CITY ITS OWNER IS FROM
   (1 Oct 2026, the user: "classes available for gurgaon but not shown in
   discover … a class published should reflect on all 3 after published").
   An artist's class accepted into a studio's room is held at THAT studio, and
   this read filtered on the OWNER's city alone — so Deepak's Bharatanatyam,
   owned by his page in New Delhi and held at 11ft down in Gurugram, was on
   Gurugram's shelf for nobody and on New Delhi's for a class nobody there could
   walk to. PostgREST cannot OR a filter across two embeds, so it is two reads —
   owned in the city, and HELD in the city — merged, and each row is kept only
   if the city it is HELD in is this one. */
const heldCity = (row: PublicClassRow): string | null =>
  row.venue_business_id && row.venue_status === "accepted" && row.venue ? row.venue.city ?? null : row.businesses?.city ?? null;

export async function findPublishedClasses(
  supabase: SupabaseClient,
  limit = 50,
  city?: string | null
): Promise<PublicClassListing[]> {
  const base = (embed: string) =>
    supabase
      .from("classes")
      /* ⚠ THE KEY IS NAMED (18 Sep 2026): `classes` gains a second foreign key
         into `businesses` — the VENUE an artist's class is held at — and PostgREST
         answers 300 Multiple Choices to an unqualified embed through an ambiguous
         relationship (the 28 Aug lesson, `follows` → `profiles`). Every embed
         from classes to businesses says which key it means. */
      .select(`${CLASS_COLUMNS_DATED}, ${embed}`)
      .eq("status", "published")
      .is("deleted_at", null)
      .is("class_sessions.deleted_at", null)
      .gt("class_sessions.starts_at", new Date().toISOString());

  const reads = city
    ? [
        base(OWNER_AND_VENUE(true)).eq("businesses.city", city),
        base(`businesses!classes_business_id_fkey (name, area, city, type, profile_photo_path), venue:businesses!classes_venue_business_id_fkey!inner (name, area, city, type, profile_photo_path)`)
          .eq("venue_status", "accepted")
          .eq("venue.city", city),
      ]
    : [base(OWNER_AND_VENUE(false))];

  const results = await Promise.all(reads.map((q) => q.order("created_at", { ascending: false }).limit(limit)));
  const seen = new Set<string>();
  const rows: Array<PublicClassRow & { created_at?: string }> = [];
  for (const { data, error } of results) {
    if (error) {
      throw new Error(`classes.findPublished failed: ${error.message}`);
    }
    for (const row of (data ?? []) as unknown as PublicClassRow[]) {
      if (seen.has(row.id)) continue;
      if (city && heldCity(row) !== city) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows.slice(0, limit).map((row) => ({
    ...toClass(row),
    businessName: row.businesses?.name ?? "",
    businessType: row.businesses?.type ?? "studio",
    businessArea: row.businesses?.area ?? null,
    businessCity: row.businesses?.city ?? null,
    ...venueOf(row),
  }));
}

/** One class by its share slug — the /c/{slug} detail page. No policy of its own:
 *  the public resolves published classes of listed businesses, a member resolves
 *  their business's drafts too, and anyone else gets null. */
export async function findClassBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<PublicClassListing | null> {
  const { data, error } = await supabase
    .from("classes")
    .select(`${CLASS_COLUMNS}, ${OWNER_AND_VENUE(false)}`)
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
    businessName: row.businesses?.name ?? "",
    businessType: row.businesses?.type ?? "studio",
    businessArea: row.businesses?.area ?? null,
    businessCity: row.businesses?.city ?? null,
    ...venueOf(row),
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
  allowsStudioMemberships: boolean;
  allowsArtistMemberships: boolean;
}

/** Edit a class's fields and move its session — ONE act.
 *
 *  ⚠⚠ THIS USED TO BE TWO ROUND TRIPS WITH NOTHING JOINING THEM (fixed 30 Sep
 *  2026): an `update classes …` and then an `update class_sessions …`, so
 *  anything that refused the second left a class whose style, price and capacity
 *  had moved and whose TIME had not, with nothing on screen to say so. And the
 *  second is the LIKELIER to be refused — `class_sessions` carries the room
 *  clash guard, so moving a class into an hour another class already holds
 *  failed after the first write had already landed.
 *
 *  `update_class_with_session` is those same two updates, in the same order,
 *  inside one plpgsql body — so both land or neither does. ⚠ It re-checks that
 *  the caller owns the business itself, because a definer function does not run
 *  the `classes` UPDATE policy that used to be the guard, and it raises the same
 *  sentence this function raised before so the form's message is unchanged. */
export async function updateClassDetails(
  supabase: SupabaseClient,
  classId: string,
  input: UpdateClassInput
): Promise<void> {
  const { error } = await supabase.rpc("update_class_with_session", {
    p_class_id: classId,
    /* renamed with its style or level, so the database's own words (the
       notification triggers, the admin desks) follow the label */
    p_title: dosClassLabel(input.style, input.level),
    p_style: input.style,
    p_level: input.level,
    p_room: input.room,
    p_price_inr: input.priceInr,
    p_capacity: input.capacity,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_room_id: input.roomId,
    p_poster: input.poster,
    /* a different venue or room is a new ask — the database resets the
       venue's answer, and refuses to move a published class (18 Sep 2026) */
    p_venue_business_id: input.venueBusinessId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_maps_url: input.mapsUrl,
    p_allows_studio_memberships: input.allowsStudioMemberships,
    p_allows_artist_memberships: input.allowsArtistMemberships,
  });

  /* the door's own words, not a reworded version of them (27 Sep 2026) */
  if (error) {
    throw new Error(error.message);
  }
}

/** What calling a class off did: every live seat cancelled, every PAID one
 *  refunded. `refunds` is never more than `seats`, and is 0 on a free class. */
export interface ClassCallOff {
  seats: number;
  refunds: number;
  amountInr: number;
}

/** Soft delete — the class and its sessions get deleted_at, nothing is ever dropped.
 *  No `.select()` after the update: a soft-deleted row satisfies no SELECT policy,
 *  so asking for it back (RETURNING) would make Postgres reject the whole update.
 *  ⚠ It CALLS THE CLASS OFF FIRST — see the block inside. */
export async function softDeleteClass(
  supabase: SupabaseClient,
  classId: string
): Promise<ClassCallOff> {
  const mine = await findClassById(supabase, classId);
  if (!mine) {
    throw new Error("Class not found or not yours to delete");
  }

  /* ⚠⚠ THE SEATS COME OFF FIRST, AND THE MONEY GOES BACK WITH THEM (30 Sep 2026).
     The delete sheet has read "{n} enrolled students must be refunded — you'll
     settle each refund on the next screen" since 29 Aug 2026, its button reads
     "Delete & manage refunds", and it then sends the owner to the money desk —
     and NOT ONE REFUND ROW WAS EVER WRITTEN BY ANY OF IT. They arrived at the
     desk and there was nothing there; the learner's seat stayed `enrolled` on a
     class that no longer existed and their money stayed where it was.

     ⚠ BEFORE the delete, not after, and not as a trigger on it:
       · `cancel_class_bookings_for_class` re-checks that this caller OWNS the
         business and raises in WORDS if not — so a manager (a seat the register
         has admitted since 28 Sep) is refused before a single seat is touched,
         rather than cancelling a room full of people for a delete that is then
         refused two statements later;
       · money moving as a side effect of a soft delete could carry no reason and
         could not be refused, which is why it is a call and not a trigger.

     ⚠ The refusal is passed through in the DATABASE'S OWN WORDS rather than
     reworded here — a refusal in the database's words is not an explanation to
     be tidied away (27 Sep 2026). */
  const { data: calledOff, error: callOffError } = await supabase.rpc(
    "cancel_class_bookings_for_class",
    { p_class_id: classId, p_reason: "The studio cancelled this class" }
  );
  if (callOffError) {
    throw new Error(callOffError.message);
  }

  const deletedAt = new Date().toISOString();
  /* audit-ok: a soft-deleted row satisfies no SELECT policy, so `.select()`
     here would make Postgres reject the whole statement — the read-back
     below is this write's status check, and the block above it says why. */
  const { error } = await supabase
    .from("classes")
    .update({ deleted_at: deletedAt })
    .eq("id", classId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`classes.delete failed: ${error.message}`);
  }

  /* ⚠⚠ AND THE UPDATE HAS TO BE READ BACK, BECAUSE A REFUSAL HERE IS SILENT
     (30 Sep 2026). RLS has admitted only the OWNER to `classes` UPDATE since
     18 Sep, and this update deliberately asks for no rows back — a soft-deleted
     row satisfies no SELECT policy, so a RETURNING would make Postgres reject
     the whole statement. The cost of that is that "refused by policy" and "done"
     both arrive as zero rows and NO error: the action returned `{ error: null }`
     and the class was still there. It is how a MANAGER — a seat the register has
     admitted since 28 Sep — pressed Delete, was told nothing, and found the
     class still on the list.
     ⚠ `findClassById` filters `deleted_at is null`, so after a delete that
     landed it answers null whoever is asking; a row that comes back is a row
     that was not deleted. One extra read, on the rarest action on this desk.
     A WRITE WHOSE STATUS NOBODY READS IS NOT A WRITE — this file's own lesson. */
  if (await findClassById(supabase, classId)) {
    throw new Error("Only the owner of this studio can delete its classes");
  }

  /* audit-ok: same two reasons — a soft-deleted row is unreadable, and the
     read-back four lines up has already proven this caller may delete. */
  const { error: sessionError } = await supabase
    .from("class_sessions")
    .update({ deleted_at: deletedAt })
    .eq("class_id", classId)
    .is("deleted_at", null);

  if (sessionError) {
    throw new Error(`classes.deleteSessions failed: ${sessionError.message}`);
  }

  /* what the call-off actually did, so a caller can say it rather than guess.
     The RPC counts as it goes; nothing here re-counts it. */
  return {
    seats: Number(calledOff?.seats ?? 0),
    refunds: Number(calledOff?.refunds ?? 0),
    amountInr: Number(calledOff?.amount_inr ?? 0),
  };
}

/** The styles each business teaches, off its PUBLISHED classes — what Discover's
 *  style rail narrows a studio or artist by (Step 23). Public rows only, by RLS. */
export async function findPublishedStylesByBusiness(
  supabase: SupabaseClient,
  businessIds: string[]
): Promise<Map<string, string[]>> {
  const ids = [...new Set(businessIds)];
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
    throw new Error(`classes.findPublishedStylesByBusiness failed: ${error.message}`);
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

export async function findClassPublishState(supabase: SupabaseClient, businessId: string): Promise<Map<string, ClassPublishState>> {
  const { data, error } = await supabase.rpc("classes_publish_state", { p_business_id: businessId });
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
export async function findWhyNoClass(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("why_no_class", { p_business_id: businessId });
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
  /** the class this ask is about, whole — the Inbox draws the app's one class
   *  card for it (27 Sep 2026) rather than a row of its own invention */
  danceClass: DanceClass;
}

/** a venue ask IS a class row plus when it was asked (27 Sep 2026) — it extends
 *  `ClassRow` so `toClass` can turn it into the card the Inbox draws */
interface VenueRow extends ClassRow {
  created_at: string;
  venue_business_id: string;
  venue_status: VenueStatus;
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
  return rows.map((r) => {
    /* the class itself, as every other read hands it over — so the Inbox can
       draw the app's one class card instead of a sentence (27 Sep 2026) */
    const danceClass = toClass(r);
    return {
      classId: r.id,
      label: danceClass.title,
      style: r.style,
      room: r.room,
      startsAt: danceClass.session?.startsAt ?? null,
      shareSlug: r.share_slug,
      createdAt: r.created_at,
      artistBusinessId: r.business_id,
      artistName: names.get(r.business_id) ?? "An artist",
      venueBusinessId: r.venue_business_id,
      venueName: names.get(r.venue_business_id) ?? "a studio",
      venueStatus: r.venue_status,
      danceClass,
    };
  });
};

/** ⚠ THE WHOLE CLASS, NOT A LABEL (27 Sep 2026, the user: *"event and class
 *  request cards should also look like class and event cards on discover with
 *  accept and reject buttons"*). This read carried style, level, room and a
 *  start — enough for a sentence, and four columns short of the card: no
 *  price, no capacity, no status, no session id, no end. `CLASS_COLUMNS` is
 *  what every other class read already selects, so the ask hands the Inbox a
 *  real `DanceClass` and `ClassTile` draws it exactly as Discover does.
 *  ⚠ `created_at` and the venue's own columns ride ON TOP of it — they are the
 *  ASK's facts rather than the class's. */
const VENUE_SELECT = `${CLASS_COLUMNS}, ${OWNER_EMBED}, created_at`;

/** The asks waiting on a set of STUDIOS for their rooms — the Requests desk's
 *  Received side for whoever runs them. Says which studios out loud. */
export async function findVenueRequestsForBusinesses(
  supabase: SupabaseClient,
  businessIds: string[],
  /** the register's Requests tab wants the live queue; the Inbox wants all three */
  statuses: Array<"requested" | "accepted" | "declined"> = ["requested"]
): Promise<VenueRequest[]> {
  if (businessIds.length === 0) return [];
  const { data, error } = await supabase
    .from("classes")
    .select(VENUE_SELECT)
    .in("venue_business_id", businessIds)
    /* ⚠ the Inbox asks for answered ones too (2 Oct 2026) — an accepted or
       declined room request used to vanish from it; it belongs under Completed */
    .in("venue_status", statuses)
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
    /* ⚠ accepted too (2 Oct 2026) — a yes used to vanish from the artist's Sent */
    .in("venue_status", ["requested", "accepted", "declined"])
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
 *  Publish. Members read their own business's classes and sessions (Step 3), so
 *  this is a plain RLS-shaped read; the class being edited is left out, because
 *  a class does not clash with itself. Drafts are not in any room yet (Step 11:
 *  "a draft holds no room at all", 9729), so they never clash. */
export async function findRoomClash(
  supabase: SupabaseClient,
  input: { businessId: string; roomId: string; startsAt: string; endsAt: string; excludeClassId?: string | null }
): Promise<{ label: string; startsAt: string } | null> {
  let q = supabase
    .from("class_sessions")
    .select("starts_at, ends_at, class_id, classes!inner (id, style, level, room_id, status, deleted_at)")
    .eq("business_id", input.businessId)
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
