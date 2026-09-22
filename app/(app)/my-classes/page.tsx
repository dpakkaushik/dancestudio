import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { DeskHero } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassArtists, findMyConfirmedClaims } from "@/repositories/claims";
import { findClassPublishState, findClassesByTenant, findWhyNoClass } from "@/repositories/classes";
import { countEnrolledBySession, findMyEnrollments } from "@/repositories/enrollments";
import { findMyMemberships } from "@/repositories/tenants";
import type { MyClaimAsk } from "@/types/claim";
import type { DanceClass } from "@/types/class";
import type { MyEnrollment } from "@/types/enrollment";

const toTileClass = (e: MyEnrollment): DanceClass => ({
  id: e.classId,
  tenantId: "",
  title: e.title,
  shareSlug: e.shareSlug,
  style: e.style,
  level: e.level,
  room: e.room,
  // the tile draws the room's NAME and its own poster from the title — the
  // booking row carries neither id
  roomId: null,
  poster: null,
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

/* the class behind a confirmed ask, as the tile draws it (19 Sep 2026) */
const askToTileClass = (c: MyClaimAsk): DanceClass => ({
  id: c.classId,
  tenantId: "",
  title: c.classTitle,
  shareSlug: c.classShareSlug,
  style: c.classStyle,
  level: c.classLevel as DanceClass["level"],
  room: c.classRoom,
  roomId: null,
  poster: null,
  priceInr: c.classPriceInr,
  capacity: c.classCapacity,
  status: c.classStatus,
  session: c.sessionId && c.startsAt && c.endsAt ? { id: c.sessionId, startsAt: c.startsAt, endsAt: c.endsAt } : null,
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
 *  Events left this page for /my-events the same day; `?kind=event` links that
 *  are out in the world land there (Rule 14). */
type Show = "booked" | "assist" | "manage";
const SHOWS: Record<Show, { label: string; aria: string }> = {
  booked: { label: "Booked", aria: "Show the classes you booked" },
  assist: { label: "Assist", aria: "Show the classes you teach or assist on" },
  /* MANAGE, IN PLACE (18 Sep 2026, the user: "Manage class should not take to a
     separate page for artist — should be handled from within the same page"):
     the artist's own register, drawn here as a third segment */
  manage: { label: "Manage", aria: "Manage the classes on your artist page" },
};

/** ⚠ THE ORDER IS THE ACCOUNT'S (19 Sep 2026, the user: "Manage should be first
 *  section for Artist"). An artist opens this page to run their own classes;
 *  somebody without a page opens it to see what they booked, and never sees
 *  Manage at all. `?show=` is unchanged either way, so every link out in the
 *  world still lands where it always did (Rule 14). */
const showsFor = (hasPage: boolean): Show[] => (hasPage ? ["manage", "booked", "assist"] : ["booked", "assist"]);

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
    /* the old Events filter of this page (Rule 14: a link is a promise) */
    redirect("/my-events");
  }
  const rawShow = Array.isArray(params.show) ? params.show[0] : params.show;
  /* the Add class sheet, opened from the Manage segment (22 Sep 2026) */
  const opening = (Array.isArray(params.new) ? params.new[0] : params.new) === "1";

  const [class_bookings, artistOn, assistantOn, memberships] = await Promise.all([
    findMyEnrollments(supabase),
    findMyConfirmedClaims(supabase, "artist"),
    findMyConfirmedClaims(supabase, "assistant"),
    findMyMemberships(supabase),
  ]);
  const myPage = memberships.find((m) => m.memberRole === "owner" && m.tenant.type === "artist_page")?.tenant ?? null;
  /* ⚠ MANAGE OPENS FIRST FOR SOMEBODY WHO RUNS CLASSES (20 Sep 2026, the user:
     "Manage Membership and classes to be first option in order and when opening
     the tile"). It has been first in the ORDER since 19 Sep; what it was not was
     the segment you LAND on, so an artist opening their own tile still arrived
     at other people's classes they had booked. A URL that names a segment still
     wins, so every existing link keeps landing where it always did (Rule 14). */
  const show: Show =
    rawShow === "assist" ? "assist" : rawShow === "manage" && myPage ? "manage" : rawShow === "booked" ? "booked" : myPage ? "manage" : "booked";
  /* the teacher's own classes are theirs to manage, not to "assist on": an
     artist page's owner is its every class's confirmed teacher by construction */
  const jobs: Array<MyClaimAsk & { job: "Teaching" | "Assisting" }> = [
    ...artistOn.filter((c) => !myPage || c.tenantName !== myPage.name).map((c) => ({ ...c, job: "Teaching" as const })),
    ...assistantOn.map((c) => ({ ...c, job: "Assisting" as const })),
  ].sort((a, b) => (a.startsAt ?? "9").localeCompare(b.startsAt ?? "9"));
  const booked = class_bookings.filter((e) => e.status === "enrolled").length;
  /* the teacher each card wears in its centre (18 Sep 2026) — one read for both segments */
  const bookedArtists = await findClassArtists(supabase, [...class_bookings.map((e) => e.classId), ...jobs.map((c) => c.classId)]);

  /* ⚠ THE PAGE'S CLASSES ARE READ ONCE, WHICHEVER SEGMENT IS OPEN (19 Sep 2026):
     the Manage pill carries a COUNT now, so the number has to be true from the
     Booked segment too. It replaces the read the register used to make for
     itself, so Manage costs one query fewer than it did. */
  const myPageClasses = myPage ? await findClassesByTenant(supabase, myPage.id).catch(() => []) : [];

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
      <DeskHero tool="classes" as="h1" margin="0 0 14px" />

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
        segments={showsFor(Boolean(myPage)).map((k) => ({
          key: k,
          href: k === "booked" ? "/my-classes" : `/my-classes?show=${k}`,
          label: SHOWS[k].label,
          aria: SHOWS[k].aria,
          n: k === "booked" ? booked : k === "assist" ? jobs.length : myPageClasses.length,
        }))}
        panels={[
          ...(myPage && manage
            ? [
                {
                  key: "manage",
                  /* the artist's register, in place: Create, Draft · Published ·
                     Completed, each row wearing the request it waits on */
                  node: (
                    <ClassesManager embedded tenantId={myPage.id} classes={manage.classes} filledBySession={manage.filled} artists={manage.artists} publishState={manage.state} whyNoClass={manage.whyNoClass} nowIso={new Date().toISOString()} />
                  ),
                },
              ]
            : []),
          {
            key: "booked",
            node: (
              <>
                {class_bookings.map((e) => (
                  <ClassTile
                    key={e.id}
                    danceClass={toTileClass(e)}
                    artist={bookedArtists.get(e.classId) ?? null}
                    city={e.tenantCity}
                    href={`/c/${e.shareSlug}`}
                    actions={<EnrollButton sessionId={e.sessionId} isFull={false} isSignedIn mine={{ id: e.id, status: e.status }} priceInr={e.priceInr} shareSlug={e.shareSlug} />}
                  />
                ))}
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
                {jobs.map((c) => (
                  <ClassTile
                    key={c.id}
                    danceClass={askToTileClass(c)}
                    artist={bookedArtists.get(c.classId) ?? null}
                    city={c.tenantCity}
                    href={`/c/${c.classShareSlug}`}
                    actions={
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 10.5, color: SUB }}>
                          {c.tenantName} · {when(c.startsAt)}
                        </span>
                        <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: c.job === "Teaching" ? "#F59E0B" : "#8B5CF6" }}>{c.job}</span>
                      </div>
                    }
                  />
                ))}
                {jobs.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5 }}>
                    Nothing you teach or assist on yet. A studio asks you onto a class, you say yes in your Inbox, and it appears here.
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
        <ClassForm tenantId={myPage.id} tenantType="artist_page" rooms={[]} isOwner sheet />
      ) : null}
    </div>
  );
}
