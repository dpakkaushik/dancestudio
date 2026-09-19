import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClassDetail } from "@/features/classes/components/ClassDetail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findArtistPageOwner } from "@/repositories/publicOrganization";
import { canSetClassRoutines, findClassRoutines, findMyRoutines } from "@/repositories/routines";
import { findClassRegister } from "@/repositories/attendance";
import { findClaimsByClass } from "@/repositories/claims";
import { findClassBySlug } from "@/repositories/classes";
import { countEnrolledBySession, findMyEnrolledSessionIds } from "@/repositories/enrollments";
import { findClassMoney, findPaidReceiptByEnrollment, findPaidUserIdsBySession } from "@/repositories/payments";
import { findRefundsByClass } from "@/repositories/refunds";
import { findRoomById } from "@/repositories/rooms";
import { findMyMembershipRole } from "@/repositories/tenants";
import type { EnrollmentStatus } from "@/types/enrollment";

/** The class detail page at its booking link — /c/{slug} (prototype S_class; the
 *  link grammar is shareRecOf's danceos.in/c/{slug}). Works signed out: RLS shows
 *  the public only published classes of listed businesses, so a draft's link 404s for
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

  /* ONE ROUND TRIP FOR THE FIVE INDEPENDENT READS (19 Sep 2026, the user: "make
     app snappier") — they used to run one after another, four serial waits on
     the most-linked page in the app. The receipt (the paid side of the viewer's
     booking — the invoice and refund sheets); the live register and waitlist
     queue, only for people who can run it, and on a priced class who has paid
     for their seat; who is on the class and what the room has in it (RLS
     decides what the viewer may see: the public gets confirmed claims on
     published classes only); and, for an artist's class, WHOSE profile the
     place row opens — the person behind the artist page, so the link never
     goes through the /artist redirect. */
  const [receipt, register, paidUserIds, claims, room, ownerId, routines, myRoutines, canSetRoutines] = await Promise.all([
    myBooking && danceClass.priceInr > 0 ? findPaidReceiptByEnrollment(supabase, myBooking.id) : Promise.resolve(null),
    canManage ? findClassRegister(supabase, danceClass.id) : Promise.resolve(null),
    canManage && sessionId && danceClass.priceInr > 0 ? findPaidUserIdsBySession(supabase, sessionId) : Promise.resolve(new Set<string>()),
    findClaimsByClass(supabase, danceClass.id),
    danceClass.roomId ? findRoomById(supabase, danceClass.roomId) : Promise.resolve(null),
    danceClass.tenantType === "artist_page" ? findArtistPageOwner(supabase, danceClass.tenantId).catch(() => null) : Promise.resolve(null),
    /* WHAT THIS CLASS IS TAUGHT FROM (19 Sep 2026): the routines on it — RLS
       hands them to anybody who may read the class — the viewer's OWN routines
       for the picker, and whether they may change what is on it at all */
    findClassRoutines(supabase, danceClass.id).catch(() => []),
    user ? findMyRoutines(supabase).catch(() => []) : Promise.resolve([]),
    user ? canSetClassRoutines(supabase, danceClass.id).catch(() => false) : Promise.resolve(false),
  ]);
  const myClaim = user ? claims.find((cl) => cl.userId === user.id) ?? null : null;

  /* Who may answer a refund request: the owner, or somebody holding the refunds
     job on this class (prototype 12710). Deliberately NOT every trainer — the
     job is grantable per class precisely because settling money is not implied
     by being a trainer. The RPCs re-check all of this server-side; this only
     decides whether the tab is worth drawing. */
  const canSettleRefunds =
    role === "owner" ||
    (myClaim?.status === "confirmed" && myClaim.canRefunds && danceClass.priceInr > 0);
  /* What the class made is the OWNER's figure alone — the prototype puts the
     Earnings segment behind `isMine` (SEGS 11757) while Attendance and Refunds
     ride the grantable jobs beside it. A trainer running the register has no
     business reading the studio's take, which is the same line /business/{id}/earnings
     already draws. Both reads in one round trip. */
  const [refunds, classMoney] = await Promise.all([
    canSettleRefunds ? findRefundsByClass(supabase, danceClass.id) : Promise.resolve([]),
    role === "owner" ? findClassMoney(supabase, danceClass.id) : Promise.resolve(null),
  ]);

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
      claims={claims}
      myClaim={myClaim}
      roomAmenities={room?.amenities ?? []}
      refunds={refunds}
      canSettleRefunds={canSettleRefunds}
      classMoney={classMoney}
      paidUserIds={[...paidUserIds]}
      /* 18 Sep 2026: the owner hands out jobs; the owner or the confirmed teacher adds assistants */
      isOwner={role === "owner"}
      canAddAssistant={role === "owner" || (myClaim?.kind === "artist" && myClaim.status === "confirmed")}
      /* an artist's class at their own place opens the ARTIST'S profile from the place row (19 Sep 2026) */
      ownerHref={ownerId ? `/person/${ownerId}` : null}
      routines={routines}
      myRoutines={myRoutines}
      canSetRoutines={canSetRoutines}
    />
  );
}
