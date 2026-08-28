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

/** SEARCH DANCEOS (prototype 16413-16447): live profiles whose name contains the
 *  term, the caller left out, at most eight. Signed-in users read live
 *  profiles (Step 1's policy), so this is a plain read — the pickers that add
 *  a crew member or name a duet partner both go through it. */
export async function searchProfiles(
  supabase: SupabaseClient,
  term: string,
  excludeIds: string[] = []
): Promise<Profile[]> {
  const q = term.trim();
  if (q.length < 2) {
    return [];
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const skip = new Set([...(user ? [user.id] : []), ...excludeIds]);
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .ilike("full_name", `%${q.replace(/[%_]/g, "")}%`)
    .is("deleted_at", null)
    .order("full_name", { ascending: true })
    .limit(8 + skip.size);

  if (error) {
    throw new Error(`profiles.search failed: ${error.message}`);
  }
  return ((data ?? []) as ProfileRow[])
    .filter((r) => !skip.has(r.id))
    .slice(0, 8)
    .map(toProfile);
}
