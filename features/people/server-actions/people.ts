"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { searchProfiles } from "@/repositories/profiles";
import type { Profile } from "@/types/profile";

/** SEARCH DANCEOS — the one people search the pickers share (prototype
 *  dosDancers 16413: "it searches DanceOS now … Nobody is added by this"). A
 *  read, for signed-in people only; the write that follows a pick is somebody
 *  else's ask. */

export interface PeopleSearchResult {
  people: Profile[];
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
  try {
    const people = await searchProfiles(supabase, parsed.data.term, parsed.data.exclude ?? []);
    return { people, error: null };
  } catch (error: unknown) {
    return { people: [], error: error instanceof Error ? error.message : "Search failed" };
  }
}
