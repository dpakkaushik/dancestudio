import type { SupabaseClient } from "@supabase/supabase-js";
import { findArtistIds } from "@/repositories/profiles";
import type { ProfileRole } from "@/types/profile";
import type { AcceptedMethods, Tenant, TenantType } from "@/types/tenant";
import type { SocialLink } from "@/types/profile";

export interface TenantRow {
  profile_photo_path?: string | null;
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  about?: string | null;
  founded_year?: number | null;
  phone?: string | null;
  socials?: unknown;
  enquiry_types?: string[] | null;
  accepts_upi?: boolean;
  accepts_cards?: boolean;
  accepts_cash?: boolean;
  accepts_bank?: boolean;
  verified_at?: string | null;
  location_set_at?: string | null;
}

export const TENANT_COLUMNS = "id, type, name, area, city, profile_photo_path, about, founded_year, phone, socials, enquiry_types, accepts_upi, accepts_cards, accepts_cash, accepts_bank, verified_at, location_set_at";

const toSocials = (raw: unknown): SocialLink[] =>
  Array.isArray(raw)
    ? raw
        .filter((x): x is { platform: unknown; url: unknown } => Boolean(x) && typeof x === "object")
        .map((x) => ({ platform: String(x.platform ?? ""), url: String(x.url ?? "") }))
        .filter((x) => x.platform && x.url)
    : [];

export const toTenant = (row: TenantRow): Tenant => ({
  id: row.id,
  type: row.type,
  name: row.name,
  area: row.area,
  city: row.city,
  photoPath: row.profile_photo_path ?? null,
  about: row.about ?? null,
  foundedYear: row.founded_year == null ? null : Number(row.founded_year),
  phone: row.phone ?? null,
  socials: toSocials(row.socials),
  enquiryTypes: Array.isArray(row.enquiry_types) ? row.enquiry_types : null,
  accepts: { upi: row.accepts_upi ?? true, cards: row.accepts_cards ?? true, cash: row.accepts_cash ?? true, bank: row.accepts_bank ?? false },
  verifiedAt: row.verified_at ?? null,
  locationSetAt: row.location_set_at ?? null,
});

export interface TenantProfileInput {
  about: string | null;
  foundedYear: number | null;
  phone: string | null;
  socials: SocialLink[];
  enquiryTypes: string[] | null;
  accepts: AcceptedMethods;
}

/** What a business says about itself and the switches it sets (S_payments 16612,
 *  the enquiry-types sheet 9000, the public page's About / Since / Call / links):
 *  one owner-only door, validated inside. */
export async function updateTenantProfile(supabase: SupabaseClient, tenantId: string, input: TenantProfileInput): Promise<void> {
  const { error } = await supabase.rpc("update_business_profile", {
    p_business_id: tenantId,
    p_about: input.about,
    p_founded_year: input.foundedYear,
    p_phone: input.phone,
    p_socials: input.socials,
    p_enquiry_types: input.enquiryTypes,
    p_accepts_upi: input.accepts.upi,
    p_accepts_cards: input.accepts.cards,
    p_accepts_cash: input.accepts.cash,
    p_accepts_bank: input.accepts.bank,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Atomic create: tenant + owner membership via the create_business_with_owner RPC. */
export async function createTenantWithOwner(
  supabase: SupabaseClient,
  input: { name: string; type: TenantType; area?: string | null; city?: string | null }
): Promise<Tenant> {
  const { data, error } = await supabase.rpc("create_business_with_owner", {
    p_name: input.name,
    p_type: input.type,
    p_area: input.area ?? null,
    p_city: input.city ?? null,
  });

  if (error) {
    throw new Error(`businesses.create failed: ${error.message}`);
  }
  return toTenant(data as TenantRow);
}

/** THE ARTIST PAGE IS PROVISIONED, NEVER "SET UP" (18 Sep 2026, the user: "there
 *  is no need for a separate artist page to be created — should be managed from
 *  the artist profile only; you just subscribe from a user to artist to get the
 *  additional tools"). The row behind an artist's classes, team, students and
 *  earnings is still `businesses.type = 'artist_page'` — every class, ask and
 *  payout in this database hangs off a business — but nobody opens it from a
 *  sheet any more. The first time an account with a LIVE plan renders Home
 *  without one, this makes it, named after the person and in their city, the
 *  way `my_org_business()` makes an organization's hosting row on first ask.
 *  The database keeps its own gate (`create_business_with_owner` refuses one
 *  without the plan, and a second one), and a refusal here is swallowed: Home is
 *  not the place to fail, and the tiles fall back to the hub. Returns the page's
 *  id, existing or new, or null. */
export async function ensureArtistPage(
  supabase: SupabaseClient,
  profile: { fullName: string; city: string | null },
  memberships: MyMembership[]
): Promise<string | null> {
  const have = memberships.find((m) => m.memberRole === "owner" && m.tenant.type === "artist_page");
  if (have) return have.tenant.id;
  try {
    const page = await createTenantWithOwner(supabase, { name: profile.fullName, type: "artist_page", area: null, city: profile.city });
    return page.id;
  } catch {
    return null;
  }
}

/** One business's NAME, as the caller may read it — a listed studio to anybody,
 *  an unlisted one to its team. Null when RLS says no. Used where a form holds
 *  only an id and should say a name (the venue an artist asked, 18 Sep 2026). */
export async function findBusinessName(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await supabase.from("businesses").select("name").eq("id", businessId).is("deleted_at", null).maybeSingle();
  if (error) {
    throw new Error(`tenants.findBusinessName failed: ${error.message}`);
  }
  return (data as { name: string } | null)?.name ?? null;
}

interface MembershipRow {
  businesses: TenantRow | null;
}

/** VISITING FACULTY (18 Sep 2026): a person from outside the team who accepted a
 *  studio's ask to teach one of its classes — accepting seats them on the team in
 *  this role, so the register they teach opens for them the way it opens for any
 *  live member with the job (can_run_register_for_class). Never invited into
 *  directly; it is what accepting a class makes you. */
export type MemberRole = "owner" | "trainer" | "staff" | "visiting_faculty";

export interface MyMembership {
  tenant: Tenant;
  memberRole: MemberRole;
}

interface MembershipWithRoleRow {
  member_role: MemberRole;
  businesses: TenantRow | null;
}

/** The signed-in user's businesses WITH the relationship — because there are two
 *  of them (prototype S_bizhub 2595-2603): a studio you own has a roster and a
 *  payroll to keep; a studio you teach at has a page you read. The hub lists
 *  them under separate headings and sends them to different places, so it needs
 *  the role beside the tenant.
 *
 *  Says `user_id = auth.uid()` OUT LOUD, like findMyTenants below: since Step 11
 *  a tenant's members can read each other's membership rows, so leaning on RLS
 *  to mean "mine" would list one row per teammate. RLS is a ceiling, not a
 *  scoping mechanism. */
export async function findMyMemberships(supabase: SupabaseClient): Promise<MyMembership[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("business_members")
    .select(`created_at, member_role, businesses (${TENANT_COLUMNS})`)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`businesses.findMyMemberships failed: ${error.message}`);
  }
  return (data as unknown as MembershipWithRoleRow[])
    .filter((row): row is MembershipWithRoleRow & { businesses: TenantRow } => row.businesses !== null)
    .map((row) => ({ tenant: toTenant(row.businesses), memberRole: row.member_role }));
}

/** The signed-in user's role on one tenant, or null when they are not a member.
 *
 *  Says `user_id = auth.uid()` OUT LOUD, and must keep doing so. This query once
 *  leaned on business_members being own-rows-only under RLS — then Step 11 let a
 *  tenant's members read each other, so on any studio with two people it started
 *  matching several rows and maybeSingle() threw ("multiple (or no) rows
 *  returned"), taking the public class page down with it. Same lesson as
 *  findMyTenants below: RLS is a ceiling, not a scoping mechanism. */
export async function findMyMembershipRole(
  supabase: SupabaseClient,
  tenantId: string
): Promise<MemberRole | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("business_members")
    .select("member_role")
    .eq("business_id", tenantId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`businesses.myRole failed: ${error.message}`);
  }
  return (data?.member_role as MemberRole | undefined) ?? null;
}

/** Tenants the signed-in user belongs to.
 *  RLS policies OR together — since discovery made listed businesses publicly
 *  readable, selecting from `businesses` directly returns EVERY listed tenant.
 *  Membership is the query's spine instead — and the spine says whose rows it
 *  wants OUT LOUD: since Step 11 a tenant's members can read each other, so
 *  leaning on the policy to mean "mine" would list one row per teammate. RLS is
 *  a ceiling, not a scoping mechanism. */
export async function findMyTenants(supabase: SupabaseClient): Promise<Tenant[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("business_members")
    .select(`created_at, businesses (${TENANT_COLUMNS})`)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error(`businesses.findMine failed: ${error.message}`);
  }
  return (data as unknown as MembershipRow[])
    .map((row) => row.businesses)
    .filter((tenant): tenant is TenantRow => tenant !== null)
    .map(toTenant);
}

export interface TeamMember {
  userId: string;
  name: string;
  role: MemberRole;
  city: string | null;
  /** what they are on DanceOS — the team row prints "· Artist" / "· User" from it (18563) */
  profileRole: ProfileRole | null;
  /** the plan's word, read once per team through artist_ids */
  isArtist: boolean;
  /** a path in the public media bucket, or null for initials on the gradient */
  avatarPath: string | null;
}

/** The tenant's own people — the pool the class form's artist and assistant
 *  pickers offer (prototype dosTeachPool / dosAssistPool). Staff invites arrive
 *  with Step 12, so today this is whoever the studio already has.
 *
 *  Two queries on purpose: business_members.user_id references auth.users, not
 *  profiles, so PostgREST has no relationship to embed the name through. */
export async function findTenantTeam(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("business_members")
    .select("user_id, member_role")
    .eq("business_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(`businesses.team failed: ${error.message}`);
  }
  const rows = data as Array<{ user_id: string; member_role: MemberRole }>;
  if (rows.length === 0) {
    return [];
  }

  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, full_name, city, role, profile_photo_path")
    .in(
      "id",
      rows.map((r) => r.user_id)
    )
    .is("deleted_at", null);

  if (peopleError) {
    throw new Error(`businesses.teamProfiles failed: ${peopleError.message}`);
  }
  interface PersonRow {
    id: string;
    full_name: string;
    city: string | null;
    role: ProfileRole;
    profile_photo_path: string | null;
  }
  const byId = new Map((people as PersonRow[]).map((p) => [p.id, p]));
  const artists = await findArtistIds(supabase, rows.map((r) => r.user_id));

  return rows.map((row) => {
    const p = byId.get(row.user_id);
    return {
      userId: row.user_id,
      name: p?.full_name ?? "Teammate",
      role: row.member_role,
      city: p?.city ?? null,
      profileRole: p?.role ?? null,
      isArtist: artists.has(row.user_id),
      avatarPath: p?.profile_photo_path ?? null,
    };
  });
}

/** WHERE A BUSINESS IS (11 Sep 2026) — the write behind the location picker.
 *
 *  A studio's lat/lng has always been its CITY'S CENTROID, because
 *  `create_business_with_owner` had nothing else to write. This is the door that
 *  replaces the guess with an address the owner chose. The RPC re-checks
 *  ownership, refuses a point outside India, and will only write a city that is
 *  on the app's closed list. */
export async function setTenantLocation(
  supabase: SupabaseClient,
  input: { tenantId: string; lat: number; lng: number; area: string | null; city: string | null }
): Promise<void> {
  const { error } = await supabase.rpc("set_business_location", {
    p_business_id: input.tenantId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_area: input.area,
    p_city: input.city,
  });
  if (error) {
    throw new Error(error.message);
  }
}
