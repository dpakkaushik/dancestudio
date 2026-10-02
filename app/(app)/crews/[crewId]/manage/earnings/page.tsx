import { requireLedCrew } from "@/features/crews/server/requireLedCrew";
import { EarningsScreen } from "@/features/payouts/components/EarningsScreen";
import { asPeriod } from "@/lib/format/period";
import { findCrewEarnings } from "@/repositories/earnings";

const stampNowIso = (): string => new Date().toISOString();

/** A CREW'S EARNINGS (2 Oct 2026, the user: "earnings for crews is missing") —
 *  the leader's desk, the same screen every profile's earnings wear. What a crew
 *  takes is its enquiry money (`findCrewEarnings` says why that is the whole of
 *  it), and a crew has no expense half. */
export default async function CrewEarningsPage({ params, searchParams }: { params: Promise<{ crewId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { crewId } = await params;
  const period = asPeriod((await searchParams).period);
  const { supabase, crew } = await requireLedCrew(crewId);
  const report = await findCrewEarnings(supabase, crewId, period, stampNowIso());
  return <EarningsScreen report={report} title="Earnings" sub={`${crew.name} · what the crew was paid`} basePath={`/crews/${crewId}/manage/earnings`} noExpenses />;
}
