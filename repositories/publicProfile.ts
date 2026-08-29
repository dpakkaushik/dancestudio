import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublicFacultyMember, PublicTenant, PublicTenantProfile } from "@/types/publicProfile";
import type { TenantType } from "@/types/tenant";
import { findFollowerCounts } from "./follows";

/** Step 15 — a business's public page, assembled from what the public may
 *  already read: the listed tenant (Step 3's "anyone reads listed tenants"),
 *  its published classes and their sessions, and the CONFIRMED claims on them
 *  (Step 11: an unanswered ask never puts a name on a public page). Nothing
 *  here is a new permission; a member of the business sees the same page plus
 *  their own drafts nowhere on it. */

const MAX_CLASSES = 500;

interface TenantRow {
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  created_at: string;
  photo_path?: string | null;
  about?: string | null;
  founded_year?: number | null;
  phone?: string | null;
  socials?: unknown;
  enquiry_types?: string[] | null;
  accepts_upi?: boolean | null;
  accepts_cards?: boolean | null;
  accepts_cash?: boolean | null;
  accepts_bank?: boolean | null;
  verified_at?: string | null;
}

interface StyleRow {
  id: string;
  style: string;
  class_sessions: Array<{ starts_at: string; deleted_at: string | null }> | null;
}

interface FacultyRow {
  user_id: string;
  kind: "artist" | "assistant";
  profiles: { full_name: string; city: string | null; avatar_path: string | null } | null;
  classes: { tenant_id: string; status: string } | null;
}

/** A faculty member with their face: the read already carried `avatar_path`
 *  (profiles is signed-in readable) and the row now keeps it, so a Faculty row
 *  can wear the person's picture the way every other people-row does. Named
 *  here rather than in types/publicProfile.ts, which this slice does not own. */
export interface PublicFacultyFace extends PublicFacultyMember {
  avatarPath: string | null;
}
export type PublicTenantProfileWithFaces = Omit<PublicTenantProfile, "faculty"> & { faculty: PublicFacultyFace[] };

/** The tenant as the caller may see it — null when it is unlisted and the
 *  caller is not a member (RLS decides, the query does not). */
export async function findPublicTenant(supabase: SupabaseClient, tenantId: string): Promise<PublicTenant | null> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, type, name, area, city, created_at, photo_path, about, founded_year, phone, socials, enquiry_types, accepts_upi, accepts_cards, accepts_cash, accepts_bank, verified_at")
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
  return { id: row.id, type: row.type, name: row.name, area: row.area, city: row.city, createdAt: row.created_at, photoPath: row.photo_path ?? null, about: row.about ?? null, foundedYear: row.founded_year == null ? null : Number(row.founded_year), phone: row.phone ?? null, socials, enquiryTypes: Array.isArray(row.enquiry_types) ? row.enquiry_types : null, accepts: { upi: row.accepts_upi ?? true, cards: row.accepts_cards ?? true, cash: row.accepts_cash ?? true, bank: row.accepts_bank ?? false }, verifiedAt: row.verified_at ?? null };
}

export async function findPublicTenantProfile(
  supabase: SupabaseClient,
  tenantId: string,
  nowIso: string
): Promise<PublicTenantProfileWithFaces | null> {
  const tenant = await findPublicTenant(supabase, tenantId);
  if (!tenant) {
    return null;
  }

  const [classesRes, facultyRes, counts] = await Promise.all([
    supabase
      .from("classes")
      .select("id, style, class_sessions (starts_at, deleted_at)")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .is("deleted_at", null)
      .limit(MAX_CLASSES),
    supabase
      .from("class_claims")
      .select("user_id, kind, profiles (full_name, city, avatar_path), classes!inner (tenant_id, status)")
      .eq("classes.tenant_id", tenantId)
      .eq("classes.status", "published")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .limit(MAX_CLASSES),
    findFollowerCounts(supabase, [tenantId]),
  ]);

  if (classesRes.error) {
    throw new Error(`publicProfile.classes failed: ${classesRes.error.message}`);
  }
  if (facultyRes.error) {
    throw new Error(`publicProfile.faculty failed: ${facultyRes.error.message}`);
  }

  const classes = (classesRes.data ?? []) as unknown as StyleRow[];
  const styleCount = new Map<string, number>();
  let upcoming = 0;
  for (const c of classes) {
    styleCount.set(c.style, (styleCount.get(c.style) ?? 0) + 1);
    for (const s of c.class_sessions ?? []) {
      if (!s.deleted_at && s.starts_at >= nowIso) upcoming += 1;
    }
  }
  const styles = [...styleCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([style]) => style);

  /* one row per person: an artist anywhere outranks an assistant elsewhere.
     Profiles are readable by signed-in users only (Step 1), so a stranger's
     view names nobody — rows without a name are left out rather than printed
     as "Someone". */
  const people = new Map<string, PublicFacultyFace>();
  for (const r of (facultyRes.data ?? []) as unknown as FacultyRow[]) {
    if (!r.profiles?.full_name) continue;
    const role: PublicFacultyMember["role"] = r.kind === "artist" ? "Artist" : "Assistant";
    const existing = people.get(r.user_id);
    if (existing) {
      existing.classCount += 1;
      if (role === "Artist") existing.role = "Artist";
    } else {
      people.set(r.user_id, {
        userId: r.user_id,
        name: r.profiles.full_name,
        city: r.profiles.city,
        role,
        classCount: 1,
        avatarPath: r.profiles.avatar_path ?? null,
      });
    }
  }
  const faculty = [...people.values()].sort(
    (a, b) => (a.role === b.role ? b.classCount - a.classCount || a.name.localeCompare(b.name) : a.role === "Artist" ? -1 : 1)
  );

  return {
    tenant,
    styles,
    faculty,
    followers: counts.get(tenantId) ?? 0,
    upcomingSessions: upcoming,
  };
}
