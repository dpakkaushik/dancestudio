import type { SupabaseClient } from "@supabase/supabase-js";
import type { SocialLink } from "@/types/profile";

/** AN ORGANIZATION'S PUBLIC PAGE (18 Sep 2026, the user: "should show
 *  organization profile page, and the same should reflect inside the event cards
 *  with photo" — amending R9). Three SECURITY DEFINER reads, each answering only
 *  for a PUBLIC organization (one whose events may be public, or that runs a
 *  listed studio) and handing back exactly the columns a stranger may see:
 *  `public_organization`, `public_organization_studios`, `event_host_cards`
 *  (`20260918173000_an_organization_has_a_page.sql`). The organization's
 *  `profiles` row itself stays as private as R12 made it. */

export interface PublicOrganization {
  id: string;
  name: string;
  city: string | null;
  photoPath: string | null;
  about: string | null;
  socials: SocialLink[];
  verified: boolean;
  since: string;
  /** the hosting row its events hang off (R15) — null if none was ever made; since
   *  19 Sep 2026 also what an enquiry to the organization is sent to */
  hostBusinessId: string | null;
  /** the Call button's number (19 Sep 2026) — the organization's, published from Edit profile */
  phone: string | null;
  /** the Mail button's address (19 Sep 2026) */
  contactEmail: string | null;
  /** its PIN (push 2, 19 Sep 2026) — the Location button opens it; null until the organization places itself */
  lat: number | null;
  lng: number | null;
}

export interface PublicOrganizationStudio {
  id: string;
  name: string;
  area: string | null;
  city: string | null;
  photoPath: string | null;
  verifiedAt: string | null;
}

/** who hosts an event, as an event card prints it: a name, a picture, and the
 *  organization's page when the host is one */
export interface EventHostCard {
  businessId: string;
  orgId: string | null;
  name: string;
  photoPath: string | null;
}

const toSocials = (raw: unknown): SocialLink[] =>
  Array.isArray(raw)
    ? raw
        .filter((x): x is { platform: string; url: string } => Boolean(x) && typeof x === "object" && typeof (x as { url?: unknown }).url === "string" && typeof (x as { platform?: unknown }).platform === "string")
        .map((x) => ({ platform: x.platform, url: x.url }))
    : [];

export async function findPublicOrganization(supabase: SupabaseClient, orgId: string): Promise<PublicOrganization | null> {
  const { data, error } = await supabase.rpc("public_organization", { p_org_id: orgId });
  if (error) {
    throw new Error(`publicOrganization.find failed: ${error.message}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; name: string; city: string | null; photo_path: string | null; about: string | null; socials: unknown; verified: boolean; since: string; host_business_id: string | null; phone?: string | null; contact_email?: string | null; lat?: number | string | null; lng?: number | string | null }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    photoPath: row.photo_path,
    about: row.about,
    socials: toSocials(row.socials),
    verified: Boolean(row.verified),
    since: row.since,
    hostBusinessId: row.host_business_id,
    phone: row.phone ?? null,
    contactEmail: row.contact_email ?? null,
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
  };
}

/** A PUBLIC ORGANIZATION'S TEAM (push 2, 19 Sep 2026): the confirmed people it
 *  named, owners first — what its page prints under OWNER and TEAM. Empty for a
 *  private organization, by the definer read's own rule. */
export interface PublicOrganizationTeamMember {
  memberId: string;
  userId: string;
  role: "owner" | "member";
  name: string;
  photoPath: string | null;
  city: string | null;
  isArtist: boolean;
}

export async function findPublicOrganizationTeam(supabase: SupabaseClient, orgId: string): Promise<PublicOrganizationTeamMember[]> {
  const { data, error } = await supabase.rpc("public_organization_team", { p_org_id: orgId });
  if (error) {
    throw new Error(`publicOrganization.team failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{ member_id: string; user_id: string; role: "owner" | "member"; full_name: string; photo_path: string | null; city: string | null; is_artist: boolean }>).map((r) => ({
    memberId: r.member_id,
    userId: r.user_id,
    role: r.role,
    name: r.full_name,
    photoPath: r.photo_path,
    city: r.city,
    isArtist: Boolean(r.is_artist),
  }));
}

export async function findPublicOrganizationStudios(supabase: SupabaseClient, orgId: string): Promise<PublicOrganizationStudio[]> {
  const { data, error } = await supabase.rpc("public_organization_studios", { p_org_id: orgId });
  if (error) {
    throw new Error(`publicOrganization.studios failed: ${error.message}`);
  }
  return ((data ?? []) as Array<{ id: string; name: string; area: string | null; city: string | null; photo_path: string | null; verified_at: string | null }>).map((r) => ({
    id: r.id,
    name: r.name,
    area: r.area,
    city: r.city,
    photoPath: r.photo_path,
    verifiedAt: r.verified_at,
  }));
}

/** the hosts of a list of events, in one read — a card per public host, keyed by the hosting row */
export async function findEventHostCards(supabase: SupabaseClient, businessIds: string[]): Promise<Map<string, EventHostCard>> {
  const ids = [...new Set(businessIds.filter(Boolean))];
  const out = new Map<string, EventHostCard>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.rpc("event_host_cards", { p_business_ids: ids });
  if (error) {
    /* a card without its host line is still a card — this read is decoration */
    return out;
  }
  ((data ?? []) as Array<{ business_id: string; org_id: string | null; name: string; photo_path: string | null }>).forEach((r) =>
    out.set(r.business_id, { businessId: r.business_id, orgId: r.org_id, name: r.name, photoPath: r.photo_path })
  );
  return out;
}

/** the person who owns an artist page — where /artist/{id} sends you now that an
 *  artist's public face is their profile (18 Sep 2026); null for anything else */
export async function findArtistPageOwner(supabase: SupabaseClient, businessId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("artist_page_owner", { p_business_id: businessId });
  if (error) return null;
  return (data as string | null) ?? null;
}

/** the listed artist page behind a person, for the Enquiry on their profile */
export async function findArtistPageOf(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("artist_page_of", { p_user_id: userId });
  if (error) return null;
  return (data as string | null) ?? null;
}
