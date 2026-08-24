import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClassDetail } from "@/features/classes/components/ClassDetail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassRegister } from "@/repositories/attendance";
import { findClassBySlug } from "@/repositories/classes";
import { countEnrolledBySession, findMyEnrolledSessionIds } from "@/repositories/enrollments";
import { findPaidReceiptByEnrollment } from "@/repositories/payments";
import { findMyMembershipRole } from "@/repositories/tenants";
import type { EnrollmentStatus } from "@/types/enrollment";

/** The class detail page at its booking link — /c/{slug} (prototype S_class; the
 *  link grammar is shareRecOf's danceos.in/c/{slug}). Works signed out: RLS shows
 *  the public only published classes of listed tenants, so a draft's link 404s for
 *  strangers and resolves for the studio's own members. */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{4,38}[a-z0-9]$/;

/* one lookup shared by the page and its metadata */
const loadClass = cache(async (slug: string) => {
  const supabase = await createSupabaseServerClient();
  return findClassBySlug(supabase, slug);
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return { title: "Class — DanceOS" };
  const danceClass = await loadClass(slug);
  if (!danceClass) return { title: "Class — DanceOS" };
  return {
    title: `${danceClass.title} — ${danceClass.tenantName} · DanceOS`,
    description: `Book ${danceClass.title} at ${danceClass.tenantName}${danceClass.tenantCity ? `, ${danceClass.tenantCity}` : ""} on DanceOS.`,
  };
}

const isLiveNow = (startsAt: string, endsAt: string): boolean => {
  const now = Date.now();
  return new Date(startsAt).getTime() <= now && now <= new Date(endsAt).getTime();
};

/* where the clock stands on the session — the attendance strip only SAYS which
   moment you are in; the check-in window itself is enforced by the RPCs */
const phaseOf = (startsAt: string | undefined, endsAt: string | undefined): "upcoming" | "live" | "ended" => {
  if (!startsAt || !endsAt) return "upcoming";
  const now = Date.now();
  if (now > new Date(endsAt).getTime()) return "ended";
  if (now >= new Date(startsAt).getTime()) return "live";
  return "upcoming";
};

export default async function ClassSharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    notFound();
  }

  const danceClass = await loadClass(slug);
  if (!danceClass) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sessionId = danceClass.session?.id ?? null;
  const [counts, mine, role] = await Promise.all([
    sessionId ? countEnrolledBySession(supabase, [sessionId]) : Promise.resolve(new Map<string, number>()),
    user
      ? findMyEnrolledSessionIds(supabase)
      : Promise.resolve(new Map<string, { id: string; status: EnrollmentStatus }>()),
    user ? findMyMembershipRole(supabase, danceClass.tenantId) : Promise.resolve(null),
  ]);

  const filled = sessionId ? counts.get(sessionId) ?? 0 : 0;
  const liveNow = danceClass.session
    ? isLiveNow(danceClass.session.startsAt, danceClass.session.endsAt)
    : false;
  const myBooking = sessionId ? mine.get(sessionId) ?? null : null;
  const canManage = role === "owner" || role === "trainer";

  // the paid side of the viewer's booking — feeds the invoice + refund sheets
  const receipt =
    myBooking && danceClass.priceInr > 0
      ? await findPaidReceiptByEnrollment(supabase, myBooking.id)
      : null;

  // the live register + waitlist queue — only people who can run it get it
  const register = canManage ? await findClassRegister(supabase, danceClass.id) : null;

  return (
    <ClassDetail
      danceClass={danceClass}
      filled={filled}
      liveNow={liveNow}
      isSignedIn={Boolean(user)}
      isMember={role !== null}
      canManage={canManage}
      mine={myBooking}
      receipt={receipt}
      sessionPhase={phaseOf(danceClass.session?.startsAt, danceClass.session?.endsAt)}
      register={register}
    />
  );
}
