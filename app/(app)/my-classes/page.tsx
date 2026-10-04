import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/classBookings/components/EnrollButton";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { DeskHero } from "@/features/businesses/components/biz-kit";
import { DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AnswerAsk } from "@/features/classPeople/components/AnswerAsk";
import { findClassArtists, findMyConfirmedClassPeople, findMyPendingClassPeople } from "@/repositories/classPeople";
import { findClassPublishState, findClassesByBusiness, findWhyNoClass } from "@/repositories/classes";
import { countEnrolledBySession, findMyClassBookings } from "@/repositories/classBookings";
import { findMyMemberships } from "@/repositories/businesses";
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

/** YOUR CLASSES — the Home grid's Classes tile (18 Sep 2026, the user's list for
 *  every kind of account: "Classes — Booked, Assist", and for an artist
 *  "Manage — Create, Draft, Published, Completed"). Two segments and, for an
 *  artist with a page, one door:
 *   · BOOKED — the seats you hold (the prototype's S_bookings 6099, as before);
 *   · ASSIST — the classes somebody put you on and you said yes to, as the
 *     artist or as an assistant (a confirmed class_people row; an unanswered
 *     ask is the Inbox's, not a class you are on);
 *   · MANAGE › — your own page's register, where Create / Draft / Published /
 *     Completed already live (ClassesManager), rather than a second copy here.
 *  Events left this page for /my-events the same day, and went altogether on
 *  29 Sep 2026; a `?kind=event` link out in the world lands on Home, the way
 *  `/my-events` itself does (Rule 14). */
type Show = "booked" | "assist" | "manage";
const SHOWS: Record<Show, { label: string; aria: string }> = {
  booked: { label: "Booked", aria: "Show the classes you booked" },
  assist: { label: "Assist", aria: "Show the classes you assist on" },
  /* MANAGE, IN PLACE (18 Sep 2026, the user: "Manage class should not take to a
     separate page for artist — should be handled from within the same page"):
     the artist's own register, drawn here as a third segment */
  manage: { label: "Manage", aria: "Manage the classes you run" },
};

/** ⚠ THE ORDER IS THE ACCOUNT'S (19 Sep 2026, the user: "Manage should be first
 *  section for Artist"). Somebody who runs nothing opens this page to see what
 *  they booked, and never sees Manage at all. `?show=` is unchanged either way,
 *  so every link out in the world still lands where it always did (Rule 14).
 *
 *  ⚠⚠ "RUNS SOMETHING" IS NO LONGER "HAS AN ARTIST PAGE" (28 Sep 2026, the user:
 *  "user should also see manage tab in classes as studios can add them as the
 *  person taking the class"). A plain user CAN be the person taking a studio's
 *  class — that is what `ask_class_person(kind: 'artist')` is for — and until
 *  today the only thing Manage could mean was your own page's register, so their
 *  own class appeared under **Assist**, labelled Teaching. A tab called Assist is
 *  the wrong place for a class you are the teacher of. */
const showsFor = (runs: boolean): Show[] => (runs ? ["manage", "booked", "assist"] : ["booked", "assist"]);

/** A SECTION OF A SEGMENT — UPCOMING or COMPLETED (4 Oct 2026) — in the same
 *  micro-caps head the ASKED blocks above it wear, so one segment reads one way.
 *  An empty section says so in a line rather than vanishing, because the user
 *  asked for both sections and a missing one reads as a missing feature. */
function ClassSection({ id, title, n, empty, last = false, children }: { id: string; title: string; n: number; empty: string; last?: boolean; children: ReactNode }) {
  return (
    <section data-testid={id} aria-label={title} style={{ marginBottom: last ? 0 : 22 }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "0 0 9px" }}>
        {title.toUpperCase()} · {n}
      </div>
      {n > 0 ? children : <div style={{ fontSize: 12, color: SUB, padding: "4px 2px 2px" }}>{empty}</div>}
    </section>
  );
}

const when = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso))
    : "no date yet";

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
    /* the old Events filter of this page (Rule 14: a link is a promise). It
       pointed at `/my-events` until 29 Sep 2026; that address redirects here-ish
       too, and one hop beats two. */
    redirect("/");
  }
  const rawShow = Array.isArray(params.show) ? params.show[0] : params.show;
  /* the Add class sheet, opened from the Manage segment (22 Sep 2026) */
  const opening = (Array.isArray(params.new) ? params.new[0] : params.new) === "1";

  const [class_bookings, artistOn, assistantOn, memberships, pendingAsks] = await Promise.all([
    findMyClassBookings(supabase),
    findMyConfirmedClassPeople(supabase, "artist"),
    findMyConfirmedClassPeople(supabase, "assistant"),
    findMyMemberships(supabase),
    /* ⚠⚠ THE ASKS NOBODY HAD ANSWERED WERE NOWHERE IN THIS SECTION (30 Sep 2026).
       Both lists below are CONFIRMED rows, so a class you had been asked onto and
       not yet answered appeared on no Classes screen at all — and both empty
       states told you to go and say yes *in your Inbox*, which has been untrue
       since Step 11 gave the class page its own Accept / Reject card. They are
       the first thing in their own segment now, where the class is. */
    findMyPendingClassPeople(supabase).catch(() => []),
  ]);
  const askedToTake = pendingAsks.filter((a) => a.kind === "artist");
  const askedToAssist = pendingAsks.filter((a) => a.kind === "assistant");
  const myPage = memberships.find((m) => m.memberRole === "owner" && m.business.type === "artist_page")?.business ?? null;
  /* ⚠ MANAGE OPENS FIRST FOR SOMEBODY WHO RUNS CLASSES (20 Sep 2026, the user:
     "Manage Membership and classes to be first option in order and when opening
     the tile"). It has been first in the ORDER since 19 Sep; what it was not was
     the segment you LAND on, so an artist opening their own tile still arrived
     at other people's classes they had booked. A URL that names a segment still
     wins, so every existing link keeps landing where it always did (Rule 14). */
  /* ⚠⚠ TEACHING IS MANAGING, AND ASSISTING IS NOT (28 Sep 2026). A confirmed
     `artist` classPerson means you are the person taking that class — you run its
     register — so it belongs in Manage beside your own page's classes; an
     `assistant` classPerson is somebody helping on somebody else's class, which is
     what Assist has always meant. They were one list until today, told apart
     only by a word in the corner of each card.
     ⚠ Your OWN page's classes are excluded here rather than listed twice: you
     are every one of their confirmed teachers by construction, and the register
     below already draws them in full. */
  const teaching = artistOn
    .filter((c) => !myPage || c.businessName !== myPage.name)
    .sort((a, b) => (a.startsAt ?? "9").localeCompare(b.startsAt ?? "9"));
  const assisting = [...assistantOn].sort((a, b) => (a.startsAt ?? "9").localeCompare(b.startsAt ?? "9"));
  /* somebody with a page, or somebody a studio has put in front of a class —
     ⚠ INCLUDING ONE THEY HAVE NOT ANSWERED YET (30 Sep 2026). A plain user asked
     to take a class holds no confirmed row and owns no page, so `runs` was false,
     so Manage was not drawn, so the ask had nowhere to be answered from. The one
     person the class is named after was the one person the section had no room
     for. */
  const runs = Boolean(myPage) || teaching.length > 0 || askedToTake.length > 0;
  const show: Show =
    rawShow === "assist" ? "assist" : rawShow === "manage" && runs ? "manage" : rawShow === "booked" ? "booked" : runs ? "manage" : "booked";
  const booked = class_bookings.filter((e) => e.status === "enrolled").length;
  /* the teacher each card wears in its centre (18 Sep 2026) — one read for every segment.
     ⚠ AND THE SEATS ON THE BAR (4 Oct 2026). The bar has printed "N/M Booked"
     since the morning, and this page never passed a count, so your own booked
     card read "0/14 Booked" beside its BOOKED chip. `session_seat_counts` is the
     aggregate every public card already reads — a number, never a name. */
  const seatSessionIds = [
    ...class_bookings.map((e) => e.sessionId),
    ...assisting.map((c) => c.sessionId),
    ...askedToAssist.map((c) => c.sessionId),
    ...askedToTake.map((c) => c.sessionId),
    ...teaching.map((c) => c.sessionId),
  ].filter((s): s is string => Boolean(s));
  const [bookedArtists, seats] = await Promise.all([
    findClassArtists(supabase, [
      ...class_bookings.map((e) => e.classId),
      ...teaching.map((c) => c.classId),
      ...assisting.map((c) => c.classId),
    ]),
    countEnrolledBySession(supabase, seatSessionIds).catch(() => new Map<string, number>()),
  ]);
  const seatsOf = (sessionId: string | null) => (sessionId ? (seats.get(sessionId) ?? 0) : 0);

  /* ⚠ THE PAGE'S CLASSES ARE READ ONCE, WHICHEVER SEGMENT IS OPEN (19 Sep 2026):
     the Manage pill carries a COUNT now, so the number has to be true from the
     Booked segment too. It replaces the read the register used to make for
     itself, so Manage costs one query fewer than it did. */
  const myPageClasses = myPage ? await findClassesByBusiness(supabase, myPage.id).catch(() => []) : [];

  /* THE REGISTER, WHETHER OR NOT MANAGE IS THE OPEN SEGMENT (20 Sep 2026, the
     user: "CLASSES LAG ISSUE IS THERE WHEN SWITCHING COLUMNS").
     ⚠ It used to be read only when `show === "manage"`, which is exactly what
     made the tap lag: switching to Manage was a server round trip that then had
     to make four more queries before anything could be drawn. All three
     segments are rendered in this one pass now and `SegmentedPanels` chooses
     between them in the browser, so a tap costs NOTHING — and the cost of
     always reading it is four queries that run in parallel, on a page that
     already made six. Somebody with no artist page still reads none of it. */
  const manage =
    myPage
      ? await (async () => {
          const classes = myPageClasses;
          const sessionIds = classes.map((c) => c.session?.id).filter(Boolean) as string[];
          const [counts, state, artists, whyNoClass] = await Promise.all([
            countEnrolledBySession(supabase, sessionIds),
            findClassPublishState(supabase, myPage.id).catch(() => new Map()),
            findClassArtists(supabase, classes.map((c) => c.id)),
            /* an artist page carries a class only while the plan is live: the
               register says so BEFORE the form (18 Sep 2026) */
            findWhyNoClass(supabase, myPage.id),
          ]);
          return { classes, filled: Object.fromEntries(counts), state: Object.fromEntries(state), artists: Object.fromEntries(artists), whyNoClass };
        })()
      : null;

  /* the classes a studio put you in front of, in the register's own row shape */
  const nowIso = new Date().toISOString();

  /* ⚠ UPCOMING · COMPLETED (4 Oct 2026, the user: "Booked and assist classes to
     have Upcoming and Completed as sections"). The clock decides, as everywhere
     since 30 Sep — a class is completed when its session has ENDED, never when a
     column says so (nothing writes `status = 'completed'`). What is coming reads
     soonest first; what is done reads most recent first. A row with no session
     yet is still to come. */
  const nowMs = Date.parse(nowIso);
  const ended = (endsAt: string | null) => endsAt !== null && Date.parse(endsAt) <= nowMs;
  const soonest = (a: string | null, b: string | null) => (a ?? "9").localeCompare(b ?? "9");
  const bookedUpcoming = class_bookings.filter((e) => !ended(e.endsAt)).sort((a, b) => soonest(a.startsAt, b.startsAt));
  const bookedDone = class_bookings.filter((e) => ended(e.endsAt)).sort((a, b) => soonest(b.startsAt, a.startsAt));
  const assistUpcoming = assisting.filter((c) => !ended(c.endsAt));
  const assistDone = assisting.filter((c) => ended(c.endsAt)).sort((a, b) => soonest(b.startsAt, a.startsAt));
  const elsewhere = teaching.map((c) => ({
    id: c.id,
    danceClass: askToTileClass(c),
    artist: bookedArtists.get(c.classId) ?? null,
    city: c.businessCity,
  }));

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
      {/* THE TOOL'S HERO (18 Sep 2026, the user: "all heading when inside the page
          should have similar design as Crew, Calendar etc.") — the Classes tile's
          own colour and word, where a 17px "Your classes" line stood (6120) */}
      {/* ⚠ NO CALENDAR CHIP (19 Sep 2026, the user: "remove Calendar button on top
          right"). The hero's own bottom margin is the whole gap now — the row that
          held the chip also held the total, and the total moved INSIDE the list
          ("counts inside the toggles with total inside the columns"), so nothing
          is left between the heading and the segments but air. The Calendar tile
          on Home is still its door. */}
      {/* ⚠ SECTIONS (3 Oct 2026, C116): `SegmentedPanels sections` draws the
          heading and Booked · Assist · Manage in the TOP squircle and the shown
          list in the LOWER one — the Inbox's own split. */}

      {/* ⚠ SWITCHING A COLUMN DOES NOT GO TO THE SERVER AT ALL (20 Sep 2026, the
          user: "CLASSES LAG ISSUE IS THERE WHEN SWITCHING COLUMNS").
          The 20 Sep morning's fix made the PILL answer instantly (`useOptimistic`)
          and left the LIST waiting on a round trip — which is the half a finger
          actually watches. All three segments are rendered above, in this one
          server pass, and `SegmentedPanels` picks between them in the browser:
          no fetch, no loading boundary, nothing to wait for. The address still
          follows (`history.replaceState`), so the link is still shareable, the
          reload still lands here, and back still leaves the page. */}
      <SegmentedPanels
        /* the key is the SERVER's answer: a link from elsewhere carrying a
           different `?show=` must win over whatever this control last showed */
        key={show}
        initial={show}
        sections
        top={<DeskHero tool="classes" as="h1" margin="0" />}
        segments={showsFor(runs).map((k) => ({
          key: k,
          href: k === "booked" ? "/my-classes" : `/my-classes?show=${k}`,
          label: SHOWS[k].label,
          aria: SHOWS[k].aria,
          /* ⚠ an unanswered ask COUNTS (30 Sep 2026) — it is the one thing on
             either segment that is waiting on this person, so a pill that left
             it out was a pill with no reason to be pressed */
          n:
            k === "booked"
              ? booked
              : k === "assist"
                ? assisting.length + askedToAssist.length
                : myPageClasses.length + teaching.length + askedToTake.length,
        }))}
        panels={[
          ...(runs
            ? [
                {
                  key: "manage",
                  /* the artist's register, in place: Create, Draft · Published ·
                     Completed, each row wearing the request it waits on — and
                     then the classes somebody ELSE's studio put you in front of */
                  node: (
                    <>
                      {/* ⚠ ASKED COMES FIRST, because it is the only thing here
                          that is waiting on YOU (30 Sep 2026). The card is the
                          app's own class tile, the buttons call the same RPC the
                          Inbox and the class page call, and the class is what
                          you are looking at while you decide. */}
                      {askedToTake.length > 0 ? (
                        <div style={{ marginBottom: myPage || teaching.length ? 22 : 0 }}>
                          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "0 0 9px" }}>
                            ASKED TO TAKE · {askedToTake.length}
                          </div>
                          {askedToTake.map((c) => (
                            <ClassTile
                              key={c.id}
                              danceClass={askToTileClass(c)}
                              filled={seatsOf(c.sessionId)}
                              city={c.businessCity}
                              href={`/c/${c.classShareSlug}`}
                              relation="askedToTeach"
                              actions={
                                <AnswerAsk
                                  classPersonId={c.id}
                                  line={`${c.businessName} wants you to take this class${c.startsAt ? ` · ${when(c.startsAt)}` : ""}${c.payPerSessionInr > 0 ? ` · ₹${c.payPerSessionInr.toLocaleString("en-IN")} a session` : ""}. Saying yes puts you on it and opens its register.`}
                                />
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                      {/* ⚠⚠ THE CLASSES YOU TAKE ELSEWHERE ARE FILED IN THE
                          REGISTER'S OWN COLUMNS (1 Oct 2026, the user: *"shown on
                          all columns at the bottom. fix it according to the
                          column where it should be placed"*). They were one block
                          drawn under the register, outside its Published · Draft ·
                          Completed tabs, so every tab ended on the same list. The
                          register now takes them as `elsewhere`, sorts them with
                          its own clock rule, counts them in each pill and draws
                          them read-only — another business owns them (28 Sep).
                          ⚠ And somebody with NO page gets the same three columns
                          instead of one undated pile, with no Create control. */}
                      {myPage && manage ? (
                        <ClassesManager embedded businessId={myPage.id} classes={manage.classes} filledBySession={{ ...Object.fromEntries(seats), ...manage.filled }} artists={manage.artists} publishState={manage.state} whyNoClass={manage.whyNoClass} nowIso={nowIso} elsewhere={elsewhere} />
                      ) : teaching.length > 0 ? (
                        <ClassesManager embedded businessId="" classes={[]} filledBySession={Object.fromEntries(seats)} nowIso={nowIso} elsewhere={elsewhere} offerCreate={false} />
                      ) : null}
                      {myPageClasses.length === 0 && teaching.length === 0 && askedToTake.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "40px 20px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5 }}>
                          {/* ⚠ IT NO LONGER POINTS AT THE INBOX (30 Sep 2026) — the
                              ask lands at the top of this very segment now, and
                              saying otherwise sent people looking for a screen
                              they did not need. */}
                          Nothing to run yet. When a studio asks you onto a class as the person taking it, the ask arrives here and you answer it on the spot.
                        </div>
                      ) : null}
                    </>
                  ),
                },
              ]
            : []),
          {
            key: "booked",
            node: (
              <>
                {class_bookings.length > 0 ? (
                  <>
                    <ClassSection id="booked-upcoming" title="Upcoming" n={bookedUpcoming.length} empty="Nothing coming up.">
                      {bookedUpcoming.map((e) => (
                        <ClassTile
                          key={e.id}
                          danceClass={toTileClass(e)}
                          filled={seatsOf(e.sessionId)}
                          artist={bookedArtists.get(e.classId) ?? null}
                          city={e.businessCity}
                          href={`/c/${e.shareSlug}`}
                          relation="booked"
                          actions={<EnrollButton sessionId={e.sessionId} isFull={false} isSignedIn mine={{ id: e.id, status: e.status }} priceInr={e.priceInr} shareSlug={e.shareSlug} />}
                        />
                      ))}
                    </ClassSection>
                    {/* ⚠ A CLASS THAT IS OVER OFFERS NO WAY OUT OF ITS SEAT (4 Oct 2026,
                        the user: "cancel / refund class should not be possible if class
                        is over"). The card stays — it is the record of a class you took —
                        and the Cancel / refund control goes; the database refuses it too. */}
                    <ClassSection id="booked-completed" title="Completed" n={bookedDone.length} empty="Nothing completed yet." last>
                      {bookedDone.map((e) => (
                        <ClassTile
                          key={e.id}
                          danceClass={toTileClass(e)}
                          filled={seatsOf(e.sessionId)}
                          artist={bookedArtists.get(e.classId) ?? null}
                          city={e.businessCity}
                          href={`/c/${e.shareSlug}`}
                          relation="booked"
                        />
                      ))}
                    </ClassSection>
                  </>
                ) : null}
                {class_bookings.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13 }}>
                    Nothing booked yet —{" "}
                    <Link href="/classes" style={{ color: "#5AC8FA", fontWeight: 800 }}>
                      find a class
                    </Link>{" "}
                    to get started.
                  </div>
                )}
              </>
            ),
          },
          {
            key: "assist",
            /* THE SAME CARD AS BOOKED (19 Sep 2026, the user: "assisting should also
               show class cards in same way") — the app's one class tile, with the
               job you hold on it where a booked card carries its booking action */
            node: (
              <>
                {/* the same ask, the same card, the same RPC — an assistant's
                    side of what the Manage segment above does (30 Sep 2026) */}
                {askedToAssist.length > 0 ? (
                  <div style={{ marginBottom: assisting.length ? 22 : 0 }}>
                    <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, margin: "0 0 9px" }}>
                      ASKED TO ASSIST · {askedToAssist.length}
                    </div>
                    {askedToAssist.map((c) => (
                      <ClassTile
                        key={c.id}
                        danceClass={askToTileClass(c)}
                        filled={seatsOf(c.sessionId)}
                        city={c.businessCity}
                        href={`/c/${c.classShareSlug}`}
                        relation="askedToAssist"
                        actions={
                          <AnswerAsk
                            classPersonId={c.id}
                            line={`${c.businessName} wants you to assist on this class${c.startsAt ? ` · ${when(c.startsAt)}` : ""}. Saying yes puts you on it.`}
                          />
                        }
                      />
                    ))}
                  </div>
                ) : null}
                {/* the job is the card's own chip, in the shared word and colour
                    (4 Oct 2026); the studio and the date are already on the card */}
                {assisting.length > 0 ? (
                  <>
                    <ClassSection id="assist-upcoming" title="Upcoming" n={assistUpcoming.length} empty="Nothing coming up.">
                      {assistUpcoming.map((c) => (
                        <ClassTile key={c.id} danceClass={askToTileClass(c)} filled={seatsOf(c.sessionId)} artist={bookedArtists.get(c.classId) ?? null} city={c.businessCity} href={`/c/${c.classShareSlug}`} relation="assisting" />
                      ))}
                    </ClassSection>
                    <ClassSection id="assist-completed" title="Completed" n={assistDone.length} empty="Nothing completed yet." last>
                      {assistDone.map((c) => (
                        <ClassTile key={c.id} danceClass={askToTileClass(c)} filled={seatsOf(c.sessionId)} artist={bookedArtists.get(c.classId) ?? null} city={c.businessCity} href={`/c/${c.classShareSlug}`} relation="assisting" />
                      ))}
                    </ClassSection>
                  </>
                ) : null}
                {assisting.length === 0 && askedToAssist.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5 }}>
                    Nothing you assist on yet. When a studio asks you onto a class, the ask arrives here and you answer it on the spot.
                  </div>
                )}
              </>
            ),
          },
        ]}
      />

      {/* ⚠ THE TOTAL IS GONE (20 Sep 2026, the user, circling "5 on your page":
          "similar figures need to be removed from all pages in the app inside the
          home tab for all profiles"). The segment above ALREADY carries its own
          count — "Manage 5" — so this line said the same number a second time,
          one row lower, in smaller type. */}

      {/* ⚠ ADD CLASS OPENS OVER THIS PAGE (22 Sep 2026), from the Manage segment
          that offers it — an artist's register is this segment, not a page of
          its own (19 Sep), so this is the "respective section" a class begins
          from. An artist page has no rooms of its own, so there is nothing extra
          to read: the sheet costs one render and no round trip. */}
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
