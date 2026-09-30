import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClassDetail } from "@/features/classes/components/ClassDetail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findArtistPageOwner } from "@/repositories/businesses";
import { findPassesForSession } from "@/repositories/memberships";
import { canBookClass, noBookingWords } from "@/types/profile";
import { resolveActingAs } from "@/repositories/actingAs";
import { canSetClassRoutines, findClassRoutines, findMyRoutines } from "@/repositories/routines";
import { findClassRegister } from "@/repositories/attendance";
import { findClassPeopleByClass } from "@/repositories/classPeople";
import { findClassBySlug } from "@/repositories/classes";
import { countEnrolledBySession, findMyEnrolledSessionIds } from "@/repositories/classBookings";
import { findClassMoney, findPaidReceiptByClassBooking, findPaidUserIdsBySession } from "@/repositories/payments";
import { findRefundsByClass } from "@/repositories/refunds";
import { findRoomById } from "@/repositories/rooms";
import { reconcileRailRefunds } from "@/services/refundRail";
import { findMySeat } from "@/repositories/businesses";
import type { ClassBookingStatus } from "@/types/classBooking";

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
    title: `${danceClass.title} — ${danceClass.businessName} · DanceOS`,
    description: `Book ${danceClass.title} at ${danceClass.businessName}${danceClass.businessCity ? `, ${danceClass.businessCity}` : ""} on DanceOS.`,
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

export default async function ClassSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** ⚠ `?as=` — the profile the shelf that sent you here was being read as
     (27 Sep 2026). Carried by Discover's cards so this page cannot offer a
     button the card beside it just refused. A REQUEST, resolved against what
     the account belongs to; anything else reads as "yourself". */
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const { as } = await searchParams;
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
  /* ⚠ CLAIMS MOVED UP INTO THIS BATCH (28 Sep 2026), and it costs nothing: it
     depends only on the class's id, so it was always parallelisable. What it
     BUYS is that the viewer's own classPerson is known BEFORE the batch that decides
     whether to fetch the register — see `mayRunRegister` below. */
  const [counts, mine, seat, classPeople] = await Promise.all([
    sessionId ? countEnrolledBySession(supabase, [sessionId]) : Promise.resolve(new Map<string, number>()),
    user
      ? findMyEnrolledSessionIds(supabase)
      : Promise.resolve(new Map<string, { id: string; status: ClassBookingStatus }>()),
    /* ⚠ THE SEAT, NOT JUST ITS ROLE (28 Sep 2026) — the same one row, with the
       two STANDING grants on it, so the page can offer the register to somebody
       the Team desk gave Attendance to. Same query, no extra round trip. */
    user ? findMySeat(supabase, danceClass.businessId) : Promise.resolve(null),
    findClassPeopleByClass(supabase, danceClass.id),
  ]);

  const filled = sessionId ? counts.get(sessionId) ?? 0 : 0;
  const liveNow = danceClass.session
    ? isLiveNow(danceClass.session.startsAt, danceClass.session.endsAt)
    : false;
  const myBooking = sessionId ? mine.get(sessionId) ?? null : null;
  const role = seat?.role ?? null;
  const canManage = role === "owner" || role === "trainer";
  const myClassPerson = user ? classPeople.find((cl) => cl.userId === user.id) ?? null : null;

  /* ⚠⚠ WHO THE REGISTER IS FETCHED FOR, AND WHY THIS IS THE REAL FIX (28 Sep
     2026, the user: "when giving attendance and refunds right to assistants it
     doesnt show up when viewing the class as an assistant after confirmation").
     The Attendance TAB is drawn only when `register !== null` (ClassDetail:733),
     and this read was `canManage` alone — so an assistant holding the attendance
     job saw no tab whichever way the job had been granted, and the page's own
     `canAtt` had nothing to switch on. It is now everybody the DATABASE would
     let run it: the owner and trainers by their seat, and a confirmed assistant
     with the job either PER CLASS (`myClassPerson`) or STANDING on the Team desk
     (`seat`) — the same OR `can_run_register_for_class` applies, so the tab
     appears exactly where the RPC would answer. The RPC re-checks every row. */
  /* ⚠⚠ AND `kind === "assistant"` WENT (28 Sep 2026, the user: "as soon as the
     teacher confirms the class they should get access to attendance").
     `can_run_register_for_class` has never cared which kind the classPerson is — it
     reads a CONFIRMED row holding `can_attendance`, full stop — so that clause
     was a narrowing the database never had, and it shut out the one person the
     class is named after. It is the same mistake as the line above it in a
     second coat: the fix was written for the kind that was complained about
     (assistants) and not for the other kind that shares the rule. Found by
     driving it: `can_run_register_for_class` answered TRUE for the confirmed
     teacher while the page drew no tab at all.
     ⚠ `20260928100000` is what makes this reachable — an artist classPerson is born
     holding attendance now — and this is the half no migration could do. */
  const mayRunRegister =
    canManage ||
    (myClassPerson?.status === "confirmed" && (myClassPerson.canAttendance || Boolean(seat?.canAttendance)));

  /* ONE ROUND TRIP FOR THE FIVE INDEPENDENT READS (19 Sep 2026, the user: "make
     app snappier") — they used to run one after another, four serial waits on
     the most-linked page in the app. The receipt (the paid side of the viewer's
     booking — the invoice and refund sheets); the live register and waitlist
     queue, only for people who can run it, and on a priced class who has paid
     for their seat; who is on the class and what the room has in it (RLS
     decides what the viewer may see: the public gets confirmed classPeople on
     published classes only); and, for an artist's class, WHOSE profile the
     place row opens — the person behind the artist page, so the link never
     goes through the /artist redirect. */
  const [receipt, register, paidUserIds, room, ownerId, routines, myRoutines, canSetRoutines, passes, actingAs] = await Promise.all([
    myBooking && danceClass.priceInr > 0 ? findPaidReceiptByClassBooking(supabase, myBooking.id) : Promise.resolve(null),
    mayRunRegister ? findClassRegister(supabase, danceClass.id) : Promise.resolve(null),
    mayRunRegister && sessionId && danceClass.priceInr > 0 ? findPaidUserIdsBySession(supabase, sessionId) : Promise.resolve(new Set<string>()),
    danceClass.roomId ? findRoomById(supabase, danceClass.roomId) : Promise.resolve(null),
    danceClass.businessType === "artist_page" ? findArtistPageOwner(supabase, danceClass.businessId).catch(() => null) : Promise.resolve(null),
    /* WHAT THIS CLASS IS TAUGHT FROM (19 Sep 2026): the routines on it — RLS
       hands them to anybody who may read the class — the viewer's OWN routines
       for the picker, and whether they may change what is on it at all */
    findClassRoutines(supabase, danceClass.id).catch(() => []),
    user ? findMyRoutines(supabase).catch(() => []) : Promise.resolve([]),
    user ? canSetClassRoutines(supabase, danceClass.id).catch(() => false) : Promise.resolve(false),
    /* THE PASSES THIS VIEWER CAN SPEND HERE (19 Sep 2026): their own live
       memberships that THIS class admits, with a unit left. The database reads
       the class's two switches, so the bar never offers a pass the RPC refuses;
       nothing is asked for a viewer who is not signed in or has no seat to take. */
    user && sessionId && !myBooking ? findPassesForSession(supabase, sessionId).catch(() => []) : Promise.resolve([]),
    /* WHICH PROFILE IS READING: a business books nothing (19 Sep 2026; the test
       moved off `profiles.role` on 27 Sep, when R48 left that role with no
       holders and the gate silently open) */
    user ? resolveActingAs(supabase, as) : Promise.resolve(null),
  ]);

  /* Who may answer a refund request: the owner, or somebody holding the refunds
     job on this class (prototype 12710). Deliberately NOT every trainer — the
     job is grantable per class precisely because settling money is not implied
     by being a trainer. The RPCs re-check all of this server-side; this only
     decides whether the tab is worth drawing. */
  /* ⚠ AND THE STANDING GRANT COUNTS HERE TOO (28 Sep 2026). `can_settle_refunds_for_class`
     admits the owner, the per-class job AND `business_members.can_refunds`; this
     test knew only the first two, so a seat given Refunds on the Team desk could
     settle one through the RPC and had no tab to do it from. */
  const canSettleRefunds =
    role === "owner" ||
    (danceClass.priceInr > 0 &&
      ((myClassPerson?.status === "confirmed" && myClassPerson.canRefunds) || Boolean(seat?.canRefunds)));
  /* What the class made is the OWNER's figure alone — the prototype puts the
     Earnings segment behind `isMine` (SEGS 11757) while Attendance and Refunds
     ride the grantable jobs beside it. A trainer running the register has no
     business reading the studio's take, which is the same line /business/{id}/earnings
     already draws. Both reads in one round trip. */
  /* the class's own queue asks the rail about its pending rows first, the way
     both ledgers do (30 Sep 2026) — a refund Cashfree has paid is not "processing" */
  if (canSettleRefunds) await reconcileRailRefunds(supabase, { classId: danceClass.id });
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
      classPeople={classPeople}
      myClassPerson={myClassPerson}
      standingAttendance={Boolean(seat?.canAttendance)}
      standingRefunds={Boolean(seat?.canRefunds)}
      roomAmenities={room?.amenities ?? []}
      refunds={refunds}
      canSettleRefunds={canSettleRefunds}
      classMoney={classMoney}
      paidUserIds={[...paidUserIds]}
      /* 18 Sep 2026: the owner hands out jobs; the owner or the confirmed teacher adds assistants */
      isOwner={role === "owner"}
      canAddAssistant={role === "owner" || (myClassPerson?.kind === "artist" && myClassPerson.status === "confirmed")}
      /* an artist's class at their own place opens the ARTIST'S profile from the place row (19 Sep 2026) */
      ownerHref={ownerId ? `/person/${ownerId}` : null}
      routines={routines}
      myRoutines={myRoutines}
      canSetRoutines={canSetRoutines}
      /* a business reads this page and books nothing (19 Sep 2026, re-cut
         27 Sep onto the profile you are acting as — the role it tested was
         retired by R48 and the gate had been dead for a day) */
      viewerCanBook={canBookClass(actingAs)}
      cannotBookWhy={actingAs && !canBookClass(actingAs) ? noBookingWords(actingAs) : null}
      passes={passes}
    />
  );
}
