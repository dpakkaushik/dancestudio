import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClassPeopleForBusinesses, findClassArtists } from "@/repositories/classPeople";
import { findClassPublishState, findClassesByBusiness, findClassesHostedByBusiness, findVenueRequestsForBusinesses, findWhyNoClass } from "@/repositories/classes";
import { countEnrolledBySession } from "@/repositories/classBookings";
import { findRoomsByBusiness } from "@/repositories/rooms";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

/* the clock lives outside the component (react-hooks/purity) — the register's
   LIVE filter is arithmetic over the moment the page was served */
const stampNowIso = (): string => new Date().toISOString();

/** A STUDIO's classes register. Since 18 Sep 2026 every row wears the request
 *  it waits on — the teacher asked and their answer — and Publish is offered
 *  only once the database would accept it. An ARTIST's register is not a page
 *  of its own any more: it is the Manage segment of Your classes (the user:
 *  "Manage class should not take to a separate page for artist"), so an artist
 *  page's address lands there (Rule 14). */
export default async function BusinessClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessId } = await params;
  const opening = (await searchParams).new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* membership check: RLS only returns businesses the user belongs to — and the
     seat has to be one that RUNS the place (28 Sep 2026). The switcher stopped
     listing a business a faculty seat is on, and a door closed only in the menu
     that opens it is not closed. ⚠ The role rides the query that was already
     being made: `findMyMemberships` is `findMyBusinesses` with the seat on it. */
  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const business = seat.business;
  /* ⚠ the hosting row's redirect to its events desk went with events (29 Sep 2026) */
  if (business.type === "artist_page") {
    redirect("/my-classes?show=manage");
  }

  /* ⚠ creating a class is the OWNER's since 18 Sep 2026 — `whyNoClass` asks
     whether this BUSINESS may carry one, never whether YOU may make one, so the
     seat decides the button. ⚠ It is the seat READ ABOVE (28 Sep 2026), not a
     second `findMyMembershipRole` round trip: the guard had to know the role
     anyway, so asking twice was a query this page stopped needing. */
  const myRole = seat.memberRole;
  const [classes, hosted] = await Promise.all([
    findClassesByBusiness(supabase, businessId),
    findClassesHostedByBusiness(supabase, businessId),
  ]);
  /* ⚠ the hosted classes' seats too (4 Oct 2026): their cards print "N/M Booked"
     on the bar, and without a count they read 0 */
  const sessionIds = [...classes, ...hosted.map((h) => h.danceClass)].map((c) => c.session?.id).filter(Boolean) as string[];
  const [counts, state, artists, whyNoClass, venueRequests, sentAsks] = await Promise.all([
    countEnrolledBySession(supabase, sessionIds),
    findClassPublishState(supabase, businessId).catch(() => new Map()),
    /* the teacher each row's card wears in its centre (18 Sep 2026) — a draft
       whose ask is unanswered has none, and falls back to the style square.
       ⚠ The hosted classes ride the same read, so an artist's class in this
       studio's room wears the artist's face too */
    findClassArtists(supabase, [...classes.map((c) => c.id), ...hosted.map((h) => h.danceClass.id)]),
    /* the database's sentence, if a new class would be refused here (18 Sep 2026) */
    findWhyNoClass(supabase, businessId),
    /* ⚠⚠ WHO WANTS THIS STUDIO'S ROOMS (30 Sep 2026). A venue request is a class
       owned by the ARTIST's page, so `findClassesByBusiness` above has never
       returned one — the studio's own rooms were being committed and its classes
       desk said nothing at all. The only place to answer was the Inbox. */
    findVenueRequestsForBusinesses(supabase, [businessId]).catch(() => []),
    /* the live asks this studio has SENT, so a row that says "⏳ {name} asked"
       can also take it back — `publishState` names who but carries no id */
    findAskedClassPeopleForBusinesses(supabase, [businessId]).catch(() => []),
  ]);
  const askedTeachers = Object.fromEntries(
    sentAsks.filter((a) => a.kind === "artist").map((a) => [a.classId, a.id])
  );
  /* ⚠ ADD CLASS OPENS OVER THIS REGISTER (22 Sep 2026, the user: "all forms and
     add buttons … should open form like how setting page or edit profile page
     open from the same screen", then "from inside their respective sections").
     The ROOMS the form offers are read only when the form is asked for — `?new=1`
     — so the register costs exactly what it did before on every other visit, and
     the owner-only rule is re-checked here because a query param is a thing
     anybody can type. `/business/{id}/classes/new` still renders it full-page. */
  const rooms = opening && myRole === "owner" && !whyNoClass ? await findRoomsByBusiness(supabase, businessId).catch(() => []) : [];
  return (
    <>
      <ClassesManager
        businessId={businessId}
        classes={classes}
        filledBySession={Object.fromEntries(counts)}
        artists={Object.fromEntries(artists)}
        publishState={Object.fromEntries(state)}
        whyNoClass={whyNoClass}
        canCreate={myRole === "owner"}
        /* ⚠ THE SAME SEAT DECIDES EVERY WRITE ON THIS DESK (30 Sep 2026): RLS
           admits only the owner to `classes` UPDATE, so Edit, Publish and Delete
           are the owner's exactly as Create is. R55 let a MANAGER in here on
           28 Sep and only Create was re-checked. */
        canEdit={myRole === "owner"}
        venueRequests={venueRequests}
        askedTeachers={askedTeachers}
        /* the artists' classes this studio said yes to, filed in their tabs,
           read-only — the class is the artist's to edit (2 Oct 2026) */
        elsewhere={hosted.map((h) => ({
          id: h.danceClass.id,
          danceClass: h.danceClass,
          artist: artists.get(h.danceClass.id) ?? null,
          city: business.city ?? null,
        }))}
        elsewhereHead="ARTISTS IN YOUR ROOMS"
        /* the studio's word for an artist's class in its room — "At your
           studio", as its Home deck says (it read "Hosted" here) */
        elsewhereRelation="atYourStudio"
        nowIso={stampNowIso()}
      />
      {opening && myRole === "owner" && !whyNoClass ? (
        <ClassForm
          businessId={businessId}
          businessType={business.type}
          rooms={rooms}
          isOwner
          /* the owner may take their own class (26 Sep 2026) — this branch is owner-only */
          meId={user.id}
          studioPlace={[business.area, business.city].filter(Boolean).join(", ")}
          suggestedStyles={business.styles}
          sheet
        />
      ) : null}
    </>
  );
}
