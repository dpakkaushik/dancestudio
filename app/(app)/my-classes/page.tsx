import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { ClassesHome, type ClassesView, type RunningItem, type TimelineItem } from "@/features/classes/components/ClassesHome";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { doorOpen, needLinksOf, runningWhen, timeGroupOf } from "@/features/classes/classesScreen";
import { STAGES, type ClassStage } from "@/features/classes/stages";
import { EnrollButton } from "@/features/classBookings/components/EnrollButton";
import { DeskHero, DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { PersonAskSettings } from "@/features/inbox/components/AskSettings";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests, isClassAsk } from "@/features/inbox/requestItems";
import { DeskTop } from "@/components/ui/DeskSections";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { countCheckedInBySession } from "@/repositories/attendance";
import { findAskedClassPeopleForBusinesses, findClassArtists, findMyConfirmedClassPeople, findMyPendingClassPeople } from "@/repositories/classPeople";
import { findClassPublishState, findClassesByBusiness, findMyVenueAsks, findWhyNoClass } from "@/repositories/classes";
import { countEnrolledBySession, findMyClassBookings } from "@/repositories/classBookings";
import { findMyMemberships } from "@/repositories/businesses";
import { findMyInboxOff } from "@/repositories/askSettings";
import { findRefundsByBusiness } from "@/repositories/refunds";
import { askToTileClass } from "@/types/classPerson";
import type { DanceClass } from "@/types/class";
import type { MyClassBooking } from "@/types/classBooking";

/* the clock lives outside the component (react-hooks/purity) */
const stampNow = (): number => Date.now();

const toTileClass = (e: MyClassBooking): DanceClass => ({
  id: e.classId,
  businessId: "",
  owner: e.owner,
  venue: e.venue,
  title: e.title,
  shareSlug: e.shareSlug,
  style: e.style,
  level: e.level,
  room: e.room,
  // the tile draws the room's NAME and its own poster from the title — the
  // booking row carries neither id
  roomId: null,
  poster: null,
  posterPath: e.posterPath,
  priceInr: e.priceInr,
  capacity: e.capacity,
  status: e.classStatus,
  session: { id: e.sessionId, startsAt: e.startsAt, endsAt: e.endsAt },
  venueBusinessId: null,
  venueStatus: null,
  lat: null,
  lng: null,
  mapsUrl: null,
  /* a card stands in for the class; whose pass pays is the class’s own answer,
     read on its page — these carry the column defaults so the shape matches */
  allowsStudioMemberships: true,
  allowsArtistMemberships: false,
});

/** YOUR CLASSES — the Home grid's Classes tile.
 *
 *  ⚠⚠ REIMAGINED 11 Oct 2026 (the user's four choices — `ClassesHome` says
 *  what each band is). The five columns of the morning (My classes · Teaching ·
 *  Assisting · Booked · Requests, each Upcoming · Past) are ONE TIMELINE with
 *  chips — All · Booked · Teaching · Assisting, and Mine for somebody with an
 *  artist page, which is the stage board of what they run. The asks waiting on
 *  you are the Needs-you strip on top; every ask, answered ones too, with the
 *  teach / assist switches, is `?show=requests`.
 *  ⚠ The old addresses keep landing (Rule 14): `?show=manage` is Mine for an
 *  artist and Teaching for anybody else, `?show=assist` is Assisting,
 *  `?show=requests` the request history. */
type Show = ClassesView | "requests";

export default async function MyClassesPage({ searchParams }: { searchParams: Promise<{ show?: string | string[]; kind?: string | string[]; new?: string | string[]; stage?: string | string[] }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  if (one(params.kind) === "event") {
    /* the old Events filter of this page (Rule 14: a link is a promise) */
    redirect("/");
  }
  const rawShow = one(params.show);
  /* the Add class sheet, opened from Mine (22 Sep 2026) */
  const opening = one(params.new) === "1";
  const rawStage = one(params.stage);
  const initialStage: ClassStage | "all" = (STAGES as string[]).includes(rawStage ?? "") ? (rawStage as ClassStage) : "all";

  const ALL = ["asked", "confirmed", "rejected"] as const;
  const [class_bookings, artistOn, assistantOn, memberships, asksIn, inboxOff] = await Promise.all([
    findMyClassBookings(supabase),
    findMyConfirmedClassPeople(supabase, "artist"),
    findMyConfirmedClassPeople(supabase, "assistant"),
    findMyMemberships(supabase),
    /* every ask put to you, answered and withdrawn ones too — the history keeps
       them; the Needs-you strip draws only the ones still asked */
    findMyPendingClassPeople(supabase, [...ALL], { withdrawn: true }).catch(() => []),
    findMyInboxOff(supabase, user.id),
  ]);
  const myPage = memberships.find((m) => m.memberRole === "owner" && m.business.type === "artist_page")?.business ?? null;
  const artist = Boolean(myPage);

  /* the asks your own PAGE sent, its classes, what each still waits on, and its
     refund queue. Read only when there is a page. */
  const [asksOut, venueOut, myPageClasses, pageState, whyNoClass, pageRefunds] = myPage
    ? await Promise.all([
        findAskedClassPeopleForBusinesses(supabase, [myPage.id], [...ALL], { withdrawn: true }).catch(() => []),
        findMyVenueAsks(supabase, [myPage.id]).catch(() => []),
        findClassesByBusiness(supabase, myPage.id).catch(() => []),
        findClassPublishState(supabase, myPage.id).catch(() => new Map()),
        findWhyNoClass(supabase, myPage.id),
        findRefundsByBusiness(supabase, myPage.id).catch(() => []),
      ])
    : [[], [], [], new Map(), null, []];

  const { requestsIn, requestsOut } = buildRequests({ classPeopleIn: asksIn, classPeopleOut: asksOut, venueOut });
  const waitingOnYou = requestsIn.filter((r) => r.status === "asked" && isClassAsk(r));
  const waitingOut = requestsOut.filter((r) => r.status === "asked").length;

  const nowMs = stampNow();
  const nowIso = new Date(nowMs).toISOString();

  /* ⚠ YOUR OWN PAGE'S CLASSES ARE TEACHING TOO — you teach every one of them.
     The confirmed artist rows for them are left out so nothing is drawn twice;
     the drafts stay on the board (Mine), where their stage is the point. */
  const ownIds = new Set(myPageClasses.map((c) => c.id));
  const teaching = artistOn.filter((c) => !ownIds.has(c.classId));
  const assisting = assistantOn;
  const ownLive = myPageClasses.filter((c) => c.status !== "draft");

  /* the teacher each card wears, the seats on each bar, and how many are in the
     room for every class whose door is open — one read each */
  const sessionIds = [
    ...class_bookings.map((e) => e.sessionId),
    ...teaching.map((c) => c.sessionId),
    ...assisting.map((c) => c.sessionId),
    ...myPageClasses.map((c) => c.session?.id ?? null),
  ].filter((s): s is string => Boolean(s));
  const reqClassIds = [...requestsIn, ...requestsOut].map((r) => r.danceClass?.id).filter((x): x is string => Boolean(x));
  /* who runs the door on what: your own page's classes, and a class you are on
     with the attendance job (an artist is born holding it, 28 Sep 2026) */
  const doorRows: Array<{ key: string; title: string; slug: string; startsAt: string; endsAt: string; sessionId: string; capacity: number; canDoor: boolean; role: string }> = [
    ...ownLive
      .filter((c) => c.session && doorOpen(c.session.startsAt, c.session.endsAt, nowMs))
      .map((c) => ({ key: `own-${c.id}`, title: c.title, slug: c.shareSlug, startsAt: c.session!.startsAt, endsAt: c.session!.endsAt, sessionId: c.session!.id, capacity: c.capacity, canDoor: true, role: "Your class" })),
    ...teaching
      .filter((c) => c.sessionId && doorOpen(c.startsAt, c.endsAt, nowMs))
      .map((c) => ({ key: `teach-${c.id}`, title: c.classTitle, slug: c.classShareSlug, startsAt: c.startsAt!, endsAt: c.endsAt!, sessionId: c.sessionId!, capacity: c.classCapacity, canDoor: c.canAttendance, role: "Teaching" })),
    ...assisting
      .filter((c) => c.sessionId && doorOpen(c.startsAt, c.endsAt, nowMs))
      .map((c) => ({ key: `assist-${c.id}`, title: c.classTitle, slug: c.classShareSlug, startsAt: c.startsAt!, endsAt: c.endsAt!, sessionId: c.sessionId!, capacity: c.classCapacity, canDoor: c.canAttendance, role: "Assisting" })),
  ];
  const [cardArtists, seats, inRoom] = await Promise.all([
    findClassArtists(supabase, [...new Set([...class_bookings.map((e) => e.classId), ...teaching.map((c) => c.classId), ...assisting.map((c) => c.classId), ...reqClassIds, ...myPageClasses.map((c) => c.id)])]),
    countEnrolledBySession(supabase, [...new Set(sessionIds)]).catch(() => new Map<string, number>()),
    countCheckedInBySession(supabase, doorRows.filter((d) => d.canDoor).map((d) => d.sessionId)),
  ]);
  const seatsOf = (sessionId: string | null) => (sessionId ? (seats.get(sessionId) ?? 0) : 0);

  const running: RunningItem[] = doorRows
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((d) => ({
      key: d.key,
      title: d.title,
      path: `/c/${d.slug}`,
      when: runningWhen(d.startsAt, d.endsAt, nowMs),
      started: Date.parse(d.startsAt) <= nowMs,
      booked: seatsOf(d.sessionId),
      capacity: d.capacity,
      checkedIn: d.canDoor ? (inRoom.get(d.sessionId) ?? 0) : null,
      canDoor: d.canDoor,
      role: d.role,
    }));

  /* ── THE TIMELINE — one list, every card wearing what it is to you ───────── */
  const started = (startsAt: string | null) => startsAt !== null && Date.parse(startsAt) <= nowMs;
  const timeline: TimelineItem[] = [
    ...class_bookings.map((e) => {
      const group = timeGroupOf(e.startsAt, e.endsAt, nowMs);
      return {
        key: `booked-${e.id}`,
        group,
        rel: "booked" as const,
        startsAt: e.startsAt,
        node: (
          <ClassTile
            danceClass={toTileClass(e)}
            filled={seatsOf(e.sessionId)}
            artist={cardArtists.get(e.classId) ?? null}
            city={e.businessCity}
            href={`/c/${e.shareSlug}`}
            relation="booked"
            /* ⚠ A CLASS THAT IS OVER OFFERS NO WAY OUT OF ITS SEAT (4 Oct 2026);
               a started one offers no Cancel (6 Oct 2026) */
            actions={group === "past" ? undefined : <EnrollButton sessionId={e.sessionId} isFull={false} isSignedIn mine={{ id: e.id, status: e.status }} priceInr={e.priceInr} shareSlug={e.shareSlug} started={started(e.startsAt)} />}
          />
        ),
      };
    }),
    ...ownLive.map((c) => ({
      key: `own-${c.id}`,
      group: timeGroupOf(c.session?.startsAt ?? null, c.session?.endsAt ?? null, nowMs),
      rel: "teaching" as const,
      startsAt: c.session?.startsAt ?? null,
      node: <ClassTile danceClass={c} filled={seatsOf(c.session?.id ?? null)} artist={cardArtists.get(c.id) ?? null} href={`/c/${c.shareSlug}`} relation="teaching" />,
    })),
    ...teaching.map((c) => ({
      key: `teach-${c.id}`,
      group: timeGroupOf(c.startsAt, c.endsAt, nowMs),
      rel: "teaching" as const,
      startsAt: c.startsAt,
      node: <ClassTile danceClass={askToTileClass(c)} filled={seatsOf(c.sessionId)} artist={cardArtists.get(c.classId) ?? null} city={c.businessCity} href={`/c/${c.classShareSlug}`} relation="teaching" />,
    })),
    ...assisting.map((c) => ({
      key: `assist-${c.id}`,
      group: timeGroupOf(c.startsAt, c.endsAt, nowMs),
      rel: "assisting" as const,
      startsAt: c.startsAt,
      node: <ClassTile danceClass={askToTileClass(c)} filled={seatsOf(c.sessionId)} artist={cardArtists.get(c.classId) ?? null} city={c.businessCity} href={`/c/${c.classShareSlug}`} relation="assisting" />,
    })),
  ]
    /* soonest first; what is past, most recent first */
    .sort((a, b) => (a.group === "past" && b.group === "past" ? (b.startsAt ?? "").localeCompare(a.startsAt ?? "") : (a.startsAt ?? "9").localeCompare(b.startsAt ?? "9")))
    .map(({ key, group, rel, node }) => ({ key, group, rel, node }));

  /* ── WHERE THE PAGE OPENS ──────────────────────────────────────────────── */
  const views: ClassesView[] = artist ? ["all", "booked", "teaching", "assisting", "mine"] : ["all", "booked", "teaching", "assisting"];
  const fromOld: Show | null = rawShow === "assist" ? "assisting" : rawShow === "manage" ? (artist ? "mine" : "teaching") : null;
  const named = (fromOld ?? ([...views, "requests"] as string[]).find((k) => k === rawShow) ?? null) as Show | null;
  /* a stage named in the address is the board's — open Mine for it */
  const show: Show = named ?? (artist && initialStage !== "all" ? "mine" : "all");

  const state = Object.fromEntries(pageState);
  const top = <DeskHero tool="classes" as="h1" margin="0" />;
  const shell = (children: React.ReactNode) => (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "2px 16px 40px", boxSizing: "border-box" }}>{children}</div>
  );

  /* ── THE REQUEST HISTORY — every ask, both ways, answered ones too ─────── */
  if (show === "requests") {
    return shell(
      <>
        <DeskTop style={{ paddingBottom: 12 }}>
          {top}
          <Link href="/my-classes" data-testid="back-to-classes" style={{ display: "inline-block", marginTop: 10, fontSize: 12, fontWeight: 800, color: "var(--text)", textDecoration: "none", padding: "8px 13px", borderRadius: 999, border: "1.5px solid var(--el)", background: "var(--card)" }}>
            ‹ Back to classes
          </Link>
        </DeskTop>
        <InboxScreen
          embed
          accent={DOS_TOOLS.classes.c}
          requestsIn={requestsIn}
          requestsOut={requestsOut}
          artists={Object.fromEntries(cardArtists)}
          enquiriesIn={[]}
          enquiriesOut={[]}
          noEnquiries
          nowIso={nowIso}
          requestSettings={<PersonAskSettings section="requests" off={inboxOff} />}
        />
      </>
    );
  }

  const board =
    myPage ? (
      <ClassesManager
        embedded
        businessId={myPage.id}
        classes={myPageClasses}
        filledBySession={Object.fromEntries(seats)}
        artists={Object.fromEntries(cardArtists)}
        publishState={state}
        whyNoClass={whyNoClass}
        nowIso={nowIso}
        initialStage={initialStage}
      />
    ) : null;

  const needLinks = myPage
    ? needLinksOf({
        classes: myPageClasses,
        state,
        nowMs,
        businessId: myPage.id,
        canEdit: true,
        readyHref: "/my-classes?show=mine&stage=ready",
        refunds: pageRefunds,
        refundsHref: `/business/${myPage.id}/refunds`,
      })
    : [];

  return shell(
    <>
      <ClassesHome
        /* the key is the SERVER's answer: a link carrying a different `?show=`
           must win over whatever chip this screen last showed */
        key={`${show}-${initialStage}`}
        mode="person"
        top={top}
        asks={waitingOnYou}
        artists={Object.fromEntries(cardArtists)}
        needLinks={needLinks}
        running={running}
        timeline={timeline}
        views={views}
        initialView={show}
        board={board}
        requestsHref="/my-classes?show=requests"
        requestsWaiting={waitingOut}
        basePath="/my-classes"
      />

      {/* ⚠ ADD CLASS OPENS OVER THIS PAGE (22 Sep 2026), from Mine */}
      {opening && myPage && !whyNoClass ? (
        <ClassForm
          businessId={myPage.id}
          businessType="artist_page"
          rooms={[]}
          isOwner
          suggestedStyles={myPage.styles}
          sheet
          /* the studios this artist OWNS (26 Sep 2026): a class held in one of
             them needs no request, and the form says so */
          ownedStudioIds={memberships.filter((m) => m.memberRole === "owner" && m.business.type === "studio").map((m) => m.business.id)}
        />
      ) : null}
    </>
  );
}
