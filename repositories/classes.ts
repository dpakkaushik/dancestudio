import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ClassLevel,
  ClassStatus,
  DanceClass,
  PosterChoice,
  PublicClassListing,
} from "@/types/class";

interface SessionRow {
  id: string;
  starts_at: string;
  ends_at: string;
}

interface ClassRow {
  id: string;
  tenant_id: string;
  title: string;
  share_slug: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  room_id: string | null;
  poster: PosterChoice | null;
  price_inr: number;
  capacity: number;
  status: ClassStatus;
  class_sessions: SessionRow[] | null;
}

interface PublicClassRow extends ClassRow {
  tenants: { name: string; area: string | null; city: string | null } | null;
}

const CLASS_COLUMNS =
  "id, tenant_id, title, share_slug, style, level, room, room_id, poster, price_inr, capacity, status, class_sessions (id, starts_at, ends_at)";

const firstSession = (rows: SessionRow[] | null) => {
  const live = [...(rows ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const s = live[0];
  return s ? { id: s.id, startsAt: s.starts_at, endsAt: s.ends_at } : null;
};

const toClass = (row: ClassRow): DanceClass => ({
  id: row.id,
  tenantId: row.tenant_id,
  title: row.title,
  shareSlug: row.share_slug,
  style: row.style,
  level: row.level,
  room: row.room,
  roomId: row.room_id,
  poster: row.poster,
  priceInr: row.price_inr,
  capacity: row.capacity,
  status: row.status,
  session: firstSession(row.class_sessions),
});

export interface CreateClassInput {
  tenantId: string;
  title: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  roomId: string | null;
  poster: PosterChoice | null;
  priceInr: number;
  capacity: number;
  status: "draft" | "published";
  startsAt: string; // ISO
  endsAt: string;
}

/** Atomic create: class + first session via the create_class_with_session RPC.
 *  The room and poster arguments default to null in SQL, so ten-argument
 *  callers (the earlier proof scripts) still hit this one creation path. */
export async function createClassWithSession(
  supabase: SupabaseClient,
  input: CreateClassInput
): Promise<string> {
  const { data, error } = await supabase.rpc("create_class_with_session", {
    p_tenant_id: input.tenantId,
    p_title: input.title,
    p_style: input.style,
    p_level: input.level,
    p_room: input.room,
    p_price_inr: input.priceInr,
    p_capacity: input.capacity,
    p_status: input.status,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_room_id: input.roomId,
    p_poster: input.poster,
  });

  if (error) {
    throw new Error(`classes.create failed: ${error.message}`);
  }
  return (data as { id: string }).id;
}

/** A tenant's full catalogue, drafts included — RLS admits members only. */
export async function findClassesByTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<DanceClass[]> {
  const { data, error } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`classes.findByTenant failed: ${error.message}`);
  }
  return (data as unknown as ClassRow[]).map(toClass);
}

/** One class by id (members only via RLS) — for the edit form. */
export async function findClassById(
  supabase: SupabaseClient,
  classId: string
): Promise<DanceClass | null> {
  const { data, error } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("id", classId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`classes.findById failed: ${error.message}`);
  }
  return data ? toClass(data as unknown as ClassRow) : null;
}

/** Published classes with the business behind them — the learner listing. */
export async function findPublishedClasses(
  supabase: SupabaseClient,
  limit = 50
): Promise<PublicClassListing[]> {
  const { data, error } = await supabase
    .from("classes")
    .select(`${CLASS_COLUMNS}, tenants (name, area, city)`)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`classes.findPublished failed: ${error.message}`);
  }
  return (data as unknown as PublicClassRow[]).map((row) => ({
    ...toClass(row),
    tenantName: row.tenants?.name ?? "",
    tenantArea: row.tenants?.area ?? null,
    tenantCity: row.tenants?.city ?? null,
  }));
}

/** One class by its share slug — the /c/{slug} detail page. No policy of its own:
 *  the public resolves published classes of listed tenants, a member resolves
 *  their tenant's drafts too, and anyone else gets null. */
export async function findClassBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<PublicClassListing | null> {
  const { data, error } = await supabase
    .from("classes")
    .select(`${CLASS_COLUMNS}, tenants (name, area, city)`)
    .eq("share_slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`classes.findBySlug failed: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  const row = data as unknown as PublicClassRow;
  return {
    ...toClass(row),
    tenantName: row.tenants?.name ?? "",
    tenantArea: row.tenants?.area ?? null,
    tenantCity: row.tenants?.city ?? null,
  };
}

/** Draft → published, or published → completed. RLS admits owners/trainers only. */
export async function updateClassStatus(
  supabase: SupabaseClient,
  classId: string,
  status: ClassStatus
): Promise<void> {
  const { data, error } = await supabase
    .from("classes")
    .update({ status })
    .eq("id", classId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw new Error(`classes.updateStatus failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Class not found or not yours to change");
  }
}

export interface UpdateClassInput {
  title: string;
  style: string;
  level: ClassLevel;
  room: string | null;
  roomId: string | null;
  poster: PosterChoice | null;
  priceInr: number;
  capacity: number;
  startsAt: string;
  endsAt: string;
}

/** Edit a class's fields and move its session — two updates, both RLS-guarded. */
export async function updateClassDetails(
  supabase: SupabaseClient,
  classId: string,
  input: UpdateClassInput
): Promise<void> {
  const { data, error } = await supabase
    .from("classes")
    .update({
      title: input.title,
      style: input.style,
      level: input.level,
      room: input.room,
      room_id: input.roomId,
      poster: input.poster,
      price_inr: input.priceInr,
      capacity: input.capacity,
    })
    .eq("id", classId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw new Error(`classes.update failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error("Class not found or not yours to edit");
  }

  const { error: sessionError } = await supabase
    .from("class_sessions")
    .update({ starts_at: input.startsAt, ends_at: input.endsAt })
    .eq("class_id", classId)
    .is("deleted_at", null);

  if (sessionError) {
    throw new Error(`classes.updateSession failed: ${sessionError.message}`);
  }
}

/** Soft delete — the class and its sessions get deleted_at, nothing is ever dropped.
 *  No `.select()` after the update: a soft-deleted row satisfies no SELECT policy,
 *  so asking for it back (RETURNING) would make Postgres reject the whole update. */
export async function softDeleteClass(
  supabase: SupabaseClient,
  classId: string
): Promise<void> {
  const mine = await findClassById(supabase, classId);
  if (!mine) {
    throw new Error("Class not found or not yours to delete");
  }

  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from("classes")
    .update({ deleted_at: deletedAt })
    .eq("id", classId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(`classes.delete failed: ${error.message}`);
  }

  const { error: sessionError } = await supabase
    .from("class_sessions")
    .update({ deleted_at: deletedAt })
    .eq("class_id", classId)
    .is("deleted_at", null);

  if (sessionError) {
    throw new Error(`classes.deleteSessions failed: ${sessionError.message}`);
  }
}

/** The styles each business teaches, off its PUBLISHED classes — what Discover's
 *  style rail narrows a studio or artist by (Step 23). Public rows only, by RLS. */
export async function findPublishedStylesByTenant(
  supabase: SupabaseClient,
  tenantIds: string[]
): Promise<Map<string, string[]>> {
  const ids = [...new Set(tenantIds)];
  const out = new Map<string, string[]>();
  if (ids.length === 0) {
    return out;
  }
  const { data, error } = await supabase
    .from("classes")
    .select("tenant_id, style")
    .in("tenant_id", ids)
    .eq("status", "published")
    .is("deleted_at", null)
    .limit(2000);
  if (error) {
    throw new Error(`classes.findPublishedStylesByTenant failed: ${error.message}`);
  }
  ((data ?? []) as Array<{ tenant_id: string; style: string }>).forEach((r) => {
    const cur = out.get(r.tenant_id) ?? [];
    if (!cur.includes(r.style)) cur.push(r.style);
    out.set(r.tenant_id, cur);
  });
  return out;
}
