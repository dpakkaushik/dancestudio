import { notFound, redirect } from "next/navigation";
import { CrewManager } from "@/features/crews/components/CrewManager";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findCrewById, findCrewEntries, findCrewMembers } from "@/repositories/crews";

const stampNowIso = (): string => new Date().toISOString();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The crew desk — the leader's, and nobody else's (S_crewmanage 16318). A
 *  member who is not the leader is sent to the crew's page instead. */
export default async function CrewManagePage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
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
  const [members, entries] = await Promise.all([findCrewMembers(supabase, crewId), findCrewEntries(supabase, crewId)]);
  return <CrewManager crew={crew} members={members} entries={entries} todayKey={dayKeyOf(stampNowIso())} />;
}
