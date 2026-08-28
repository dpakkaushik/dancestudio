import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CrewPublicPage } from "@/features/crews/components/CrewPublicPage";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findCrewById, findCrewEntries, findCrewMembers } from "@/repositories/crews";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stampNowIso = (): string => new Date().toISOString();

const loadCrew = cache(async (crewId: string) => {
  const supabase = await createSupabaseServerClient();
  return findCrewById(supabase, crewId);
});

export async function generateMetadata({ params }: { params: Promise<{ crewId: string }> }): Promise<Metadata> {
  const { crewId } = await params;
  if (!UUID_RE.test(crewId)) return { title: "Crew — DanceOS" };
  const crew = await loadCrew(crewId);
  return crew ? { title: `${crew.name} — Crew · DanceOS`, description: `${crew.style} crew in ${crew.city}, on DanceOS.` } : { title: "Crew — DanceOS" };
}

/** A crew's public page, for anybody — a stranger, a member, or its leader.
 *  Works signed out: RLS shows the crew and its CONFIRMED roster to everyone. */
export default async function CrewPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  if (!UUID_RE.test(crewId)) {
    notFound();
  }
  const crew = await loadCrew(crewId);
  if (!crew) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [members, entries] = await Promise.all([findCrewMembers(supabase, crewId), findCrewEntries(supabase, crewId)]);
  /* the public page prints the confirmed; the leader's own asked rows are the desk's business */
  const confirmed = members.filter((m) => m.status === "confirmed");
  const viewer = user ? (crew.leaderId === user.id ? "leader" : confirmed.some((m) => m.userId === user.id) ? "member" : "other") : "other";
  return <CrewPublicPage crew={crew} members={confirmed} entries={entries} viewer={viewer} todayKey={dayKeyOf(stampNowIso())} />;
}
