import type { SupabaseClient } from "@supabase/supabase-js";
import type { Crew, CrewEntry, CrewMember, CrewRole, CrewSummary, MyCrewAsk, PartnerAsk } from "@/types/crew";

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
  leader_id: string;
  photo: string | null;
  created_at: string;
}
interface MemberRow {
  id: string;
  crew_id: string;
  user_id: string;
  role: CrewRole;
  status: "asked" | "confirmed" | "rejected";
  sort: number;
  created_at: string;
  profiles: { full_name: string; city: string | null } | null;
}
interface MyAskRow extends MemberRow {
  crews: { name: string; city: string; leader_id: string; deleted_at: string | null; profiles: { full_name: string } | null } | null;
}
interface EntryRow {
  id: string;
  event_id: string;
  created_at: string;
  events: {
    title: string;
    cat: "showcase" | "battle" | "tournament";
    share_slug: string;
    start_date: string;
    end_date: string;
    city: string;
    status: "draft" | "published" | "completed";
  } | null;
}
interface PartnerRow {
  id: string;
  user_id: string | null;
  partner_id: string | null;
  partner_name: string | null;
  partner_status: "asked" | "confirmed" | "rejected" | null;
  created_at: string;
  profiles: { full_name: string } | null;
  events: { title: string; share_slug: string; start_date: string } | null;
}

const CREW_COLUMNS = "id, name, city, style, leader_id, photo, created_at";
const MEMBER_COLUMNS = "id, crew_id, user_id, role, status, sort, created_at, profiles (full_name, city)";

const toCrew = (r: CrewRow): Crew => ({
  id: r.id,
  name: r.name,
  city: r.city,
  style: r.style,
  leaderId: r.leader_id,
  photo: r.photo,
  createdAt: r.created_at,
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
  return data ? toCrew(data as CrewRow) : null;
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
  return withCounts(supabase, (data ?? []) as CrewRow[]);
}

/** The crews the signed-in person is merely IN (confirmed, not leading) —
 *  the hub's second list. */
export async function findMyMemberCrews(supabase: SupabaseClient): Promise<Array<CrewSummary & { since: string }>> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("crew_members")
    .select(`created_at, role, crews (${CREW_COLUMNS}, deleted_at)`)
    .eq("user_id", me)
    .eq("status", "confirmed")
    .neq("role", "leader")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`crews.findMyMember failed: ${error.message}`);
  }
  const rows = ((data ?? []) as unknown as Array<{ created_at: string; crews: (CrewRow & { deleted_at: string | null }) | null }>).filter(
    (r) => r.crews && !r.crews.deleted_at
  );
  const crews = await withCounts(
    supabase,
    rows.map((r) => r.crews!)
  );
  return crews.map((c, i) => ({ ...c, since: rows[i].created_at }));
}

/** Discover's Crews tab: live crews in a city, newest first. */
export async function findCrewsByCity(supabase: SupabaseClient, city: string): Promise<CrewSummary[]> {
  const { data, error } = await supabase
    .from("crews")
    .select(CREW_COLUMNS)
    .eq("city", city)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`crews.findByCity failed: ${error.message}`);
  }
  return withCounts(supabase, (data ?? []) as CrewRow[]);
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
export async function findMyPendingCrewAsks(supabase: SupabaseClient): Promise<MyCrewAsk[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("crew_members")
    .select(`${MEMBER_COLUMNS}, crews (name, city, leader_id, deleted_at, profiles!crews_leader_id_fkey (full_name))`)
    .eq("user_id", me)
    .eq("status", "asked")
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
export async function findAskedForMyCrews(supabase: SupabaseClient): Promise<Array<CrewMember & { crewName: string }>> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("crew_members")
    .select(`${MEMBER_COLUMNS}, crews!inner (name, leader_id, deleted_at)`)
    .eq("crews.leader_id", me)
    .eq("status", "asked")
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

/** The battle record: the events this crew entered, soonest first. Public rows
 *  (a crew's entries into published events are the crew's record). */
export async function findCrewEntries(supabase: SupabaseClient, crewId: string): Promise<CrewEntry[]> {
  const { data, error } = await supabase
    .from("event_bookings")
    .select("id, event_id, created_at, events (title, cat, share_slug, start_date, end_date, city, status)")
    .eq("crew_id", crewId)
    .eq("status", "booked")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_LIST);
  if (error) {
    throw new Error(`crews.findEntries failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as EntryRow[])
    .filter((r) => r.events)
    .map((r) => ({
      bookingId: r.id,
      eventId: r.event_id,
      eventTitle: r.events!.title,
      eventCat: r.events!.cat,
      eventShareSlug: r.events!.share_slug,
      startDate: r.events!.start_date,
      endDate: r.events!.end_date,
      city: r.events!.city,
      eventStatus: r.events!.status,
      enteredAt: r.created_at,
    }))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

const PARTNER_COLUMNS = "id, user_id, partner_id, partner_name, partner_status, created_at, profiles!event_bookings_user_id_fkey (full_name), events (title, share_slug, start_date)";
const toPartnerAsk = (r: PartnerRow): PartnerAsk => ({
  bookingId: r.id,
  status: r.partner_status ?? "asked",
  entrantName: r.profiles?.full_name ?? "Someone",
  entrantId: r.user_id,
  partnerName: r.partner_name ?? "your partner",
  eventTitle: r.events?.title ?? "an event",
  eventShareSlug: r.events?.share_slug ?? "",
  startDate: r.events?.start_date ?? "",
  createdAt: r.created_at,
});

/** Duet entries naming the signed-in person as the partner, still unanswered. */
export async function findMyPendingPartnerAsks(supabase: SupabaseClient): Promise<PartnerAsk[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("event_bookings")
    .select(PARTNER_COLUMNS)
    .eq("partner_id", me)
    .eq("partner_status", "asked")
    .eq("status", "booked")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`crews.findMyPartnerAsks failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as PartnerRow[]).map(toPartnerAsk);
}

/** The duet entries the signed-in person made whose partner has not answered. */
export async function findMyUnansweredPartners(supabase: SupabaseClient): Promise<PartnerAsk[]> {
  const me = await currentUserId(supabase);
  if (!me) return [];
  const { data, error } = await supabase
    .from("event_bookings")
    .select(PARTNER_COLUMNS)
    .eq("user_id", me)
    .eq("partner_status", "asked")
    .eq("status", "booked")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`crews.findMyUnansweredPartners failed: ${error.message}`);
  }
  return ((data ?? []) as unknown as PartnerRow[]).map(toPartnerAsk);
}

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

export async function updateCrew(supabase: SupabaseClient, input: { crewId: string; name: string; city: string; style: string }): Promise<void> {
  const { error } = await supabase.rpc("update_crew", { p_crew_id: input.crewId, p_name: input.name, p_city: input.city, p_style: input.style });
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

export async function respondToPartnerAsk(supabase: SupabaseClient, bookingId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_to_partner_ask", { p_booking_id: bookingId, p_accept: accept });
  if (error) {
    throw new Error(error.message);
  }
}
