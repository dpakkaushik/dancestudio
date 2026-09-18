"use server";

import { z } from "zod";
import { LIMITS, withinLimit } from "@/lib/rateLimit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findArtistIds, findProfileById, findRecentlyAskedPeople, searchProfiles } from "@/repositories/profiles";
import type { Profile } from "@/types/profile";

/** SEARCH DANCEOS — the one people search the pickers share (prototype
 *  dosDancers 16413: "it searches DanceOS now … Nobody is added by this"). A
 *  read, for signed-in people only; the write that follows a pick is somebody
 *  else's ask. Since 19 Sep 2026 the picker has three ways in — a name or a
 *  mobile number typed, the three people you asked most recently, and a scanned
 *  profile link — and each is one action here. */

export interface PeopleSearchResult {
  /** each with the plan's word, so a picker can print Artist beside the right names */
  people: Array<Profile & { isArtist: boolean }>;
  error: string | null;
}

const schema = z.object({
  term: z.string().trim().min(2).max(60),
  exclude: z.array(z.string().uuid()).max(100).optional(),
});

export async function searchPeopleAction(input: { term: string; exclude?: string[] }): Promise<PeopleSearchResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { people: [], error: null };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { people: [], error: "Sign in to search DanceOS" };
  }
  /* sixty searches a minute is typing; more is a script (18 Sep 2026) */
  if (!(await withinLimit(supabase, LIMITS.peopleSearch))) {
    return { people: [], error: LIMITS.peopleSearch.words };
  }
  try {
    const people = await searchProfiles(supabase, parsed.data.term, parsed.data.exclude ?? []);
    return { people, error: null };
  } catch (error: unknown) {
    return { people: [], error: error instanceof Error ? error.message : "Search failed" };
  }
}

const recentSchema = z.object({
  exclude: z.array(z.string().uuid()).max(100).optional(),
});

/** RECENTLY ASKED — the three people this account put on a class or a crew
 *  most recently (19 Sep 2026). Read only; an empty answer is not an error. */
export async function recentPeopleAction(input: { exclude?: string[] }): Promise<PeopleSearchResult> {
  const parsed = recentSchema.safeParse(input);
  if (!parsed.success) {
    return { people: [], error: null };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { people: [], error: null };
  }
  try {
    const people = await findRecentlyAskedPeople(supabase, parsed.data.exclude ?? []);
    return { people, error: null };
  } catch {
    /* a suggestion that cannot be read is no suggestion — the search still works */
    return { people: [], error: null };
  }
}

const lookupSchema = z.object({
  userId: z.string().uuid(),
});

/** ONE PERSON, BY THE ID A SCANNED PROFILE LINK CARRIES (19 Sep 2026). The
 *  same read the person page makes, so a stranger to DanceOS or an organization
 *  (not a person to pick) comes back as nobody. */
export async function lookupPersonAction(input: { userId: string }): Promise<{ person: (Profile & { isArtist: boolean }) | null; error: string | null }> {
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) {
    return { person: null, error: "That is not a DanceOS profile link" };
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { person: null, error: "Sign in to search DanceOS" };
  }
  if (!(await withinLimit(supabase, LIMITS.peopleSearch))) {
    return { person: null, error: LIMITS.peopleSearch.words };
  }
  try {
    const profile = await findProfileById(supabase, parsed.data.userId);
    if (!profile || profile.role === "org" || profile.id === user.id) {
      return { person: null, error: "Nobody on DanceOS at that link" };
    }
    const artists = await findArtistIds(supabase, [profile.id]);
    return { person: { ...profile, isArtist: artists.has(profile.id) }, error: null };
  } catch (error: unknown) {
    return { person: null, error: error instanceof Error ? error.message : "Lookup failed" };
  }
}
