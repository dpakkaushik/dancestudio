import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findCrewById } from "@/repositories/crews";
import type { Crew } from "@/types/crew";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** THE LEADER'S PAGES, AND NOBODY ELSE'S (S_crewmanage 16318). The crew home, its
 *  Team and Events desks and its inbox all open the same way: a real crew id, a
 *  signed-in caller, and the caller is the leader — a member is sent to the crew's
 *  public page instead. One guard, four routes (18 Sep 2026). */
export async function requireLedCrew(crewId: string): Promise<{ supabase: SupabaseClient; userId: string; crew: Crew }> {
  if (!UUID_RE.test(crewId)) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const crew = await findCrewById(supabase, crewId);
  if (!crew) {
    notFound();
  }
  if (crew.leaderId !== user.id) {
    redirect(`/crew/${crewId}`);
  }
  return { supabase, userId: user.id, crew };
}
