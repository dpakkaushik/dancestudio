import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_COLUMNS, findArtistIds, toProfile } from "@/repositories/profiles";
import type { Profile } from "@/types/profile";
import type { DanceStats } from "@/types/stats";
import { EMPTY_STATS } from "@/types/stats";

/** A person as another signed-in person sees them (prototype S_profiletab with
 *  `publicEntity="trainer"` — a person, PUB 8643). Everything here is either the
 *  person's own row (profiles: signed-in readable, Step 1) or an aggregate this
 *  app already shows beside a name (Step 25's boards). Nothing new is published,
 *  and a stranger sees none of it. */

export interface PersonCrew {
  crewId: string;
  name: string;
  city: string;
  style: string;
  role: "leader" | "member" | "trainee";
  since: string;
  members: number;
  /** the crew's picture in the public bucket, or null for its gradient */
  photo: string | null;
}

export interface PersonTeachesAt {
  tenantId: string;
  tenantName: string;
  tenantType: "studio" | "artist_page";
  city: string | null;
  classes: number;
  kinds: string;
}

export interface PublicPerson {
  profile: Profile;
  /** the plan's word, through artist_ids — the badge over the name is the plan's to give */
  isArtist: boolean;
  stats: DanceStats;
  followers: number;
  following: number;
  crews: PersonCrew[];
  teachesAt: PersonTeachesAt[];
  /** the businesses this person OWNS, when they are listed (a studio's page is public) */
  runs: Array<{ tenantId: string; tenantName: string; tenantType: "studio" | "artist_page"; city: string | null; photoPath: string | null }>;
  /** the listed artist page behind an artist — what an Enquiry on their profile is
   *  sent to (18 Sep 2026: an artist's public face is their profile); null otherwise */
  artistPageId: string | null;
}

interface StatsRow {
  sessions_conducted: number;
  sessions_assisted: number;
  sessions_attended: number;
  hours_conducted: number;
  hours_assisted: number;
  hours_attended: number;
  points: number;
  styles: number;
  studios: number;
  first_session: string | null;
  last_session: string | null;
}

/** Follower and following counts for a person — a number, never a name. */
export async function findPersonFollowerCounts(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, { followers: number; following: number }>> {
  const ids = [...new Set(userIds)];
  const out = new Map<string, { followers: number; following: number }>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.rpc("person_follower_counts", { p_user_ids: ids });
  if (error) {
    return out;
  }
  ((data ?? []) as Array<{ user_id: string; followers: number; following: number }>).forEach((r) =>
    out.set(r.user_id, { followers: Number(r.followers), following: Number(r.following) })
  );
  return out;
}

/** Whether the signed-in person follows this person right now. */
export async function isFollowingPerson(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", user.id)
    .eq("followee_id", userId)
    .is("deleted_at", null)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

export async function setPersonFollow(supabase: SupabaseClient, userId: string, on: boolean): Promise<{ following: boolean; followers: number }> {
  const { data, error } = await supabase.rpc("set_person_follow", { p_user_id: userId, p_on: on });
  if (error) {
    throw new Error(error.message);
  }
  const out = data as { following: boolean; followers: number };
  return { following: out.following, followers: Number(out.followers) };
}

/** The whole page in one read set. Null when there is no such live person — the
 *  honest answer for a bad id and for somebody who has left. */
export async function findPublicPerson(supabase: SupabaseClient, userId: string): Promise<PublicPerson | null> {
  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  let profile: Profile | null = profileError || !profileRow ? null : toProfile(profileRow as Parameters<typeof toProfile>[0]);
  if (!profile) {
    /* A STRANGER (19 Sep 2026): the row itself is signed-in only, and an ARTIST's
       public face comes through `public_artist` — the public columns and no more:
       no age, no account number (`20260919090000`). Nothing for anybody else, so
       a plain user's page is still the sign-in door for a stranger. */
    const { data: pub, error: pubError } = await supabase.rpc("public_artist", { p_user_id: userId });
    const row = (Array.isArray(pub) ? pub[0] : pub) as
      | { id: string; full_name: string; role: string; city: string | null; profile_photo_path: string | null; about: string | null; socials: unknown; styles: string[] | null; verified_at: string | null; phone: string | null; contact_email?: string | null }
      | undefined
      | null;
    if (pubError || !row) {
      return null;
    }
    profile = toProfile({
      id: row.id,
      full_name: row.full_name,
      role: row.role,
      city: row.city,
      profile_photo_path: row.profile_photo_path,
      about: row.about,
      age: null,
      socials: row.socials,
      styles: row.styles ?? [],
      member_no: null,
      verified_at: row.verified_at,
      phone: row.phone,
      contact_email: row.contact_email ?? null,
    } as Parameters<typeof toProfile>[0]);
  }

  const [statsRes, countsMap, crewsRes, teachesRes, runsRes, artistIds, artistPageRes] = await Promise.all([
    supabase.rpc("person_dance_stats", { p_user_id: userId }),
    findPersonFollowerCounts(supabase, [userId]),
    supabase
      .from("crew_members")
      .select("role, created_at, crews (id, name, city, style, photo, deleted_at)")
      .eq("user_id", userId)
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(50),
    supabase.rpc("person_teaches_at", { p_user_id: userId }),
    /* businesses they OWN — public rows only (listed businesses are readable by
       anyone, Step 3), so this names nothing private */
    supabase
      .from("business_members")
      .select("member_role, businesses!inner (id, name, type, city, visibility, profile_photo_path, deleted_at)")
      .eq("user_id", userId)
      .eq("member_role", "owner")
      .is("deleted_at", null)
      .limit(20),
    findArtistIds(supabase, [userId]),
    /* the page behind an artist, readable signed out (`artist_page_of`, 18 Sep 2026) */
    supabase.rpc("artist_page_of", { p_user_id: userId }),
  ]);

  const sRow = (Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data) as StatsRow | undefined;
  const stats: DanceStats = sRow
    ? {
        sessionsConducted: Number(sRow.sessions_conducted ?? 0),
        sessionsAssisted: Number(sRow.sessions_assisted ?? 0),
        sessionsAttended: Number(sRow.sessions_attended ?? 0),
        hoursConducted: Number(sRow.hours_conducted ?? 0),
        hoursAssisted: Number(sRow.hours_assisted ?? 0),
        hoursAttended: Number(sRow.hours_attended ?? 0),
        points: Number(sRow.points ?? 0),
        styles: Number(sRow.styles ?? 0),
        studios: Number(sRow.studios ?? 0),
        artists: 0,
        firstSession: sRow.first_session,
        lastSession: sRow.last_session,
      }
    : EMPTY_STATS;

  const crewRows = ((crewsRes.data ?? []) as unknown as Array<{
    role: "leader" | "member" | "trainee";
    created_at: string;
    crews: { id: string; name: string; city: string; style: string; photo: string | null; deleted_at: string | null } | null;
  }>).filter((r) => r.crews && !r.crews.deleted_at);

  /* the roster size beside each crew, through the aggregate function */
  const counts = new Map<string, number>();
  if (crewRows.length) {
    const { data } = await supabase.rpc("crew_member_counts", { p_crew_ids: crewRows.map((r) => r.crews!.id) });
    ((data ?? []) as Array<{ crew_id: string; members: number }>).forEach((r) => counts.set(r.crew_id, Number(r.members)));
  }

  const crews: PersonCrew[] = crewRows.map((r) => ({
    crewId: r.crews!.id,
    name: r.crews!.name,
    city: r.crews!.city,
    style: r.crews!.style,
    role: r.role,
    since: r.created_at,
    members: counts.get(r.crews!.id) ?? 0,
    photo: r.crews!.photo ?? null,
  }));

  const teachesAt: PersonTeachesAt[] = ((teachesRes.data ?? []) as Array<{
    business_id: string;
    business_name: string;
    business_type: "studio" | "artist_page";
    city: string | null;
    classes: number;
    kinds: string;
  }>).map((r) => ({
    tenantId: r.business_id,
    tenantName: r.business_name,
    tenantType: r.business_type,
    city: r.city,
    classes: Number(r.classes),
    kinds: r.kinds,
  }));

  const runs = ((runsRes.data ?? []) as unknown as Array<{
    businesses: { id: string; name: string; type: "studio" | "artist_page"; city: string | null; visibility: string; profile_photo_path: string | null; deleted_at: string | null } | null;
  }>)
    .filter((r) => r.businesses && !r.businesses.deleted_at && r.businesses.visibility === "listed")
    .map((r) => ({ tenantId: r.businesses!.id, tenantName: r.businesses!.name, tenantType: r.businesses!.type, city: r.businesses!.city, photoPath: r.businesses!.profile_photo_path ?? null }));

  const c = countsMap.get(userId) ?? { followers: 0, following: 0 };
  const artistPageId = artistPageRes.error ? null : ((artistPageRes.data as string | null) ?? null);
  return { profile, isArtist: artistIds.has(userId), stats, followers: c.followers, following: c.following, crews, teachesAt, runs, artistPageId };
}
