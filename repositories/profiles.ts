import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, ProfileRole, SocialLink } from "@/types/profile";

interface ProfileRow {
  id: string;
  full_name: string;
  role: ProfileRole;
  city: string | null;
  profile_photo_path?: string | null;
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
/* ⚠ `about` LEFT on 20 Sep 2026 (`20260920160000_the_bio_is_gone`): the column is
   dropped, so selecting it here would fail every profile read. `events.about` is
   a different column and is untouched. */
/* ⚠⚠ NO `phone` (6 Oct 2026, decision 4, `20261006092000`): the column is not
   selectable by any client role any more, so naming it here would refuse every
   profile read. A number is read through `profile_phones` (`findPhones`), which
   hands back only the ones the caller may see — their own, anybody's with Call
   switched on, and a business runner's view of its own students. */
export const PROFILE_COLUMNS = "id, full_name, role, city, profile_photo_path, age, dob, socials, styles, member_no, verified_at, contact_email, phone_public, lat, lng, location_set_at";

/** THE NUMBERS THE CALLER MAY READ (6 Oct 2026, decision 4) — ids in, a map of
 *  id → number out, holding only what `profile_phones` admits. Empty in, empty
 *  out, no round trip; a refusal reads as "no numbers", never as an error, so a
 *  page never fails over a phone.
 *
 *  ⚠ `strict` is for the one caller that WRITES a number back — the profile
 *  save, which takes the whole record and would otherwise send null over a number
 *  it merely failed to read. There a failed read throws rather than wiping it.
 *  ⚠ Before `20261006092000` is applied the function does not exist (PostgREST
 *  answers PGRST202), and the column is still selectable, so that one case reads
 *  the column directly — the app goes live a few minutes before the migration. */
export async function findPhones(supabase: SupabaseClient, ids: string[], opts: { strict?: boolean } = {}): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 400);
  if (unique.length === 0) return new Map();
  const toMap = (rows: Array<{ id: string; phone: string | null }>) =>
    new Map(rows.filter((r) => r.phone).map((r) => [r.id, r.phone as string]));
  const { data, error } = await supabase.rpc("profile_phones", { p_ids: unique });
  if (!error) return toMap((data ?? []) as Array<{ id: string; phone: string }>);
  if (error.code === "PGRST202") {
    const old = await supabase.from("profiles").select("id, phone").in("id", unique);
    if (!old.error) return toMap((old.data ?? []) as Array<{ id: string; phone: string | null }>);
  }
  if (opts.strict) throw new Error("Could not read your number just now — try again");
  return new Map();
}

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
  id: string,
  /** read the number too — for the screens that SHOW or EDIT it (Home, the
   *  enquiry that sends it). In parallel with the row, so it costs no wall clock;
   *  left off everywhere else so the chrome makes one read, as before. */
  opts: { withPhone?: boolean } = {}
): Promise<Profile | null> {
  const [{ data, error }, phones] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle(),
    opts.withPhone ? findPhones(supabase, [id]) : Promise.resolve(new Map<string, string>()),
  ]);

  if (error) {
    throw new Error(`profiles.findById failed: ${error.message}`);
  }
  return data ? toProfile({ ...(data as ProfileRow), phone: phones.get(id) ?? null }) : null;
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

/* ⚠ `setMyPlace` LEFT on 26 Sep 2026 with `set_my_place` (`20260926120000`): an
   organization's pin is its business row's now — `setBusinessLocation`. */

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
 *  term or who hold the WHOLE mobile number typed (19 Sep 2026, the user:
 *  "option to search name, mobile no."), the caller left out, at most five.
 *  Signed-in users read live profiles (Step 1's policy), so the name half is a
 *  plain read — the pickers that add a crew member, an assistant or a duet
 *  partner all go through it. ⚠⚠ THE NUMBER HALF IS A DEFINER CALL since 6 Oct
 *  2026 (decision 4): `profiles.phone` is not selectable by a client any more,
 *  and the old `phone ilike %digits%` let anybody fish a number out three digits
 *  at a time. `find_people_by_phone` matches a whole number (its last ten
 *  digits) and hands back ids, never the number. */
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
  /* a term that is mostly digits is a number being typed, not a name */
  if (name.length >= 2 && digits.length < 3) clauses.push(`full_name.ilike.%${name}%`);
  if (digits.length >= 10) {
    const { data: ids } = await supabase.rpc("find_people_by_phone", { p_number: digits });
    const found = ((ids ?? []) as Array<string | { find_people_by_phone: string }>)
      .map((x) => (typeof x === "string" ? x : x.find_people_by_phone))
      .filter((x) => /^[0-9a-f-]{36}$/.test(x));
    if (found.length > 0) clauses.push(`id.in.(${found.join(",")})`);
  }
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

/** a person the assistant picker may offer, with WHERE they come from — "Team",
 *  or the crew they share with the person asking */
export type PoolPerson = Profile & { isArtist: boolean; from: string };

/** WHO MAY BE ASKED TO ASSIST ON A CLASS (4 Oct 2026, the user: "when adding a
 *  class assistant to a class should be able to add only people from your own
 *  team members or crew members. no one else").
 *
 *  Three sources, and nothing from the rest of DanceOS:
 *   · the TEAM of the business the class belongs to — a studio's own people, or
 *     an artist page's;
 *   · the team of the artist page the person asking OWNS, when that is a
 *     different business — so a teacher on a studio's class can bring their own
 *     assistant;
 *   · the confirmed members of every crew the person asking is confirmed in.
 *  The person asking is left out. Each read is under its own policy: a team the
 *  caller is not on reads nothing, and a crew's confirmed roster is public. The
 *  picker offers only this list, `askClassPersonAction` refuses anyone outside
 *  it, and since 20261004180000 `ask_class_person` refuses anybody outside the
 *  same three sources itself, in the same words — so a direct API call is
 *  refused too. ⚠ The database reads WITHOUT the caller's RLS, so it may admit a
 *  little more than this list ever offers (never less); the asker themselves is
 *  one such case, which this list leaves out and the database allows. */
export async function findAssistantPool(supabase: SupabaseClient, businessId: string): Promise<PoolPerson[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const me = user.id;
  const [team, myPages, myCrews] = await Promise.all([
    supabase.from("business_members").select("user_id").eq("business_id", businessId).is("deleted_at", null).limit(200),
    supabase.from("business_members").select("business_id, businesses (type, deleted_at)").eq("user_id", me).eq("member_role", "owner").is("deleted_at", null).limit(50),
    supabase.from("crew_members").select("crew_id").eq("user_id", me).eq("status", "confirmed").is("deleted_at", null).limit(50),
  ]);
  for (const r of [team, myPages, myCrews]) {
    if (r.error) throw new Error(`profiles.assistantPool failed: ${r.error.message}`);
  }
  type PageRow = { business_id: string; businesses: { type: string; deleted_at: string | null } | null };
  const pageIds = ((myPages.data ?? []) as unknown as PageRow[])
    .filter((p) => p.businesses?.type === "artist_page" && !p.businesses.deleted_at && p.business_id !== businessId)
    .map((p) => p.business_id);
  const crewIds = ((myCrews.data ?? []) as Array<{ crew_id: string }>).map((c) => c.crew_id);
  const [pageTeam, crewRows] = await Promise.all([
    pageIds.length
      ? supabase.from("business_members").select("user_id").in("business_id", pageIds).is("deleted_at", null).limit(200)
      : Promise.resolve({ data: [] as Array<{ user_id: string }>, error: null }),
    crewIds.length
      ? supabase.from("crew_members").select("user_id, crews (name, deleted_at)").in("crew_id", crewIds).eq("status", "confirmed").is("deleted_at", null).limit(400)
      : Promise.resolve({ data: [] as Array<{ user_id: string; crews: { name: string; deleted_at: string | null } | null }>, error: null }),
  ]);
  if (pageTeam.error) throw new Error(`profiles.assistantPool failed: ${pageTeam.error.message}`);
  if (crewRows.error) throw new Error(`profiles.assistantPool failed: ${crewRows.error.message}`);

  /* the first source a person is found through names them — the class's own team first */
  const from = new Map<string, string>();
  const note = (id: string, word: string) => {
    if (id !== me && !from.has(id)) from.set(id, word);
  };
  for (const r of (team.data ?? []) as Array<{ user_id: string }>) note(r.user_id, "Team");
  for (const r of (pageTeam.data ?? []) as Array<{ user_id: string }>) note(r.user_id, "Your team");
  for (const r of (crewRows.data ?? []) as unknown as Array<{ user_id: string; crews: { name: string; deleted_at: string | null } | null }>) {
    if (r.crews && !r.crews.deleted_at) note(r.user_id, `Crew · ${r.crews.name}`);
  }
  const ids = [...from.keys()];
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", ids).is("deleted_at", null).neq("role", "org").order("full_name", { ascending: true });
  if (error) throw new Error(`profiles.assistantPool failed: ${error.message}`);
  const rows = (data ?? []) as ProfileRow[];
  const artists = await findArtistIds(supabase, rows.map((r) => r.id));
  return rows.map((r) => ({ ...toProfile(r), isArtist: artists.has(r.id), from: from.get(r.id) ?? "Team" }));
}
