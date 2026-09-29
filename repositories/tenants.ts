import type { SupabaseClient } from "@supabase/supabase-js";
import { findArtistIds } from "@/repositories/profiles";
import type { ProfileRole } from "@/types/profile";
import type { AcceptedMethods, Business, BusinessType } from "@/types/tenant";
import type { SocialLink } from "@/types/profile";

export interface TenantRow {
  profile_photo_path?: string | null;
  id: string;
  type: BusinessType;
  name: string;
  area: string | null;
  city: string | null;
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
  contact_email?: string | null;
  styles?: string[] | null;
  member_no?: number | null;
}

/* ⚠ `about` LEFT on 20 Sep 2026 (`20260920160000_the_bio_is_gone`) — selecting a
   dropped column would fail every business read.
   ⚠⚠ `gstin` / `gstin_verified_at` LEFT THIS SELECT on 29 Sep 2026 with
   organizations, and it is the SAME rule read forwards rather than backwards:
   nothing maps them any more, and if the removal's migration ever drops the two
   columns, a select still naming them would answer "column does not exist" on
   EVERY business read — which is exactly what `poster_path` did on 27 Sep, one
   line ahead of its migration, and it surfaced as React #441 rather than as
   anything that named a column. A column nothing reads comes out of the select
   BEFORE it can come out of the table. */
export const TENANT_COLUMNS = "id, type, name, area, city, profile_photo_path, founded_year, phone, socials, enquiry_types, accepts_upi, accepts_cards, accepts_cash, accepts_bank, verified_at, location_set_at, contact_email, styles, member_no";

const toSocials = (raw: unknown): SocialLink[] =>
  Array.isArray(raw)
    ? raw
        .filter((x): x is { platform: unknown; url: unknown } => Boolean(x) && typeof x === "object")
        .map((x) => ({ platform: String(x.platform ?? ""), url: String(x.url ?? "") }))
        .filter((x) => x.platform && x.url)
    : [];

export const toTenant = (row: TenantRow): Business => ({
  id: row.id,
  type: row.type,
  name: row.name,
  area: row.area,
  city: row.city,
  photoPath: row.profile_photo_path ?? null,
  foundedYear: row.founded_year == null ? null : Number(row.founded_year),
  phone: row.phone ?? null,
  socials: toSocials(row.socials),
  enquiryTypes: Array.isArray(row.enquiry_types) ? row.enquiry_types : null,
  accepts: { upi: row.accepts_upi ?? true, cards: row.accepts_cards ?? true, cash: row.accepts_cash ?? true, bank: row.accepts_bank ?? false },
  verifiedAt: row.verified_at ?? null,
  locationSetAt: row.location_set_at ?? null,
  contactEmail: row.contact_email ?? null,
  /* THE STYLES A BUSINESS SAYS IT DANCES (19 Sep 2026, the user: "some studios
     dont show dance styles on profile it is mandatory to have one at least").
     They were DERIVED from its published classes until today, so a studio with
     no class yet showed none — twelve of production's eighteen listed studios. */
  styles: Array.isArray(row.styles) ? row.styles : [],
  /* the business's own number, printed beside its type the way a person's is
     (20 Sep 2026, the user: "Id should be besides profile type on home and
     profilepage both") — until today only `profiles` had one */
  memberNo: row.member_no == null ? null : Number(row.member_no),
  /* `gstin` / `gstinVerifiedAt` went with organizations (29 Sep 2026) — a GST
     number was an organization's alone, and it is what its events and its
     subscription waited on. The columns stay on the row; nothing reads them. */
});

export interface BusinessProfileInput {
  /** the NAME (18 Sep 2026) — sent only when it changed; omitted, the row keeps its own */
  name?: string | null;
  foundedYear: number | null;
  phone: string | null;
  socials: SocialLink[];
  enquiryTypes: string[] | null;
  accepts: AcceptedMethods;
  /** THE CONTACT EMAIL (19 Sep 2026): omitted → unchanged (the Payments desk's
   *  switches and the enquiry-types sheet never touch it), null → cleared, a
   *  string → set */
  contactEmail?: string | null;
  /** THE DANCE STYLES (19 Sep 2026): omitted → unchanged; a list → set (trimmed,
   *  de-duplicated, at most twelve, and a STUDIO may not end up with none) */
  styles?: string[];
}

/** What a business says about itself and the switches it sets (S_payments 16612,
 *  the enquiry-types sheet 9000, the public page's About / Since / Call / links):
 *  one owner-only door, validated inside. */
export async function updateTenantProfile(supabase: SupabaseClient, businessId: string, input: BusinessProfileInput): Promise<void> {
  const { error } = await supabase.rpc("update_business_profile", {
    p_business_id: businessId,
    p_founded_year: input.foundedYear,
    p_phone: input.phone,
    p_socials: input.socials,
    p_enquiry_types: input.enquiryTypes,
    p_accepts_upi: input.accepts.upi,
    p_accepts_cards: input.accepts.cards,
    p_accepts_cash: input.accepts.cash,
    p_accepts_bank: input.accepts.bank,
    /* `p_name` is LAST-but-one with a default on the RPC (`20260918172000`), so a
       null here is "leave it" and the call resolves against the one signature
       there is; `p_contact_email` follows it (`20260919122000`) with the same
       rule, and an empty string is how the owner takes the address down */
    p_name: input.name ?? null,
    p_contact_email: input.contactEmail === undefined ? null : (input.contactEmail ?? ""),
    /* `p_styles` is LAST with a default (`20260919190000`): null leaves them as
       they are, so every caller that does not edit styles behaves as before */
    p_styles: input.styles ?? null,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Atomic create: business + owner membership via the create_business_with_owner RPC. */
export async function createTenantWithOwner(
  supabase: SupabaseClient,
  input: { name: string; type: BusinessType; area?: string | null; city?: string | null; styles?: string[] }
): Promise<Business> {
  const { data, error } = await supabase.rpc("create_business_with_owner", {
    p_name: input.name,
    p_type: input.type,
    p_area: input.area ?? null,
    p_city: input.city ?? null,
    /* A STUDIO NAMES AT LEAST ONE STYLE (19 Sep 2026) — `p_styles` is LAST with
       a default, so the artist page Home provisions still calls this unchanged */
    p_styles: input.styles ?? null,
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
 *  without one, this makes it, named after the person and in their city.
 *  The database keeps its own gate (`create_business_with_owner` refuses one
 *  without the plan, and a second one), and a refusal here is swallowed: Home is
 *  not the place to fail, and the tiles fall back to the hub. Returns the page's
 *  id, existing or new, or null. */
export async function ensureArtistPage(
  supabase: SupabaseClient,
  profile: { fullName: string; city: string | null },
  memberships: MyMembership[]
): Promise<string | null> {
  const have = memberships.find((m) => m.memberRole === "owner" && m.business.type === "artist_page");
  if (have) return have.business.id;
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
    throw new Error(`businesses.findBusinessName failed: ${error.message}`);
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
export type MemberRole = "owner" | "manager" | "trainer" | "staff" | "visiting_faculty" | "assistant";

/** ⚠⚠ WHO MAY ACT AS THE BUSINESS (28 Sep 2026, the user: "only these 2 get the
 *  right to get studio or organization in the profile switcher. that profile
 *  switcher and rights should never be given for faculty, visiting faculty,
 *  assistant, event team or other team members").
 *
 *  Until today the profile switcher listed every business the account held ANY
 *  seat on, so a visiting teacher who accepted one class could switch into the
 *  studio and open its Team desk, its Students desk, its Rooms editor and its
 *  Media. This is the one test behind the switcher, the business's home and every
 *  desk under it — declared once, because a rule about who may act as a business
 *  that is written out five times is a rule that will be four places out of date.
 *
 *  ⚠ `manager` CANNOT EXIST YET: `business_members_member_role_check` admits five
 *  values and this is not one of them, so today this reads "owner". The seat, the
 *  Team desks that hand it out and the rest of its powers are one migration away
 *  and its list is in front of the user (NEXT TO DO #0ax). The test is written for
 *  both now so that landing the migration changes a CHECK and not this rule. */
export const RUNS_THE_BUSINESS: ReadonlyArray<MemberRole> = ["owner", "manager"];
export const runsTheBusiness = (role: MemberRole | null | undefined): boolean =>
  role != null && RUNS_THE_BUSINESS.includes(role);

export interface MyMembership {
  business: Business;
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
 *  the role beside the business.
 *
 *  Says `user_id = auth.uid()` OUT LOUD, like findMyTenants below: since Step 11
 *  a business's members can read each other's membership rows, so leaning on RLS
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
    .map((row) => ({ business: toTenant(row.businesses), memberRole: row.member_role }));
}

/** The signed-in user's role on one business, or null when they are not a member.
 *
 *  Says `user_id = auth.uid()` OUT LOUD, and must keep doing so. This query once
 *  leaned on business_members being own-rows-only under RLS — then Step 11 let a
 *  business's members read each other, so on any studio with two people it started
 *  matching several rows and maybeSingle() threw ("multiple (or no) rows
 *  returned"), taking the public class page down with it. Same lesson as
 *  findMyTenants below: RLS is a ceiling, not a scoping mechanism. */
export async function findMyMembershipRole(
  supabase: SupabaseClient,
  businessId: string
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
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`businesses.myRole failed: ${error.message}`);
  }
  return (data?.member_role as MemberRole | undefined) ?? null;
}

/** THE SEAT AND WHAT IT WAS GRANTED — the same one row as `findMyMembershipRole`
 *  above, with the two STANDING powers on it (28 Sep 2026).
 *
 *  ⚠ WHY THIS EXISTS AT ALL. R38 (20 Sep 2026) gave an owner two grants to hand
 *  out per person on the Team desk — `business_members.can_attendance` and
 *  `can_refunds` — and the DATABASE has honoured them ever since:
 *  `can_run_register_for_class` and `can_settle_refunds_for_class` each carry a
 *  branch for the standing grant beside the per-class classPerson and the owner. The
 *  CLASS PAGE never read them: it asked `myClaim` alone, which is the OTHER
 *  grant path. So an assistant given Attendance on the Team desk could run the
 *  register as far as the database was concerned and **saw no tab to run it
 *  from** — the user's own report, and eight days old.
 *
 *  It is a sibling rather than a widening of `findMyMembershipRole` because that
 *  function has other callers that want a role and nothing else; this one costs
 *  the same single query, so the page that needs both makes no extra round trip. */
export interface MySeat {
  role: MemberRole;
  canAttendance: boolean;
  canRefunds: boolean;
}
export async function findMySeat(supabase: SupabaseClient, businessId: string): Promise<MySeat | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("business_members")
    .select("member_role, can_attendance, can_refunds")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`businesses.mySeat failed: ${error.message}`);
  }
  if (!data) return null;
  const row = data as { member_role: MemberRole; can_attendance?: boolean; can_refunds?: boolean };
  return { role: row.member_role, canAttendance: Boolean(row.can_attendance), canRefunds: Boolean(row.can_refunds) };
}

/** Businesses the signed-in user belongs to.
 *  RLS policies OR together — since discovery made listed businesses publicly
 *  readable, selecting from `businesses` directly returns EVERY listed business.
 *  Membership is the query's spine instead — and the spine says whose rows it
 *  wants OUT LOUD: since Step 11 a business's members can read each other, so
 *  leaning on the policy to mean "mine" would list one row per teammate. RLS is
 *  a ceiling, not a scoping mechanism. */
export async function findMyTenants(supabase: SupabaseClient): Promise<Business[]> {
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
    .filter((business): business is TenantRow => business !== null)
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
  /** THE STANDING GRANTS (20 Sep 2026, the user: "permission given by Artist or
   *  Studio for managing Attendance and Refunds"). An owner holds both by their
   *  seat and carries them false here — the sheet draws no switch for one. */
  canAttendance: boolean;
  canRefunds: boolean;
  /** THE ONE STYLE THE ROW PRINTS (20 Sep 2026, the prototype's `DosTeamRow`
   *   18563 — "Aki Sharma · CLASS ASSISTANT · DANCER · Contemporary"). Their
   *  FIRST style, which is the one they put first themselves; null when they
   *  have named none. One more column on a select that already runs. */
  style: string | null;
}

/** The business's own people — the pool the class form's artist and assistant
 *  pickers offer (prototype dosTeachPool / dosAssistPool). Staff invites arrive
 *  with Step 12, so today this is whoever the studio already has.
 *
 *  Two queries on purpose: business_members.user_id references auth.users, not
 *  profiles, so PostgREST has no relationship to embed the name through. */
export async function findTenantTeam(
  supabase: SupabaseClient,
  businessId: string
): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("business_members")
    .select("user_id, member_role, can_attendance, can_refunds")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    /* THE ORDER THE OWNER ARRANGED (19 Sep 2026, the user: "should be able to
       place them in order as well") — `sort` first, joined-first as the tie */
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(`businesses.team failed: ${error.message}`);
  }
  const rows = data as Array<{ user_id: string; member_role: MemberRole; can_attendance?: boolean; can_refunds?: boolean }>;
  if (rows.length === 0) {
    return [];
  }

  const { data: people, error: peopleError } = await supabase
    .from("profiles")
    .select("id, full_name, city, role, profile_photo_path, styles")
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
    styles: string[] | null;
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
      canAttendance: Boolean(row.can_attendance),
      canRefunds: Boolean(row.can_refunds),
      style: Array.isArray(p?.styles) && p.styles.length ? p.styles[0] : null,
    };
  });
}

/** THE OWNER GRANTS THE TWO STANDING POWERS (20 Sep 2026). Owner-only inside the
 *  RPC, refused for an owner (who already holds both), and the seat is still the
 *  ceiling — the grant dies with it. */
export async function setTenantMemberPowers(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  canAttendance: boolean,
  canRefunds: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_member_powers", {
    p_business_id: businessId,
    p_user_id: userId,
    p_can_attendance: canAttendance,
    p_can_refunds: canRefunds,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** THE ORDER THE TEAM IS SHOWN IN (19 Sep 2026) — the owner's alone, and the
 *  crew desk's `reorder_crew_members` in a different coat. Whoever is left out
 *  of the list keeps their place after it, so a partial list is safe. */
export async function reorderTenantMembers(
  supabase: SupabaseClient,
  businessId: string,
  userIds: string[]
): Promise<void> {
  const { error } = await supabase.rpc("reorder_business_members", {
    p_business_id: businessId,
    p_user_ids: userIds,
  });
  if (error) {
    throw new Error(error.message);
  }
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
  input: { businessId: string; lat: number; lng: number; area: string | null; city: string | null }
): Promise<void> {
  const { error } = await supabase.rpc("set_business_location", {
    p_business_id: input.businessId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_area: input.area,
    p_city: input.city,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** THE PERSON WHO OWNS AN ARTIST PAGE — where `/artist/{id}` sends you now that
 *  an artist's public face is their profile (18 Sep 2026); null for anything
 *  else. Its three callers each hold a business id and need the person behind
 *  it: `/artist/{id}`, the class page, and a studio's stats page.
 *
 *  ⚠ MOVED HERE FROM `repositories/publicOrganization.ts` (29 Sep 2026), when
 *  organizations were removed. It was the one read in that file with nothing to
 *  do with an organization, and a file named after a thing the app no longer has
 *  is a lie to the next reader — so the file went and this came here, where
 *  every other business read already lives. */
export async function findArtistPageOwner(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("artist_page_owner", { p_business_id: businessId });
  if (error) return null;
  return (data as string | null) ?? null;
}
