import { notFound, redirect } from "next/navigation";
import { StudentRecordScreen } from "@/features/leads/components/StudentRecordScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";
import { findStudentRecord } from "@/repositories/studentRecord";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ONE STUDENT, FROM THIS BUSINESS'S SIDE (3 Oct 2026) — the student card's
 *  Stats and Membership buttons open its two segments (`?show=stats` /
 *  `?show=membership`).
 *
 *  ⚠ THE SAME GATE AS THE STUDENTS DESK, re-checked here rather than trusted
 *  from the card: only a seat that RUNS the business (owner or manager) reads a
 *  student's record — a URL is a request, never an authority. */
export default async function StudentRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; userId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessId, userId } = await params;
  if (!UUID_RE.test(businessId) || !UUID_RE.test(userId)) {
    notFound();
  }
  const show = (await searchParams).show === "membership" ? "membership" : "stats";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }

  const record = await findStudentRecord(supabase, businessId, userId).catch(() => null);
  if (!record) {
    notFound();
  }

  return <StudentRecordScreen businessId={businessId} businessName={seat.business.name} record={record} show={show} />;
}
