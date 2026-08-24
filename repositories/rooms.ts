import type { SupabaseClient } from "@supabase/supabase-js";
import type { Room } from "@/types/room";

/** Rooms are plain studio config, so they are edited through RLS-guarded direct
 *  writes (owner/trainer of the tenant) rather than RPCs — there is no
 *  cross-row invariant to serialise. What a room caps and whether it clashes is
 *  enforced by the class-side triggers. */

interface RoomRow {
  id: string;
  tenant_id: string;
  name: string;
  capacity: number;
  amenities: string[] | null;
}

const ROOM_COLUMNS = "id, tenant_id, name, capacity, amenities";

const toRoom = (row: RoomRow): Room => ({
  id: row.id,
  tenantId: row.tenant_id,
  name: row.name,
  capacity: row.capacity,
  amenities: row.amenities ?? [],
});

/** A tenant's live rooms, oldest first (the order they were added). */
export async function findRoomsByTenant(
  supabase: SupabaseClient,
  tenantId: string
): Promise<Room[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    throw new Error(`rooms.findByTenant failed: ${error.message}`);
  }
  return (data as RoomRow[]).map(toRoom);
}

/** One room by id — used to read amenities onto a public class page. */
export async function findRoomById(
  supabase: SupabaseClient,
  roomId: string
): Promise<Room | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("id", roomId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`rooms.findById failed: ${error.message}`);
  }
  return data ? toRoom(data as RoomRow) : null;
}

export async function createRoom(
  supabase: SupabaseClient,
  input: { tenantId: string; name: string; capacity: number; amenities: string[] }
): Promise<Room> {
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      tenant_id: input.tenantId,
      name: input.name,
      capacity: input.capacity,
      amenities: input.amenities,
    })
    .select(ROOM_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return toRoom(data as RoomRow);
}

export async function updateRoom(
  supabase: SupabaseClient,
  roomId: string,
  patch: { name?: string; capacity?: number; amenities?: string[] }
): Promise<void> {
  const { data, error } = await supabase
    .from("rooms")
    .update(patch)
    .eq("id", roomId)
    .is("deleted_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.length === 0) {
    throw new Error("Room not found or not yours to edit");
  }
}

/** Soft delete. Classes pointing at it keep their room NAME (the FK is ON DELETE
 *  SET NULL only for a hard delete, which never happens) so history stays
 *  readable. No `.select()`: the member SELECT policy admits deleted rows, but
 *  keeping the write bare matches the classes repository's shape. */
export async function softDeleteRoom(supabase: SupabaseClient, roomId: string): Promise<void> {
  const { error } = await supabase
    .from("rooms")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", roomId)
    .is("deleted_at", null);

  if (error) {
    throw new Error(error.message);
  }
}
