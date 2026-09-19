import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, ProfileRole, SocialLink } from "@/types/profile";

interface ProfileRow {
  id: string;
  full_name: string;
  role: ProfileRole;
  city: string | null;
  profile_photo_path?: string | null;
  about?: string | null;
  age?: number | null;
  socials?: unknown;
  styles?: string[] | null;
  member_no?: number | null;
  verified_at?: string | null;
  dob?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  phone_public?: boolean | null;
  lat?: number | string | null;
  lng?: number | string | null;
  location_set_at?: string | null;
}

/** every column a profile is drawn from — one list, so no read can forget one
 *  (the photos slice found a read that had its own list and never got profile_photo_path).
 *  ⚠ `phone_public`, `lat`, `lng`, `location_set_at` arrive with push 2's
 *  migrations (19 Sep 2026): the app cannot run against the schema before them. */
/* ⚠ `dob` arrives with `20260919151000_age_is_a_date_of_birth` — the app cannot run against the schema before it. */
export const PROFILE_COLUMNS = "id, full_name, role, city, profile_photo_path, about, age, dob, socials, styles, member_no, verified_at, phone, contact_email, phone_public, lat, lng, location_set_at";

const toSocials = (raw: unknown): SocialLink[] =>
  Array.isArray(raw)
    ? raw
        .filter((x): x is { platform: unknown; url: unknown } => Boolean(x) && typeof x === "object")
        .map((x) => ({ platform: String(x.platform ?? ""), url: String(x.url ?? "") }))
        .filter((x) => x.platform && x.url)
    : [];

export const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  fullName: row.full_name,
  role: row.role,
  city: row.city,
  avatarPath: row.profile_photo_path ?? null,
  about: row.about ?? null,
  age: row.age == null ? null : Number(row.age),
  dob: row.dob ?? null,
  socials: toSocials(row.socials),
  styles: Array.isArray(row.styles) ? row.styles : [],
  memberNo: row.member_no == null ? null : Number(row.member_no),
  verifiedAt: row.verified_at ?? null,
  phone: row.phone ?? null,
  contactEmail: row.contact_email ?? null,
  phonePublic: Boolean(row.phone_public),
  lat: row.lat == null ? null : Number(row.lat),
  lng: row.lng == null ? null : Number(row.lng),
  locationSetAt: row.location_set_at ?? null,
});

export async function findProfileById(
  supabase: SupabaseClient,
  id: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`profiles.findById failed: ${error.message}`);
  }
  return data ? toProfile(data as ProfileRow) : null;
}

export async function createProfile(
  supabase: SupabaseClient,
  input: { id: string; fullName: string; role: ProfileRole; city?: string | null }
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: input.id,
      full_name: input.fullName,
      role: input.role,
      city: input.city ?? null,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(`profiles.create failed: ${error.message}`);
  }
  return toProfile(data as ProfileRow);
}

export interface MyProfileInput {
  fullName: string;
  city: string | null;
  age: number | null;
  about: string | null;
  socials: SocialLink[];
  styles: string[];
  /** the number the person chooses to publish — Call on their page (N8) */
  phone: string | null;
  /** THE CONTACT EMAIL (19 Sep 2026) — the Mail button's address. Three
   *  meanings, kept apart on purpose: `undefined` leaves the column as it is
   *  (the styles and links sheets never touch it), `null` CLEARS it, a string
   *  sets it. The RPC reads the same three: null = unchanged, '' = cleared. */
  contactEmail?: string | null;
  /** THE CALL SWITCH (push 2): `undefined` leaves it as it is; a boolean sets it */
  phonePublic?: boolean;
  /** THE DATE OF BIRTH (19 Sep 2026), ISO: `undefined` or null leaves it as it is;
   *  a date sets it and the database works the age out from it */
  dob?: string | null;
}

/** The one door for what a person says about themselves (S_profiletab's Edit
 *  profile, the links sheet and the styles sheet all land here). The RPC is
 *  scoped to auth.uid() and validates the shape server-side; a mis-shaped link
 *  or an impossible age is refused with a sentence. */
export async function updateMyProfile(supabase: SupabaseClient, input: MyProfileInput): Promise<void> {
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: input.fullName,
    p_city: input.city,
    p_age: input.age,
    p_about: input.about,
    p_socials: input.socials,
    p_styles: input.styles,
    p_phone: input.phone,
    /* `p_contact_email` is LAST with a default on the RPC (`20260919122000`):
       null there means "leave it", an empty string clears it */
    p_contact_email: input.contactEmail === undefined ? null : (input.contactEmail ?? ""),
    /* `p_phone_public` is LAST with a default too (push 2): null = unchanged */
    p_phone_public: input.phonePublic === undefined ? null : input.phonePublic,
    /* `p_dob` is LAST with a default too (`20260919151000`): null = unchanged */
    p_dob: input.dob ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** AN ORGANIZATION'S PIN (19 Sep 2026, push 2): `set_my_place` refuses a person
 *  and a point outside India; both null clears it. The page's Location button
 *  opens the pin once it is set. */
export async function setMyPlace(supabase: SupabaseClient, input: { lat: number | null; lng: number | null }): Promise<void> {
  const { error } = await supabase.rpc("set_my_place", { p_lat: input.lat, p_lng: input.lng });
  if (error) {
    throw new Error(error.message);
  }
}

/** WHO, AMONG THESE PEOPLE, IS AN ARTIST RIGHT NOW. The plan is a row on
 *  artist_plans_legacy, own-rows under RLS, so the badge beside somebody ELSE's name
 *  goes through the aggregate-only `artist_ids` (ids in, the live subset out).
 *  One call per list, never one per row. Empty in, empty out, no round trip. */
export async function findArtistIds(supabase: SupabaseClient, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const { data, error } = await supabase.rpc("artist_ids", { p_ids: unique });
  if (error) {
    throw new Error(`profiles.artistIds failed: ${error.message}`);
  }
  return new Set(((data ?? []) as Array<string | { artist_ids: string }>).map((x) => (typeof x === "string" ? x : x.artist_ids)));
}

/** HOW MANY A PEOPLE SEARCH OFFERS (19 Sep 2026, the user: "a drop down with
 *  max 5 options with their profile pics") — was eight. */
export const PEOPLE_SEARCH_MAX = 5;
/** HOW MANY SUGGESTIONS BEFORE A TERM IS TYPED — "max 3 suggestions according to history" */
export const PEOPLE_RECENT_MAX = 3;

/** SEARCH DANCEOS (prototype 16413-16447): live profiles whose NAME contains the
 *  term or whose PUBLISHED NUMBER contains its digits (19 Sep 2026, the user:
 *  "option to search name, mobile no."), the caller left out, at most five.
 *  Signed-in users read live profiles (Step 1's policy), so this is a plain
 *  read — the pickers that add a crew member, an assistant or a duet partner
 *  all go through it. ⚠ The number searched is `profiles.phone` — the one a
 *  person chose to publish on their page (N8, 30 Aug 2026), read by every
 *  signed-in caller already; a person with no published number is found by
 *  name alone. */
export async function searchProfiles(
  supabase: SupabaseClient,
  term: string,
  excludeIds: string[] = []
): Promise<Array<Profile & { isArtist: boolean }>> {
  const q = term.trim();
  if (q.length < 2) {
    return [];
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const skip = new Set([...(user ? [user.id] : []), ...excludeIds]);
  /* PostgREST's `or` grammar separates clauses with a comma and groups with
     parentheses, so none of the three may ride inside a value; `%` and `_` are
     LIKE's own wildcards and are stripped as before */
  const name = q.replace(/[%_,().]/g, "");
  const digits = q.replace(/\D/g, "");
  const clauses: string[] = [];
  if (name.length >= 2) clauses.push(`full_name.ilike.%${name}%`);
  /* three digits is a number being typed, not a name with a digit in it */
  if (digits.length >= 3) clauses.push(`phone.ilike.%${digits}%`);
  if (clauses.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .or(clauses.join(","))
    .is("deleted_at", null)
    /* an organization is not a person to pick (8 Sep 2026): a crew member, a duet partner, a trainer are people */
    .neq("role", "org")
    .order("full_name", { ascending: true })
    .limit(PEOPLE_SEARCH_MAX + skip.size);

  if (error) {
    throw new Error(`profiles.search failed: ${error.message}`);
  }
  const rows = ((data ?? []) as ProfileRow[]).filter((r) => !skip.has(r.id)).slice(0, PEOPLE_SEARCH_MAX);
  const artists = await findArtistIds(supabase, rows.map((r) => r.id));
  return rows.map((r) => ({ ...toProfile(r), isArtist: artists.has(r.id) }));
}

/** RECENTLY ASKED (19 Sep 2026, the user: "max 3 suggestions according to
 *  history"): the last three people THIS account put on a class or a crew,
 *  newest first, each once — offered by the picker before a term is typed. The
 *  history is the rows the asks already left (`class_people`, `crew_members`,
 *  `created_by = me`), read under their own policies: a row the caller may not
 *  read is simply not a suggestion. The caller and the people already on the
 *  roster are left out; an organization is never a person to suggest. */
export async function findRecentlyAskedPeople(
  supabase: SupabaseClient,
  excludeIds: string[] = []
): Promise<Array<Profile & { isArtist: boolean }>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const skip = new Set([user.id, ...excludeIds]);
  const [asks, crewAsks] = await Promise.all([
    supabase.from("class_people").select("user_id, created_at").eq("created_by", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("crew_members").select("user_id, created_at").eq("created_by", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  if (asks.error) {
    throw new Error(`profiles.recent failed: ${asks.error.message}`);
  }
  if (crewAsks.error) {
    throw new Error(`profiles.recent failed: ${crewAsks.error.message}`);
  }
  type AskRow = { user_id: string; created_at: string };
  const ids: string[] = [];
  for (const r of [...((asks.data ?? []) as AskRow[]), ...((crewAsks.data ?? []) as AskRow[])].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    if (skip.has(r.user_id) || ids.includes(r.user_id)) continue;
    ids.push(r.user_id);
    if (ids.length === PEOPLE_RECENT_MAX) break;
  }
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", ids)
    .is("deleted_at", null)
    .neq("role", "org");
  if (error) {
    throw new Error(`profiles.recent failed: ${error.message}`);
  }
  const byId = new Map(((data ?? []) as ProfileRow[]).map((r) => [r.id, r]));
  const rows = ids.map((id) => byId.get(id)).filter((r): r is ProfileRow => Boolean(r));
  const artists = await findArtistIds(supabase, rows.map((r) => r.id));
  return rows.map((r) => ({ ...toProfile(r), isArtist: artists.has(r.id) }));
}
