import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, ProfileRole, SocialLink } from "@/types/profile";

interface ProfileRow {
  id: string;
  full_name: string;
  role: ProfileRole;
  city: string | null;
  avatar_path?: string | null;
  about?: string | null;
  age?: number | null;
  socials?: unknown;
  styles?: string[] | null;
  member_no?: number | null;
}

/** every column a profile is drawn from — one list, so no read can forget one
 *  (the photos slice found a read that had its own list and never got avatar_path) */
export const PROFILE_COLUMNS = "id, full_name, role, city, avatar_path, about, age, socials, styles, member_no";

const toSocials = (raw: unknown): SocialLink[] =>
  Array.isArray(raw)
    ? raw
        .filter((x): x is { platform: unknown; url: unknown } => Boolean(x) && typeof x === "object")
        .map((x) => ({ platform: String(x.platform ?? ""), url: String(x.url ?? "") }))
        .filter((x) => x.platform && x.url)
    : [];

export const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  fullName: row.full_name,
  role: row.role,
  city: row.city,
  avatarPath: row.avatar_path ?? null,
  about: row.about ?? null,
  age: row.age == null ? null : Number(row.age),
  socials: toSocials(row.socials),
  styles: Array.isArray(row.styles) ? row.styles : [],
  memberNo: row.member_no == null ? null : Number(row.member_no),
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

export interface MyProfileInput {
  fullName: string;
  city: string | null;
  age: number | null;
  about: string | null;
  socials: SocialLink[];
  styles: string[];
}

/** The one door for what a person says about themselves (S_profiletab's Edit
 *  profile, the links sheet and the styles sheet all land here). The RPC is
 *  scoped to auth.uid() and validates the shape server-side; a mis-shaped link
 *  or an impossible age is refused with a sentence. */
export async function updateMyProfile(supabase: SupabaseClient, input: MyProfileInput): Promise<void> {
  const { error } = await supabase.rpc("update_my_profile", {
    p_full_name: input.fullName,
    p_city: input.city,
    p_age: input.age,
    p_about: input.about,
    p_socials: input.socials,
    p_styles: input.styles,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** The Artist tools switch (prototype 8850-8870): "Dancer is who you are; Artist
 *  is a TOOLSET on that same profile — never a second identity." The role is
 *  the person's own row, writable under Step 1's own-row policy; `id = me` is
 *  said out loud. A studio OWNER's role is not switched here (the prototype hides
 *  the strip on a studio, 8856). */
export async function setMyRole(supabase: SupabaseClient, role: "dancer" | "trainer"): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("not signed in");
  }
  const { error } = await supabase.from("profiles").update({ role }).eq("id", user.id).is("deleted_at", null);
  if (error) {
    throw new Error(`profiles.setRole failed: ${error.message}`);
  }
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
