import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicTeamMember, PublicTenant, PublicTenantProfile } from "@/types/publicProfile";
import type { TenantType } from "@/types/tenant";
import { findFollowerCounts } from "./follows";

/** Step 15 — a business's public page, assembled from what the public may
 *  already read: the listed tenant (Step 3's "anyone reads listed businesses"),
 *  its published classes, and — since 19 Sep 2026 — its TEAM through
 *  `public_studio_team`, one SECURITY DEFINER read that hands a stranger the
 *  owner, the faculty and the visiting faculty of a LISTED studio with a name
 *  and a picture each, and nobody else's. The Faculty that used to be read off
 *  confirmed claims on published classes is gone: since 18 Sep 2026 an outside
 *  teacher who accepts a class is seated on the team as visiting faculty, so
 *  the team IS the answer, and it is readable signed out where `profiles` is not. */

const MAX_CLASSES = 500;

interface TenantRow {
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  member_no?: number | null;
  lat?: number | null;
  lng?: number | null;
  location_set_at?: string | null;
  created_at: string;
  profile_photo_path?: string | null;
  about?: string | null;
  founded_year?: number | null;
  phone?: string | null;
  contact_email?: string | null;
  socials?: unknown;
  enquiry_types?: string[] | null;
  accepts_upi?: boolean | null;
  accepts_cards?: boolean | null;
  accepts_cash?: boolean | null;
  accepts_bank?: boolean | null;
  verified_at?: string | null;
  styles?: string[] | null;
}

interface StyleRow {
  id: string;
  style: string;
}

interface TeamRow {
  user_id: string;
  member_role: "owner" | "trainer" | "visiting_faculty" | "assistant";
  full_name: string;
  photo_path: string | null;
  is_org: boolean;
}

/** The tenant as the caller may see it — null when it is unlisted and the
 *  caller is not a member (RLS decides, the query does not). */
export async function findPublicTenant(supabase: SupabaseClient, tenantId: string): Promise<PublicTenant | null> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, type, name, area, city, lat, lng, location_set_at, created_at, profile_photo_path, about, founded_year, phone, contact_email, socials, enquiry_types, accepts_upi, accepts_cards, accepts_cash, accepts_bank, verified_at, styles, member_no")
    .eq("id", tenantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`publicProfile.tenant failed: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  const row = data as TenantRow;
  const socials = Array.isArray(row.socials) ? (row.socials as Array<{ platform?: unknown; url?: unknown }>).map((x) => ({ platform: String(x.platform ?? ""), url: String(x.url ?? "") })).filter((x) => x.platform && x.url) : [];
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    area: row.area,
    city: row.city,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    locationSetAt: row.location_set_at ?? null,
    createdAt: row.created_at,
    photoPath: row.profile_photo_path ?? null,
    about: row.about ?? null,
    foundedYear: row.founded_year == null ? null : Number(row.founded_year),
    phone: row.phone ?? null,
    contactEmail: row.contact_email ?? null,
    socials,
    enquiryTypes: Array.isArray(row.enquiry_types) ? row.enquiry_types : null,
    accepts: { upi: row.accepts_upi ?? true, cards: row.accepts_cards ?? true, cash: row.accepts_cash ?? true, bank: row.accepts_bank ?? false },
    verifiedAt: row.verified_at ?? null,
    /* what it SAYS it dances (19 Sep 2026) — its own field, not the styles of
       whatever it happens to have published */
    styles: Array.isArray(row.styles) ? row.styles : [],
    memberNo: row.member_no == null ? null : Number(row.member_no),
  };
}

/** A listed studio's team as the page prints it — owner, faculty, visiting
 *  faculty, in that order (the function orders them). Empty rather than an
 *  error when the caller may not see it: the page draws no group. */
export async function findPublicStudioTeam(supabase: SupabaseClient, tenantId: string): Promise<PublicTeamMember[]> {
  const { data, error } = await supabase.rpc("public_studio_team", { p_business_id: tenantId });
  if (error) {
    return [];
  }
  return ((data ?? []) as TeamRow[]).map((r) => ({ userId: r.user_id, role: r.member_role, name: r.full_name, photoPath: r.photo_path, isOrg: Boolean(r.is_org) }));
}

export async function findPublicTenantProfile(supabase: SupabaseClient, tenantId: string): Promise<PublicTenantProfile | null> {
  const tenant = await findPublicTenant(supabase, tenantId);
  if (!tenant) {
    return null;
  }
  /* R15 (9 Sep 2026): an organization's event-hosting row is not a business
     anybody browses to. Its members can read it (they own it), so RLS returns
     it — and "not found" is the honest answer for a page that does not exist. */
  if (tenant.type === "org") {
    return null;
  }

  const [classesRes, team, counts] = await Promise.all([
    supabase.from("classes").select("id, style").eq("business_id", tenantId).eq("status", "published").is("deleted_at", null).limit(MAX_CLASSES),
    findPublicStudioTeam(supabase, tenantId),
    findFollowerCounts(supabase, [tenantId]),
  ]);

  if (classesRes.error) {
    throw new Error(`publicProfile.classes failed: ${classesRes.error.message}`);
  }

  const styleCount = new Map<string, number>();
  for (const c of (classesRes.data ?? []) as StyleRow[]) {
    styleCount.set(c.style, (styleCount.get(c.style) ?? 0) + 1);
  }
  const taught = [...styleCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([style]) => style);
  /* ⚠ WHAT IT SAYS FIRST, WHAT IT TEACHES AS THE FALLBACK (19 Sep 2026, the
     user: "some studios dont show dance styles on profile it is mandatory to
     have one at least"). The derived list is kept for the rows that predate the
     field and have not been edited since — the migration backfills what it can,
     and a studio with no published class had nothing to backfill FROM. */
  const styles = tenant.styles.length ? tenant.styles : taught;

  return {
    tenant,
    styles,
    team,
    followers: counts.get(tenantId) ?? 0,
  };
}
