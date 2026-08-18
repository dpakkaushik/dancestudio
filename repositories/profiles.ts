import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, ProfileRole } from "@/types/profile";

interface ProfileRow {
  id: string;
  full_name: string;
  role: ProfileRole;
  city: string | null;
}

const PROFILE_COLUMNS = "id, full_name, role, city";

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  fullName: row.full_name,
  role: row.role,
  city: row.city,
});

export async function findProfileById(
  supabase: SupabaseClient,
  id: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`profiles.findById failed: ${error.message}`);
  }
  return data ? toProfile(data as ProfileRow) : null;
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
