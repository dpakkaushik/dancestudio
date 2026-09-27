"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPracticePeople } from "@/repositories/crewPractices";
import type { PracticePerson } from "@/types/crewPractice";

/** THE REGISTER, READ WHEN IT IS ASKED FOR (27 Sep 2026) — the same shape as
 *  `loadFollowersAction`, and for the same reason: a crew with twenty practices
 *  would otherwise cost twenty roster reads on every visit to the desk, for a
 *  panel most people never open. One read, only on the press.
 *
 *  ⚠ THE SERVER RE-CHECKS NOTHING AND ADDS NO SECOND GATE. `practice_people` is
 *  a definer function that answers only for somebody on the crew — its own
 *  `is_on_crew(p.crew_id)` — so a forged practice id hands back an EMPTY LIST
 *  rather than somebody else's roster. The ceiling is the database's, as it
 *  should be, and a gate repeated here is a gate that can drift from it. */
export async function findPracticePeopleAction(raw: unknown): Promise<PracticePerson[]> {
  const parsed = z.object({ practiceId: z.string().uuid() }).safeParse(raw);
  if (!parsed.success) return [];
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return findPracticePeople(supabase, parsed.data.practiceId);
}
