import type { SupabaseClient } from "@supabase/supabase-js";
import { findArtistIds } from "@/repositories/profiles";
import type { ProfileRole } from "@/types/profile";
import type { FollowState, FollowedTenant, TenantFollower } from "@/types/follow";
import type { BusinessType } from "@/types/tenant";

/** Step 15 reads and the one write. Rows are private (the follower's own, and
 *  the followed business's members'); the COUNT is public through the
 *  aggregate-only `follower_counts`. Every "mine" query says `follower_id =
 *  auth.uid()` out loud — RLS is a ceiling, not a scope: a studio member reads
 *  their business's follows too, and would otherwise see them as their own.
 *
 *  ⚠⚠ A FOLLOW OUTLIVES WHAT IT NAMES, AND EVERY READ HERE HAS TO SAY SO
 *  (29 Sep 2026, the user: *"fix follow following list when it opens shows
 *  inaccurate details and counts"*).
 *
 *  Soft delete is this app's rule (Rule 3), so deleting a studio or an account
 *  leaves its `follows` rows live and pointing at a row with a `deleted_at`.
 *  Every read below filtered the FOLLOW and none of them filtered the thing
 *  followed — except `findMyFollowedCrews`, which did, which is why a dead crew
 *  never showed and a dead studio always did. Measured on production the day
 *  this was fixed: **29 live follows, 8 of them naming a deleted business and 6
 *  made by a deleted account.**
 *
 *  What that looked like on screen is exactly the complaint: a Following sheet
 *  listing studios that are gone, and a Followers sheet whose rows had no name
 *  to read — so they were drawn as "Someone", a person who does not exist.
 *
 *  ⚠ THE COUNT IS FIXED IN THE DATABASE, NOT HERE (`20260929110000`). The three
 *  `*_follower_counts` functions count follow rows and never looked at the other
 *  party either, so the header said 12 while the list drew 7. A filter applied
 *  in one of the two places would have made the disagreement worse, not better —
 *  which is why the migration and this file are one change. */

const MAX_LIST = 500;

interface CountRow {
  business_id: string;
  followers: number;
}

interface MyFollowRow {
  id: string;
  business_id: string;
  created_at: string;
  businesses: {
    /** ⚠ `| "org"` because the COLUMN still holds it and `BusinessType` no longer
     *  does: 20 `businesses` rows carry `type = 'org'` as tombstones, soft-
     *  deleted by the 29 Sep sweep (the money on them is why the rows stay).
     *  Typing this as the app's own union would be the app telling itself a
     *  word cannot arrive that the database can still send. */
    type: BusinessType | "org";
    name: string;
    area: string | null;
    city: string | null;
    profile_photo_path: string | null;
    deleted_at: string | null;
  } | null;
}

interface FollowerRow {
  id: string;
  follower_id: string;
  created_at: string;
  profiles: {
    full_name: string;
    role: ProfileRole;
    city: string | null;
    profile_photo_path: string | null;
    deleted_at: string | null;
  } | null;
}

/** The columns every follower row reads — one list, so a sheet cannot come to
 *  draw a different person from the sheet beside it. `deleted_at` is in it
 *  because the row is DROPPED on it; see the note at the top of this file. */
const FOLLOWER_PROFILE = "full_name, role, city, profile_photo_path, deleted_at";

/** A follower row, once — three sheets read the same shape and each used to map
 *  it by hand, and one of the three invented "Someone" for a row it could not
 *  read. Nothing is invented here: a row whose person is gone is not a row. */
const liveFollowers = <T extends FollowerRow>(rows: T[], artists: Set<string>): TenantFollower[] =>
  rows
    .filter((r) => r.profiles && !r.profiles.deleted_at)
    .map((r) => ({
      followId: r.id,
      userId: r.follower_id,
      name: r.profiles!.full_name,
      role: r.profiles!.role,
      isArtist: artists.has(r.follower_id),
      city: r.profiles!.city,
      avatarPath: r.profiles!.profile_photo_path,
      followedAt: r.created_at,
    }));

/** Live follower counts — a number, never a name. Listed businesses answer for
 *  everybody; an unlisted one only for its own members (the function decides). */
export async function findFollowerCounts(
  supabase: SupabaseClient,
  businessIds: string[]
): Promise<Map<string, number>> {
  const ids = [...new Set(businessIds)];
  if (ids.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase.rpc("follower_counts", { p_business_ids: ids });
  if (error) {
    throw new Error(`follows.counts failed: ${error.message}`);
  }
  const map = new Map<string, number>();
  ((data ?? []) as CountRow[]).forEach((r) => map.set(r.business_id, Number(r.followers)));
  return map;
}

/** A crew's live follower count (`crew_follower_counts`, anon-readable since
 *  19 Sep 2026) — a number, never a name. A failed read is "no figure", so a
 *  public page never fails on its count. */
export async function findCrewFollowerCount(supabase: SupabaseClient, crewId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("crew_follower_counts", { p_crew_ids: [crewId] });
  if (error) return null;
  const row = ((data ?? []) as Array<{ crew_id: string; followers: number }>).find((r) => r.crew_id === crewId);
  return row ? Number(row.followers) : 0;
}

/** Whether the signed-in person follows this business right now. */
export async function isFollowingTenant(supabase: SupabaseClient, businessId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }
  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", user.id)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .limit(1);
  if (error) {
    throw new Error(`follows.isFollowing failed: ${error.message}`);
  }
  return (data ?? []).length > 0;
}

/** The businesses the signed-in person follows, newest first. */
export async function findMyFollowing(supabase: SupabaseClient): Promise<FollowedTenant[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }
  const { data, error } = await supabase
    .from("follows")
    .select("id, business_id, created_at, businesses (type, name, area, city, profile_photo_path, deleted_at)")
    .eq("follower_id", user.id)
    .not("business_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.findMine failed: ${error.message}`);
  }
  /* ⚠ A `flatMap` rather than filter-then-map, so the narrowing survives: the
     one thing being dropped is a `type` the app's own union no longer has, and
     a `.filter()` predicate does not carry that knowledge into `.map()`. */
  return ((data ?? []) as unknown as MyFollowRow[]).flatMap((r) => {
    const b = r.businesses;
    /* ⚠ `!deleted_at` is the fix of 29 Sep 2026 — eight of these on production
       named a studio that had been deleted, and the sheet listed every one with
       a working-looking link to a page that 404s. ⚠ And `!== "org"`, for the
       same reason one layer along: the row builders map anything that is not a
       studio to `/artist/{id}`, so an old org follow drew as an Artist and
       opened nothing. Measured the same day: zero such rows, so this guards the
       shape rather than data — which is what makes it worth writing down. */
    if (!b || b.deleted_at || b.type === "org") return [];
    return [
      {
        followId: r.id,
        businessId: r.business_id,
        businessType: b.type,
        businessName: b.name,
        tenantArea: b.area,
        tenantCity: b.city,
        tenantPhotoPath: b.profile_photo_path,
        followedAt: r.created_at,
      },
    ];
  });
}

/** Who follows this business — RLS admits its members and nobody else. The
 *  embed names its FK: since person-follows landed, `follows` has TWO foreign
 *  keys into `profiles` (follower and followee) and an unqualified `profiles(...)`
 *  is ambiguous — PostgREST answers 300 Multiple Choices. */
export async function findTenantFollowers(
  supabase: SupabaseClient,
  businessId: string
): Promise<TenantFollower[]> {
  const { data, error } = await supabase
    .from("follows")
    .select(`id, follower_id, created_at, profiles!follows_follower_id_fkey (${FOLLOWER_PROFILE})`)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.findFollowers failed: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as FollowerRow[];
  const artists = await findArtistIds(supabase, rows.map((r) => r.follower_id));
  return liveFollowers(rows, artists);
}

/** WHO FOLLOWS THIS CREW (27 Sep 2026) — the business read's twin, on the other
 *  column `follows` learned on 19 Sep. RLS admits the crew's LEADER and nobody
 *  else ("crew leaders read their crew's followers"), so a member pressing the
 *  figure gets an empty list and a stranger gets one too — the ceiling is the
 *  policy's, not this function's.
 *  ⚠ The embed names its key for the same reason the business read does: two
 *  FKs from `follows` into `profiles` make an unqualified embed a 300. */
export async function findCrewFollowers(supabase: SupabaseClient, crewId: string): Promise<TenantFollower[]> {
  const { data, error } = await supabase
    .from("follows")
    .select(`id, follower_id, created_at, profiles!follows_follower_id_fkey (${FOLLOWER_PROFILE})`)
    .eq("crew_id", crewId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.findCrewFollowers failed: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as FollowerRow[];
  const artists = await findArtistIds(supabase, rows.map((r) => r.follower_id));
  return liveFollowers(rows, artists);
}

/** One person in a person's Followers / Following sheet (S_profiletab 11335). */
export interface PersonFollowRow {
  followId: string;
  userId: string;
  name: string;
  role: ProfileRole;
  isArtist: boolean;
  city: string | null;
  avatarPath: string | null;
  followedAt: string;
}

/** The people who follow the signed-in person — their own to read (the
 *  person-pages policy "people read their own followers"). `followee_id = me`
 *  is said out loud: the same table holds follows of businesses this person
 *  may be a member of, and RLS is a ceiling, not a scope. */
export async function findMyPersonFollowers(supabase: SupabaseClient): Promise<PersonFollowRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("follows")
    .select(`id, follower_id, created_at, profiles!follows_follower_id_fkey (${FOLLOWER_PROFILE})`)
    .eq("followee_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.myFollowers failed: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as FollowerRow[];
  const artists = await findArtistIds(supabase, rows.map((r) => r.follower_id));
  return liveFollowers(rows, artists);
}

/** The PEOPLE the signed-in person follows (the businesses are findMyFollowing). */
export async function findMyFollowedPeople(supabase: SupabaseClient): Promise<PersonFollowRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("follows")
    .select(`id, followee_id, created_at, profiles!follows_followee_id_fkey (${FOLLOWER_PROFILE})`)
    .eq("follower_id", user.id)
    .not("followee_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`follows.myFollowedPeople failed: ${error.message}`);
  }
  /* the one read whose person is the FOLLOWEE — `liveFollowers` keys on
     `follower_id`, so this maps its own rather than pretending the shapes match */
  const rows = ((data ?? []) as unknown as Array<{ id: string; followee_id: string; created_at: string; profiles: FollowerRow["profiles"] }>)
    .filter((r) => r.profiles && !r.profiles.deleted_at);
  const artists = await findArtistIds(supabase, rows.map((r) => r.followee_id));
  return rows.map((r) => ({ followId: r.id, userId: r.followee_id, name: r.profiles!.full_name, role: r.profiles!.role, isArtist: artists.has(r.followee_id), city: r.profiles!.city, avatarPath: r.profiles!.profile_photo_path, followedAt: r.created_at }));
}

/** Follow or unfollow — the RPC is idempotent and refuses an unlisted business
 *  or one the caller belongs to. */
export async function setFollow(supabase: SupabaseClient, businessId: string, on: boolean): Promise<FollowState> {
  const { data, error } = await supabase.rpc("set_follow", { p_business_id: businessId, p_on: on });
  if (error) {
    throw new Error(error.message);
  }
  const out = data as { following: boolean; followers: number };
  return { following: out.following, followers: Number(out.followers) };
}

/* ── A CREW IS THE THIRD THING A FOLLOW CAN NAME (19 Sep 2026, the user: "Follow
   with Following toggle for all") — `follows.crew_id`, one door, one count. ── */

/** Whether the signed-in person follows this crew right now. */
export async function isFollowingCrew(supabase: SupabaseClient, crewId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.from("follows").select("id").eq("follower_id", user.id).eq("crew_id", crewId).is("deleted_at", null).limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

/** Follow or unfollow a crew — idempotent; the RPC refuses an organization
 *  account, the crew's leader and its confirmed members. */
export async function setCrewFollow(supabase: SupabaseClient, crewId: string, on: boolean): Promise<FollowState> {
  const { data, error } = await supabase.rpc("set_crew_follow", { p_crew_id: crewId, p_on: on });
  if (error) {
    throw new Error(error.message);
  }
  const out = data as { following: boolean; followers: number };
  return { following: out.following, followers: Number(out.followers) };
}

/* ⚠ `FollowedOrganization` and `findMyFollowedOrganizations` (19 Sep 2026, over
   `my_followed_organizations` — an organization's `profiles` row was private
   (R12), so the sheet could not embed it) went with organizations on 29 Sep.
   ⚠ The three `follows` rows naming one are still on production and are the
   sweep's: `set_person_follow` is the only door to them and nothing calls it
   with an organization any more, so they are inert rather than wrong. */

/** One crew the signed-in person follows (19 Sep 2026). A crew is public, so
 *  the row embeds it; `follower_id = me` is said out loud as everywhere here. */
export interface FollowedCrew {
  followId: string;
  crewId: string;
  name: string;
  city: string;
  style: string;
  photo: string | null;
  followedAt: string;
}

export async function findMyFollowedCrews(supabase: SupabaseClient): Promise<FollowedCrew[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("follows")
    .select("id, crew_id, created_at, crews (name, city, style, photo, deleted_at)")
    .eq("follower_id", user.id)
    .not("crew_id", "is", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    /* the column arrives with 20260919120000 — before it, the sheet simply lists no crews */
    return [];
  }
  return ((data ?? []) as unknown as Array<{ id: string; crew_id: string; created_at: string; crews: { name: string; city: string; style: string; photo: string | null; deleted_at: string | null } | null }>)
    .filter((r) => r.crews && !r.crews.deleted_at)
    .map((r) => ({ followId: r.id, crewId: r.crew_id, name: r.crews!.name, city: r.crews!.city, style: r.crews!.style, photo: r.crews!.photo, followedAt: r.created_at }));
}
