import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { ClassesHome, type ClassItem } from "@/features/classes/components/ClassesHome";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { groupWithDoor, tabFromAddress, timeGroupOf, type ClassesTab, type TimeGroup } from "@/features/classes/classesScreen";
import { answeredRows, askToYouItem, askYouSentItem, draftItem, refundsItem, runActions, unpublishedItem } from "@/features/classes/classItems";
import { EnrollButton } from "@/features/classBookings/components/EnrollButton";
import { DeskHero } from "@/features/businesses/components/biz-kit";
import { PersonAskSettings } from "@/features/inbox/components/AskSettings";
import { buildRequests, isClassAsk } from "@/features/inbox/requestItems";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  allowsStudioMemberships: true,
  allowsArtistMemberships: false,
});

const ROLES = [
  { key: "all", word: "All" },
  { key: "booked", word: "Booked" },
  { key: "teaching", word: "Teaching" },
  { key: "assisting", word: "Assisting" },
  /* a second axis (11 Oct 2026, the user: "person should get filter for classes
     created by studio as well") — the classes a STUDIO made, whatever you are
     on them; drawn only when it narrows the list */
  { key: "studio", word: "By studios" },
];

/** YOUR CLASSES — the Home grid's Classes tile.
 *
 *  ⚠⚠ RE-CUT 11 Oct 2026 (the user's choices): To do · Upcoming · Past, with
 *  All · Booked · Teaching · Assisting as one chip row. Your own page's classes
 *  and the ones you teach at a studio are ONE list (Teaching) — the card's two
 *  halves already say whose class it is. Every card carries its own buttons. The
 *  teach / assist switches are behind the gear.
 *  ⚠ Old addresses keep landing (Rule 14): `?show=requests` is To do,
 *  `?show=manage|mine` is Teaching, `?show=assist` is Assisting. */
export default async function MyClassesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const opening = one(params.new) === "1";

  const ALL = ["asked", "confirmed", "rejected"] as const;
  const [bookings, artistOn, assistantOn, memberships, asksIn, inboxOff] = await Promise.all([
    findMyClassBookings(supabase),
    findMyConfirmedClassPeople(supabase, "artist"),
    findMyConfirmedClassPeople(supabase, "assistant"),
    findMyMemberships(supabase),
    findMyPendingClassPeople(supabase, [...ALL], { withdrawn: true }).catch(() => []),
    findMyInboxOff(supabase, user.id),
  ]);
  const myPage = memberships.find((m) => m.memberRole === "owner" && m.business.type === "artist_page")?.business ?? null;

  const [asksOut, venueOut, pageClasses, pageState, whyNoClass, pageRefunds] = myPage
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
  const classIn = requestsIn.filter(isClassAsk);
  const classOut = requestsOut.filter(isClassAsk);

  /* ⚠ YOUR OWN PAGE'S CLASSES ARE TEACHING — the confirmed artist rows for them
     are left out so nothing is drawn twice */
  const ownIds = new Set(pageClasses.map((c) => c.id));
  const teaching = artistOn.filter((c) => !ownIds.has(c.classId));
  const drafts = pageClasses.filter((c) => c.status === "draft");
  const ownLive = pageClasses.filter((c) => c.status !== "draft");
  const draftIds = new Set(drafts.map((c) => c.id));

  const sessionIds = [...bookings.map((e) => e.sessionId), ...teaching.map((c) => c.sessionId), ...assistantOn.map((c) => c.sessionId), ...pageClasses.map((c) => c.session?.id ?? null)].filter((s): s is string => Boolean(s));
  const reqClassIds = [...classIn, ...classOut].map((r) => r.danceClass?.id).filter((x): x is string => Boolean(x));
  const [artists, seats] = await Promise.all([
    findClassArtists(supabase, [...new Set([...bookings.map((e) => e.classId), ...teaching.map((c) => c.classId), ...assistantOn.map((c) => c.classId), ...reqClassIds, ...pageClasses.map((c) => c.id)])]),
    countEnrolledBySession(supabase, [...new Set(sessionIds)]).catch(() => new Map<string, number>()),
  ]);
  const seatsOf = (sessionId: string | null | undefined) => (sessionId ? (seats.get(sessionId) ?? 0) : 0);
  const artistOf = (classId: string | undefined) => (classId ? (artists.get(classId) ?? null) : null);

  const nowMs = stampNow();
  const relRole = (relation: string | null | undefined) => (relation === "askedToAssist" ? "assisting" : "teaching");

  /* ── TO DO ─────────────────────────────────────────────────────────────── */
  const todo: ClassItem[] = [
    ...classIn.filter((r) => r.status === "asked").map((r) => askToYouItem(r, artistOf(r.danceClass?.id), relRole(r.relation))),
    ...drafts.map((c) =>
      draftItem({
        c,
        businessId: myPage!.id,
        state: pageState.get(c.id),
        askedTeacherId: asksOut.find((a) => a.classId === c.id && a.kind === "artist" && a.status === "asked" && !a.withdrawn)?.id ?? null,
        canEdit: true,
        artist: artistOf(c.id),
        filled: seatsOf(c.session?.id),
        role: "teaching",
      })
    ),
    ...(myPage ? [refundsItem(pageRefunds, `/business/${myPage.id}/refunds`, "teaching")].filter((x): x is ClassItem => x !== null) : []),
    /* an ask you sent on a class that is already out (an assistant, mostly) — a
       draft's own asks are on its card */
    ...classOut
      .filter((r) => r.status === "asked" && r.kind === "classPerson" && !(r.danceClass && draftIds.has(r.danceClass.id)))
      .map((r) => askYouSentItem(r, artistOf(r.danceClass?.id), "teaching")),
    /* a class you said yes to, still a draft at the studio that asked */
    ...teaching.filter((c) => c.classStatus === "draft").map((c) => unpublishedItem({ key: `teach-${c.id}`, c: askToTileClass(c), artist: artistOf(c.classId), filled: seatsOf(c.sessionId), role: "teaching", relation: "teaching" })),
    ...assistantOn.filter((c) => c.classStatus === "draft").map((c) => unpublishedItem({ key: `assist-${c.id}`, c: askToTileClass(c), artist: artistOf(c.classId), filled: seatsOf(c.sessionId), role: "assisting", relation: "assisting" })),
  ];

  /* ── UPCOMING · PAST ───────────────────────────────────────────────────── */
  type Timed = ClassItem & { at: string | null };
  const timed = (key: string, group: TimeGroup, role: string, at: string | null, node: React.ReactNode): Timed => ({ key, tab: group === "past" ? "past" : "upcoming", group, role, at, node });
  const started = (startsAt: string | null) => startsAt !== null && Date.parse(startsAt) <= nowMs;
  const time: Timed[] = [
    ...bookings.map((e) => {
      const group = timeGroupOf(e.startsAt, e.endsAt, nowMs);
      return timed(
        `booked-${e.id}`,
        group,
        "booked",
        e.startsAt,
        <ClassTile
          danceClass={toTileClass(e)}
          filled={seatsOf(e.sessionId)}
          artist={artistOf(e.classId)}
          city={e.businessCity}
          href={`/c/${e.shareSlug}`}
          relation="booked"
          /* ⚠ a class that is over offers no way out of its seat (4 Oct), a
             started one no Cancel (6 Oct) */
          actions={group === "past" ? undefined : <EnrollButton sessionId={e.sessionId} isFull={false} isSignedIn mine={{ id: e.id, status: e.status }} priceInr={e.priceInr} shareSlug={e.shareSlug} started={started(e.startsAt)} />}
        />
      );
    }),
    ...ownLive.map((c) => {
      const group = groupWithDoor(c.session?.startsAt ?? null, c.session?.endsAt ?? null, nowMs);
      const path = `/c/${c.shareSlug}`;
      return timed(`own-${c.id}`, group, "teaching", c.session?.startsAt ?? null, <ClassTile danceClass={c} filled={seatsOf(c.session?.id)} artist={artistOf(c.id)} href={path} relation="teaching" actions={runActions({ group, path, title: c.title, canDoor: true })} />);
    }),
    ...teaching.filter((c) => c.classStatus !== "draft").map((c) => {
      const group = groupWithDoor(c.startsAt, c.endsAt, nowMs);
      const path = `/c/${c.classShareSlug}`;
      return timed(`teach-${c.id}`, group, "teaching", c.startsAt, <ClassTile danceClass={askToTileClass(c)} filled={seatsOf(c.sessionId)} artist={artistOf(c.classId)} city={c.businessCity} href={path} relation="teaching" actions={runActions({ group, path, title: c.classTitle, canDoor: c.canAttendance })} />);
    }),
    ...assistantOn.filter((c) => c.classStatus !== "draft").map((c) => {
      const group = groupWithDoor(c.startsAt, c.endsAt, nowMs);
      const path = `/c/${c.classShareSlug}`;
      return timed(`assist-${c.id}`, group, "assisting", c.startsAt, <ClassTile danceClass={askToTileClass(c)} filled={seatsOf(c.sessionId)} artist={artistOf(c.classId)} city={c.businessCity} href={path} relation="assisting" actions={runActions({ group, path, title: c.classTitle, canDoor: c.canAttendance, canShare: false })} />);
    }),
  ].sort((a, b) => (a.group === "past" && b.group === "past" ? (b.at ?? "").localeCompare(a.at ?? "") : (a.at ?? "9").localeCompare(b.at ?? "9")));

  /* which classes a STUDIO made — off the maker each read already carries; your
     own page's classes are an artist's by definition */
  const byStudio = new Set<string>([
    ...bookings.filter((e) => e.owner?.kind === "studio").map((e) => e.classId),
    ...[...teaching, ...assistantOn].filter((c) => c.owner?.kind === "studio").map((c) => c.classId),
    ...[...classIn, ...classOut].filter((r) => r.danceClass?.owner?.kind === "studio").map((r) => r.danceClass!.id),
  ]);
  const classIdOf = new Map<string, string>([
    ...bookings.map((e) => [`booked-${e.id}`, e.classId] as [string, string]),
    ...teaching.map((c) => [`teach-${c.id}`, c.classId] as [string, string]),
    ...assistantOn.map((c) => [`assist-${c.id}`, c.classId] as [string, string]),
    /* the keys `askToYouItem` and `askYouSentItem` give their cards */
    ...classIn.filter((r) => r.danceClass).map((r) => [`ask-${r.kind}-${r.id}`, r.danceClass!.id] as [string, string]),
    ...classOut.filter((r) => r.danceClass).map((r) => [`sent-${r.kind}-${r.id}`, r.danceClass!.id] as [string, string]),
  ]);
  const studioMade = (i: ClassItem) => {
    const id = classIdOf.get(i.key);
    return id ? byStudio.has(id) : false;
  };
  const items: ClassItem[] = [...todo, ...time].map((i) => (studioMade(i) ? { ...i, tags: [...(i.tags ?? []), "studio"] } : i));

  /* ── WHERE THE PAGE OPENS ──────────────────────────────────────────────── */
  const roleFromAddress =
    one(params.role) ?? (rawShow === "assist" ? "assisting" : rawShow === "manage" || rawShow === "mine" ? "teaching" : rawShow === "booked" || rawShow === "teaching" || rawShow === "assisting" ? rawShow : "all");
  const waitsOnYou = todo.some((i) => i.section !== "waiting");
  const tabAsked = tabFromAddress(one(params.tab), rawShow, one(params.stage));
  const initialTab: ClassesTab = tabAsked ?? (waitsOnYou ? "todo" : "upcoming");

  const add = myPage ? (
    whyNoClass ? (
      <div data-testid="why-no-class" style={{ fontSize: 12, color: SUB, lineHeight: 1.4 }}>
        {whyNoClass}
      </div>
    ) : (
      <DeskAddButton label="Add Class" href="/my-classes?new=1" />
    )
  ) : null;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "2px 16px 40px", boxSizing: "border-box" }}>
      <ClassesHome
        /* the key is the ADDRESS's answer, so a link naming another tab wins over
           whatever this screen last showed. ⚠ Never the computed default: answering
           the last request re-reads the page, the default flips to Upcoming, and a
           key on it would throw the person off To do the moment they pressed Accept */
        key={`${tabAsked ?? "auto"}-${roleFromAddress}`}
        mode="person"
        top={<DeskHero tool="classes" as="h1" margin="0" />}
        add={add}
        settings={<PersonAskSettings section="requests" off={inboxOff} startOpen />}
        roles={ROLES}
        items={items}
        answered={answeredRows(classIn, classOut)}
        initialTab={initialTab}
        initialRole={roleFromAddress}
        basePath="/my-classes"
      />

      {/* ⚠ ADD CLASS OPENS OVER THIS PAGE (22 Sep 2026) */}
      {opening && myPage && !whyNoClass ? (
        <ClassForm
          businessId={myPage.id}
          businessType="artist_page"
          rooms={[]}
          isOwner
          suggestedStyles={myPage.styles}
          sheet
          ownedStudioIds={memberships.filter((m) => m.memberRole === "owner" && m.business.type === "studio").map((m) => m.business.id)}
        />
      ) : null}
    </div>
  );
}
