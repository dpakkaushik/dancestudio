import type { SupabaseClient } from "@supabase/supabase-js";
import type { Crew, CrewMember, CrewRole, CrewSummary, MyCrewAsk } from "@/types/crew";

/** Step 22 reads and writes. A crew is public (anyone reads the record and the
 *  CONFIRMED roster); the asked rows are the leader's and the asked person's to
 *  see. Every write is an RPC. Every "mine" query says `user_id = auth.uid()`
 *  or `leader_id = me` out loud — RLS is a ceiling, not a scope. */

const MAX_LIST = 200;

interface CrewRow {
  id: string;
  name: string;
  city: string;
  style: string;
  styles?: string[] | null;
  socials?: unknown;
  leader_id: string;
  photo: string | null;
  contact_email?: string | null;
  created_at: string;
  member_no?: number | null;
  /** CALL IS A TOGGLE (push 2): the number's own row, or null for a reader the
   *  policy keeps it from. PostgREST hands a one-to-one embed back as an OBJECT;
   *  the client's own inference calls it an array — both shapes are read */
  crew_contacts?: CrewContact | CrewContact[] | null;
}
interface CrewContact {
  phone: string | null;
  phone_public: boolean;
}
const contactOf = (c: CrewRow["crew_contacts"]): CrewContact | null => (Array.isArray(c) ? (c[0] ?? null) : (c ?? null));
interface MemberRow {
  id: string;
  crew_id: string;
  user_id: string;
  role: CrewRole;
  status: "asked" | "confirmed" | "rejected";
  sort: number;
  created_at: string;
  profiles: { full_name: string; city: string | null; profile_photo_path?: string | null } | null;
}
interface MyAskRow extends MemberRow {
  crews: { name: string; city: string; leader_id: string; deleted_at: string | null; profiles: { full_name: string } | null } | null;
}
/* `EntryRow` and `PartnerRow` went with the battle record and the duet asks
   (29 Sep 2026) — see the note where those three reads used to be. */

/* `crew_contacts` is one-to-one (its crew_id is the primary key), so the embed is an
   object or null — null for a reader its policy keeps the number from, which is how
   a switched-off number never reaches a page (push 2, 19 Sep 2026) */
/* `styles` and `socials` since 26 Sep 2026 (`20260926120000`) — a list of styles
   and the links every other profile carries */
const CREW_COLUMNS = "id, name, city, style, styles, socials, leader_id, photo, contact_email, created_at, member_no, crew_contacts (phone, phone_public)";
/** the links column is jsonb — anything that is not a list of {platform, url} is read as none */
const socialsOf = (v: unknown): Array<{ platform: string; url: string }> =>
  Array.isArray(v) ? v.filter((x): x is { platform: string; url: string } => Boolean(x) && typeof x === "object" && typeof (x as { platform?: unknown }).platform === "string" && typeof (x as { url?: unknown }).url === "string") : [];
const MEMBER_COLUMNS = "id, crew_id, user_id, role, status, sort, created_at, profiles (full_name, city, profile_photo_path)";

const toCrew = (r: CrewRow): Crew => ({
  id: r.id,
  name: r.name,
  city: r.city,
  style: r.style,
  styles: Array.isArray(r.styles) && r.styles.length ? r.styles : r.style ? [r.style] : [],
  socials: socialsOf(r.socials),
  leaderId: r.leader_id,
  photo: r.photo,
  contactEmail: r.contact_email ?? null,
  phone: contactOf(r.crew_contacts)?.phone ?? null,
  phonePublic: Boolean(contactOf(r.crew_contacts)?.phone_public),
  createdAt: r.created_at,
  /* the crew's own number, beside its type (20 Sep 2026) */
  memberNo: r.member_no == null ? null : Number(r.member_no),
});
const toMember = (r: MemberRow): CrewMember => ({
  id: r.id,
  crewId: r.crew_id,
  userId: r.user_id,
  role: r.role,
  status: r.status,
  sort: r.sort,
  createdAt: r.created_at,
  name: r.profiles?.full_name ?? "Someone",
  city: r.profiles?.city ?? null,
  avatarPath: r.profiles?.profile_photo_path ?? null,
});

const currentUserId = async (supabase: SupabaseClient): Promise<string | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
};

/** Confirmed roster sizes — a number per crew, through the aggregate function. */
export async function findCrewMemberCounts(supabase: SupabaseClient, crewIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(crewIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("crew_member_counts", { p_crew_ids: ids });
  if (error) {
    throw new Error(`crews.counts failed: ${error.message}`);
  }
  const map = new Map<string, number>();
  ((data ?? []) as Array<{ crew_id: string; members: number }>).forEach((r) => map.set(r.crew_id, Number(r.members)));
  return map;
}

const withCounts = async (supabase: SupabaseClient, rows: CrewRow[]): Promise<CrewSummary[]> => {
  const counts = await findCrewMemberCounts(
    supabase,
    rows.map((r) => r.id)
  );
  return rows.map((r) => ({ ...toCrew(r), members: counts.get(r.id) ?? 0 }));
};

export async function findCrewById(supabase: SupabaseClient, crewId: string): Promise<Crew | null> {
  const { data, error } = await supabase.from("crews").select(CREW_COLUMNS).eq("id", crewId).is("deleted_at", null).maybeSingle();
  if (error) {
    throw new Error(`crews.findById failed: ${error.message}`);
  }
  return data ? toCrew(data as unknown as CrewRow) : null;
}

/** The crews the signed-in person LEADS — the hub's first list, the event
 *  page's crew picker. */
export async function findMyLedCrews(supabase: SupabaseClient): Promise<CrewSummary[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("crews")
    .select(CREW_COLUMNS)
    .eq("leader_id", me)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`crews.findMyLed failed: ${error.message}`);
  }
  return withCounts(supabase, (data ?? []) as unknown as CrewRow[]);
}

/** The crews the signed-in person is merely IN (confirmed, not leading) —
 *  the hub's second list. */
export async function findMyMemberCrews(supabase: SupabaseClient): Promise<Array<CrewSummary & { since: string; foundedByMe: boolean }>> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("crew_members")
    /* ⚠ `created_by` IS ASKED FOR HERE AND NOT ADDED TO `CREW_COLUMNS`
       (30 Sep 2026). That constant feeds the PUBLIC crew reads too, and a
       founder's user id is not something a crew's page needs to hand out —
       narrower is the honest default, even though RLS already admits the whole
       row to anybody who can read the crew, so this widens no policy. It is
       read on this ONE screen, for the one control it decides. */
    .select(`created_at, role, crews (${CREW_COLUMNS}, created_by, deleted_at)`)
    .eq("user_id", me)
    .eq("status", "confirmed")
    .neq("role", "leader")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`crews.findMyMember failed: ${error.message}`);
  }
  const rows = ((data ?? []) as unknown as Array<{ created_at: string; crews: (CrewRow & { created_by: string | null; deleted_at: string | null }) | null }>).filter(
    (r) => r.crews && !r.crews.deleted_at
  );
  const crews = await withCounts(
    supabase,
    rows.map((r) => r.crews!)
  );
  /* ⚠ `foundedByMe` rather than the id itself: the screen needs to know whether
     to draw one control, not who the founder is, and handing a user id to a
     component that has no other use for it invites a second use later. */
  return crews.map((c, i) => ({ ...c, since: rows[i].created_at, foundedByMe: rows[i].crews!.created_by === me }));
}

/** ⚠ THE FOUNDER TAKES THE CREW BACK (30 Sep 2026) — the other end of "Make
 *  leader", which was a one-way door. Every guard is `reclaim_crew`'s own. */
export async function reclaimCrew(supabase: SupabaseClient, crewId: string): Promise<void> {
  const { error } = await supabase.rpc("reclaim_crew", { p_crew_id: crewId });
  if (error) {
    throw new Error(error.message);
  }
}

/** Discover's Crews tab: live crews in a city, newest first. */
/** a city's crews — or, given no city (Discover's All cities, 2 Oct 2026), every crew */
export async function findCrewsByCity(supabase: SupabaseClient, city: string | null): Promise<CrewSummary[]> {
  let q = supabase.from("crews").select(CREW_COLUMNS);
  if (city) q = q.eq("city", city);
  const { data, error } = await q
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`crews.findByCity failed: ${error.message}`);
  }
  return withCounts(supabase, (data ?? []) as unknown as CrewRow[]);
}

/** The roster as the viewer may see it: a stranger gets the confirmed rows, the
 *  leader every live row (asked ones print "Waiting on them to confirm"). */
export async function findCrewMembers(supabase: SupabaseClient, crewId: string): Promise<CrewMember[]> {
  const { data, error } = await supabase
    .from("crew_members")
    .select(MEMBER_COLUMNS)
    .eq("crew_id", crewId)
    .in("status", ["asked", "confirmed"])
    .is("deleted_at", null)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`crews.findMembers failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as MemberRow[]).map(toMember);
}

/** The asks waiting for the signed-in person — says `user_id = me` out loud. */
export async function findMyPendingCrewAsks(supabase: SupabaseClient, statuses: Array<"asked" | "confirmed" | "rejected"> = ["asked"]): Promise<MyCrewAsk[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("crew_members")
    .select(`${MEMBER_COLUMNS}, crews (name, city, leader_id, deleted_at, profiles!crews_leader_id_fkey (full_name))`)
    .eq("user_id", me)
    /* answered asks too, when the Inbox wants them (19 Sep 2026) */
    .in("status", statuses)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`crews.findMyAsks failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as MyAskRow[])
    .filter((r) => r.crews && !r.crews.deleted_at)
    .map((r) => ({
      ...toMember(r),
      crewName: r.crews!.name,
      crewCity: r.crews!.city,
      leaderName: r.crews!.profiles?.full_name ?? "The leader",
    }));
}

/** The asks the crews you lead are still waiting on (the desk's SENT side). */
export async function findAskedForMyCrews(supabase: SupabaseClient, statuses: Array<"asked" | "confirmed" | "rejected"> = ["asked"]): Promise<Array<CrewMember & { crewName: string }>> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("crew_members")
    .select(`${MEMBER_COLUMNS}, crews!inner (name, leader_id, deleted_at)`)
    .eq("crews.leader_id", me)
    .in("status", statuses)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`crews.findAskedForMine failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as Array<MemberRow & { crews: { name: string; deleted_at: string | null } | null }>)
    .filter((r) => r.crews && !r.crews.deleted_at)
    .map((r) => ({ ...toMember(r), crewName: r.crews!.name }));
}

/** ⚠⚠ THE BATTLE RECORD AND THE DUET ASKS WENT WITH EVENTS (29 Sep 2026).
 *
 *  `findCrewEntries` read `event_bookings.crew_id` — the events this crew had
 *  entered, drawn on its own desk and on its public page — and
 *  `findMyPendingPartnerAsks` / `findMyUnansweredPartners` read
 *  `event_bookings.partner_id`, the duet half: somebody entered an event with
 *  you and you were asked to confirm, both ends of it on the Requests desk.
 *
 *  ⚠ They were the last three reads in this file that touched a table outside
 *  the crew's own, which is why a crew now reads only `crews` and
 *  `crew_members`. What a crew LOSES is a record of what it competed in; what it
 *  keeps is everything it is — a roster answered by consent, a leader, its
 *  practices, its public page and its row on the board. */

/* ── writes — the RPCs hold every rule ── */

export async function createCrew(
  supabase: SupabaseClient,
  input: { name: string; city: string; style: string; memberIds: string[] }
): Promise<Crew> {
  const { data, error } = await supabase.rpc("create_crew", {
    p_name: input.name,
    p_city: input.city,
    p_style: input.style,
    p_member_ids: input.memberIds,
  });
  if (error) {
    throw new Error(error.message);
  }
  return toCrew(data as CrewRow);
}

/** THE LEADER'S EDIT (19 Sep 2026 — the crew's Edit sheet is the first caller).
 *  `contactEmail` undefined leaves the address alone, null clears it, a string
 *  sets it; the RPC's `p_contact_email` is last with a default, so an older
 *  call without it resolves as before. */
export async function updateCrew(
  supabase: SupabaseClient,
  input: { crewId: string; name: string; city: string; style: string; contactEmail?: string | null; phone?: string | null; phonePublic?: boolean }
): Promise<void> {
  const { error } = await supabase.rpc("update_crew", {
    p_crew_id: input.crewId,
    p_name: input.name,
    p_city: input.city,
    p_style: input.style,
    p_contact_email: input.contactEmail === undefined ? null : (input.contactEmail ?? ""),
    /* the number and the Call switch (push 2), last with defaults: null = unchanged, '' clears the number */
    p_phone: input.phone === undefined ? null : (input.phone ?? ""),
    p_phone_public: input.phonePublic === undefined ? null : input.phonePublic,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** WHAT A CREW DANCES, AS A LIST (26 Sep 2026) — the leader's; the RPC keeps
 *  `style` equal to the first and refuses an empty list */
export async function setCrewStyles(supabase: SupabaseClient, crewId: string, styles: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_crew_styles", { p_crew_id: crewId, p_styles: styles });
  if (error) {
    throw new Error(error.message);
  }
}

/** A CREW'S LINKS (26 Sep 2026) — the leader's; the RPC refuses anything that is not an http(s) address */
export async function setCrewSocials(supabase: SupabaseClient, crewId: string, socials: Array<{ platform: string; url: string }>): Promise<void> {
  const { error } = await supabase.rpc("set_crew_socials", { p_crew_id: crewId, p_socials: socials });
  if (error) {
    throw new Error(error.message);
  }
}

export async function askCrewMember(supabase: SupabaseClient, crewId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("ask_crew_member", { p_crew_id: crewId, p_user_id: userId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function respondToCrewAsk(supabase: SupabaseClient, memberId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_to_crew_ask", { p_member_id: memberId, p_accept: accept });
  if (error) {
    throw new Error(error.message);
  }
}

export async function withdrawCrewAsk(supabase: SupabaseClient, memberId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_crew_ask", { p_member_id: memberId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function removeCrewMember(supabase: SupabaseClient, memberId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_crew_member", { p_member_id: memberId });
  if (error) {
    throw new Error(error.message);
  }
}

export async function setCrewMemberRole(supabase: SupabaseClient, memberId: string, role: CrewRole): Promise<void> {
  const { error } = await supabase.rpc("set_crew_member_role", { p_member_id: memberId, p_role: role });
  if (error) {
    throw new Error(error.message);
  }
}

export async function reorderCrewMembers(supabase: SupabaseClient, crewId: string, memberIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("reorder_crew_members", { p_crew_id: crewId, p_member_ids: memberIds });
  if (error) {
    throw new Error(error.message);
  }
}

/* ⚠ `respondToPartnerAsk` went with events (29 Sep 2026) — it answered a duet
   ask on `event_bookings`. Its RPC is the migration's to drop. */
