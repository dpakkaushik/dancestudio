import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/classBookings/components/EnrollButton";
import { WhenColumns } from "@/features/classBookings/components/WhenColumns";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { DeskHero, DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { PersonAskSettings } from "@/features/inbox/components/AskSettings";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { buildRequests } from "@/features/inbox/requestItems";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClassPeopleForBusinesses, findClassArtists, findMyConfirmedClassPeople, findMyPendingClassPeople } from "@/repositories/classPeople";
import { findClassPublishState, findClassesByBusiness, findMyVenueAsks, findWhyNoClass } from "@/repositories/classes";
import { countEnrolledBySession, findMyClassBookings } from "@/repositories/classBookings";
import { findMyMemberships } from "@/repositories/businesses";
import { findMyInboxOff } from "@/repositories/askSettings";
import { askToTileClass } from "@/types/classPerson";
import type { DanceClass } from "@/types/class";
import type { MyClassBooking } from "@/types/classBooking";

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

/* ⚠ `askToTileClass` MOVED TO `types/classPerson.ts` (27 Sep 2026) — the Inbox draws
   the same card for the same ask now, and a second copy of a conversion is how
   two screens come to disagree about one class. */

/** YOUR CLASSES — the Home grid's Classes tile.
 *
 *  ⚠⚠ RE-CUT 11 Oct 2026, on the user's own answers to four questions: class
 *  requests live HERE ONLY (the Inbox points here); Teaching and Assisting are
 *  TWO columns; a register's tabs read Drafts · Upcoming · Past; and the page
 *  opens on Requests while something waits on you, otherwise on the first
 *  column. The columns are FIXED per kind of account and never appear or
 *  disappear — a badge says what is in them:
 *   · an ARTIST — My classes (their page's register) · Teaching · Assisting ·
 *     Booked · Requests;
 *   · a USER — Booked · Teaching · Assisting · Requests.
 *  Teaching, Assisting and Booked are each Upcoming · Past inside.
 *  ⚠ The old addresses keep landing (Rule 14): `?show=assist` is Assisting,
 *  `?show=manage` is My classes for an artist and Teaching for anybody else
 *  (the classes a plain user took lived under Manage until today). */
type Show = "manage" | "booked" | "teaching" | "assisting" | "requests";
const SHOWS: Record<Show, { label: string; aria: string }> = {
  manage: { label: "My classes", aria: "Manage the classes you run" },
  booked: { label: "Booked", aria: "Show the classes you booked" },
  teaching: { label: "Teaching", aria: "Show the classes you teach" },
  assisting: { label: "Assisting", aria: "Show the classes you assist on" },
  requests: { label: "Requests", aria: "Show the class requests" },
};
const showsFor = (artist: boolean): Show[] => (artist ? ["manage", "teaching", "assisting", "booked", "requests"] : ["booked", "teaching", "assisting", "requests"]);
const hrefOf = (k: Show) => `/my-classes?show=${k}`;

const emptyBox: React.CSSProperties = { textAlign: "center", padding: "40px 20px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5 };

export default async function MyClassesPage({ searchParams }: { searchParams: Promise<{ show?: string | string[]; kind?: string | string[]; new?: string | string[] }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const params = await searchParams;
  const kind = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  if (kind === "event") {
    /* the old Events filter of this page (Rule 14: a link is a promise) */
    redirect("/");
  }
  const rawShow = Array.isArray(params.show) ? params.show[0] : params.show;
  /* the Add class sheet, opened from My classes (22 Sep 2026) */
  const opening = (Array.isArray(params.new) ? params.new[0] : params.new) === "1";

  const ALL = ["asked", "confirmed", "rejected"] as const;
  const [class_bookings, artistOn, assistantOn, memberships, asksIn, inboxOff] = await Promise.all([
    findMyClassBookings(supabase),
    findMyConfirmedClassPeople(supabase, "artist"),
    findMyConfirmedClassPeople(supabase, "assistant"),
    findMyMemberships(supabase),
    /* every ask put to you, answered and withdrawn ones too — the Requests
       column keeps them under Done, as the Inbox did (19 Sep / 2 Oct 2026) */
    findMyPendingClassPeople(supabase, [...ALL], { withdrawn: true }).catch(() => []),
    /* the teach / assist switches, moved here from the Inbox with the asks */
    findMyInboxOff(supabase, user.id),
  ]);
  const myPage = memberships.find((m) => m.memberRole === "owner" && m.business.type === "artist_page")?.business ?? null;
  const artist = Boolean(myPage);

  /* the asks your own PAGE sent — a teacher or an assistant onto its class, and
     a studio's room for one. Read only when there is a page. */
  const [asksOut, venueOut, myPageClasses] = myPage
    ? await Promise.all([
        findAskedClassPeopleForBusinesses(supabase, [myPage.id], [...ALL], { withdrawn: true }).catch(() => []),
        findMyVenueAsks(supabase, [myPage.id]).catch(() => []),
        findClassesByBusiness(supabase, myPage.id).catch(() => []),
      ])
    : [[], [], []];

  /* ⚠ TEACHING IS ITS OWN COLUMN NOW (11 Oct 2026). Your OWN page's classes are
     left out of it — you are every one of their teachers by construction, and My
     classes draws them in full. */
  const soonest = (a: string | null, b: string | null) => (a ?? "9").localeCompare(b ?? "9");
  const teaching = artistOn.filter((c) => !myPage || c.businessName !== myPage.name).sort((a, b) => soonest(a.startsAt, b.startsAt));
  const assisting = [...assistantOn].sort((a, b) => soonest(a.startsAt, b.startsAt));

  const { requestsIn, requestsOut } = buildRequests({ classPeopleIn: asksIn, classPeopleOut: asksOut, venueOut });
  const waitingOnYou = requestsIn.filter((r) => r.status === "asked").length;
  const waitingOut = requestsOut.filter((r) => r.status === "asked").length;

  const order = showsFor(artist);
  const fromOld: Show | null =
    rawShow === "assist" ? "assisting" : rawShow === "manage" ? (artist ? "manage" : "teaching") : null;
  const named = (fromOld ?? (order as string[]).find((k) => k === rawShow) ?? null) as Show | null;
  /* ⚠ OPENS ON REQUESTS WHILE SOMETHING WAITS ON YOU (the user's choice) — a
     URL that names a column still wins */
  const show: Show = named ?? (waitingOnYou > 0 ? "requests" : order[0]);

  /* the teacher each card wears, and the seats on each bar — one read each */
  const seatSessionIds = [
    ...class_bookings.map((e) => e.sessionId),
    ...assisting.map((c) => c.sessionId),
    ...teaching.map((c) => c.sessionId),
  ].filter((s): s is string => Boolean(s));
  const reqClassIds = [...requestsIn, ...requestsOut].map((r) => r.danceClass?.id).filter((x): x is string => Boolean(x));
  const [cardArtists, seats] = await Promise.all([
    findClassArtists(supabase, [...new Set([...class_bookings.map((e) => e.classId), ...teaching.map((c) => c.classId), ...assisting.map((c) => c.classId), ...reqClassIds])]),
    countEnrolledBySession(supabase, seatSessionIds).catch(() => new Map<string, number>()),
  ]);
  const seatsOf = (sessionId: string | null) => (sessionId ? (seats.get(sessionId) ?? 0) : 0);

  /* THE REGISTER, read whichever column is open — every column is rendered in
     this one pass and `SegmentedPanels` picks in the browser (20 Sep 2026) */
  const manage = myPage
    ? await (async () => {
        const sessionIds = myPageClasses.map((c) => c.session?.id).filter(Boolean) as string[];
        const [counts, state, artists, whyNoClass] = await Promise.all([
          countEnrolledBySession(supabase, sessionIds),
          findClassPublishState(supabase, myPage.id).catch(() => new Map()),
          findClassArtists(supabase, myPageClasses.map((c) => c.id)),
          findWhyNoClass(supabase, myPage.id),
        ]);
        return { classes: myPageClasses, filled: Object.fromEntries(counts), state: Object.fromEntries(state), artists: Object.fromEntries(artists), whyNoClass };
      })()
    : null;

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  /* UPCOMING · PAST — the clock decides, as everywhere since 30 Sep: a class is
     past when its session has ENDED. What is coming reads soonest first, what is
     past most recent first. */
  const ended = (endsAt: string | null) => endsAt !== null && Date.parse(endsAt) <= nowMs;
  /* ⚠ A STARTED CLASS IS FINAL (6 Oct 2026): its card stays under Upcoming while
     it runs, and offers no Cancel */
  const started = (startsAt: string | null) => startsAt !== null && Date.parse(startsAt) <= nowMs;
  const bookedUpcoming = class_bookings.filter((e) => !ended(e.endsAt)).sort((a, b) => soonest(a.startsAt, b.startsAt));
  const bookedDone = class_bookings.filter((e) => ended(e.endsAt)).sort((a, b) => soonest(b.startsAt, a.startsAt));
  const teachUpcoming = teaching.filter((c) => !ended(c.endsAt));
  const teachDone = teaching.filter((c) => ended(c.endsAt)).sort((a, b) => soonest(b.startsAt, a.startsAt));
  const assistUpcoming = assisting.filter((c) => !ended(c.endsAt));
  const assistDone = assisting.filter((c) => ended(c.endsAt)).sort((a, b) => soonest(b.startsAt, a.startsAt));
  const booked = class_bookings.filter((e) => e.status === "enrolled").length;

  const claimTile = (c: (typeof teaching)[number], relation: "teaching" | "assisting") => (
    <ClassTile key={c.id} danceClass={askToTileClass(c)} filled={seatsOf(c.sessionId)} artist={cardArtists.get(c.classId) ?? null} city={c.businessCity} href={`/c/${c.classShareSlug}`} relation={relation} />
  );

  const count: Record<Show, number> = {
    manage: myPageClasses.length,
    booked,
    teaching: teaching.length,
    assisting: assisting.length,
    /* what waits — on you, and on the people your page asked */
    requests: waitingOnYou + waitingOut,
  };

  const panelOf: Record<Show, React.ReactNode> = {
    manage:
      myPage && manage ? (
        <ClassesManager embedded businessId={myPage.id} classes={manage.classes} filledBySession={{ ...Object.fromEntries(seats), ...manage.filled }} artists={manage.artists} publishState={manage.state} whyNoClass={manage.whyNoClass} nowIso={nowIso} />
      ) : null,
    teaching:
      teaching.length > 0 ? (
        <WhenColumns id="teaching" noun="classes you teach" nUp={teachUpcoming.length} nDone={teachDone.length} upcoming={teachUpcoming.map((c) => claimTile(c, "teaching"))} completed={teachDone.map((c) => claimTile(c, "teaching"))} />
      ) : (
        <div style={emptyBox}>
          Nothing you teach {artist ? "at other studios " : ""}yet. When a studio asks you to take a class, the ask arrives under Requests and you answer it there.
        </div>
      ),
    assisting:
      assisting.length > 0 ? (
        <WhenColumns id="assist" noun="classes you assist on" nUp={assistUpcoming.length} nDone={assistDone.length} upcoming={assistUpcoming.map((c) => claimTile(c, "assisting"))} completed={assistDone.map((c) => claimTile(c, "assisting"))} />
      ) : (
        <div style={emptyBox}>Nothing you assist on yet. When somebody asks you onto a class, the ask arrives under Requests and you answer it there.</div>
      ),
    booked: (
      <>
        {class_bookings.length > 0 ? (
          <WhenColumns
            id="booked"
            noun="bookings"
            nUp={bookedUpcoming.length}
            nDone={bookedDone.length}
            upcoming={bookedUpcoming.map((e) => (
              <ClassTile
                key={e.id}
                danceClass={toTileClass(e)}
                filled={seatsOf(e.sessionId)}
                artist={cardArtists.get(e.classId) ?? null}
                city={e.businessCity}
                href={`/c/${e.shareSlug}`}
                relation="booked"
                actions={<EnrollButton sessionId={e.sessionId} isFull={false} isSignedIn mine={{ id: e.id, status: e.status }} priceInr={e.priceInr} shareSlug={e.shareSlug} started={started(e.startsAt)} />}
              />
            ))}
            /* ⚠ A CLASS THAT IS OVER OFFERS NO WAY OUT OF ITS SEAT (4 Oct 2026) */
            completed={bookedDone.map((e) => (
              <ClassTile key={e.id} danceClass={toTileClass(e)} filled={seatsOf(e.sessionId)} artist={cardArtists.get(e.classId) ?? null} city={e.businessCity} href={`/c/${e.shareSlug}`} relation="booked" />
            ))}
          />
        ) : (
          <div style={emptyBox}>
            Nothing booked yet —{" "}
            <Link href="/discover?tab=classes" style={{ color: "#5AC8FA", fontWeight: 800 }}>
              find a class
            </Link>{" "}
            to get started.
          </div>
        )}
      </>
    ),
    /* ⚠⚠ THE CLASS REQUESTS (11 Oct 2026) — the Inbox's own cards, buttons and
       RPCs, drawn here rather than there: teach and assist asks put to you, and
       the teachers, assistants and rooms your page asked for */
    requests: (
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
    ),
  };

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "14px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      {/* ⚠ SWITCHING A COLUMN DOES NOT GO TO THE SERVER (20 Sep 2026): every
          column is rendered in this one pass and `SegmentedPanels` picks in the
          browser; the address follows through `history.replaceState`. */}
      <SegmentedPanels
        /* the key is the SERVER's answer: a link from elsewhere carrying a
           different `?show=` must win over whatever this control last showed */
        key={show}
        initial={show}
        sections
        top={<DeskHero tool="classes" as="h1" margin="0" />}
        segments={order.map((k) => ({ key: k, href: hrefOf(k), label: SHOWS[k].label, aria: SHOWS[k].aria, n: count[k] }))}
        panels={order.map((k) => ({ key: k, node: panelOf[k] }))}
      />

      {/* ⚠ ADD CLASS OPENS OVER THIS PAGE (22 Sep 2026), from My classes */}
      {opening && myPage && manage && !manage.whyNoClass ? (
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
    </div>
  );
}
