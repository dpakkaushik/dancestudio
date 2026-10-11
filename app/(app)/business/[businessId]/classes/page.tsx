import { redirect } from "next/navigation";
import { ClassForm } from "@/features/classes/components/ClassForm";
import { ClassesHome, type ClassItem } from "@/features/classes/components/ClassesHome";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { groupWithDoor, tabFromAddress, type ClassesTab } from "@/features/classes/classesScreen";
import { answeredItems, askExpired, askToYouItem, askYouSentItem, closedDraftItem, draftItem, hasPassed, refundsItem, runActions } from "@/features/classes/classItems";
import { DeskHero } from "@/features/businesses/components/biz-kit";
import { TakingRequestsSwitch } from "@/features/classes/components/ClassCardActions";
import { buildRequests } from "@/features/inbox/requestItems";
import { DeskAddButton } from "@/features/settings/components/settings-kit";
import { DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { findRefundsByBusiness } from "@/repositories/refunds";
import { findTakesRoomRequests } from "@/repositories/askSettings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClassPeopleForBusinesses, findClassArtists } from "@/repositories/classPeople";
import { findClassPublishState, findClassesByBusiness, findClassesHostedByBusiness, findVenueRequestsForBusinesses, findWhyNoClass } from "@/repositories/classes";
import { countEnrolledBySession } from "@/repositories/classBookings";
import { findRoomsByBusiness } from "@/repositories/rooms";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

/* the clock lives outside the component (react-hooks/purity) */
const stampNow = (): number => Date.now();

const ROLES = [
  { key: "all", word: "All" },
  { key: "yours", word: "Yours" },
  { key: "guest", word: "Guest artists" },
];

/** A STUDIO's classes — the same screen as Your classes (11 Oct 2026): To do ·
 *  Upcoming · Past, with All · Yours · Guest artists as the chip row. To do is
 *  the rooms artists asked for, the drafts and what each waits on, the refunds
 *  to decide and the asks still out; every card carries its own buttons. The
 *  room-request switch is behind the gear.
 *  ⚠ A MANAGER RUNS CLASSES (`20261016090000`): adding, editing a draft,
 *  publishing, withdrawing an ask, answering a room request and the request
 *  switch are the owner's OR a manager's — every seat that reaches this page,
 *  since it redirects anybody else. What stays the OWNER's: refunds to decide,
 *  and the pay a person is offered on the class form.
 *  ⚠ Old addresses keep landing (Rule 14): `?show=requests` and `?stage=` open
 *  the tab they meant. An artist page's address is Your classes. */
export default async function BusinessClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { businessId } = await params;
  const sp = await searchParams;
  const opening = sp.new === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  /* the seat has to be one that RUNS the place (28 Sep 2026) */
  const seat = (await findMyMemberships(supabase)).find((m) => m.business.id === businessId);
  if (!seat || !runsTheBusiness(seat.memberRole)) {
    redirect("/business");
  }
  const business = seat.business;
  if (business.type === "artist_page") {
    redirect("/my-classes");
  }
  const owner = seat.memberRole === "owner";
  /* ⚠ every seat past the redirect above RUNS the place — owner or manager — so
     what a manager may now do (`20261016090000`) is simply offered: answering a
     room, editing and publishing a draft, withdrawing an ask, adding a class */

  const [classes, hosted] = await Promise.all([findClassesByBusiness(supabase, businessId), findClassesHostedByBusiness(supabase, businessId)]);
  const sessionIds = [...classes, ...hosted.map((h) => h.danceClass)].map((c) => c.session?.id).filter(Boolean) as string[];
  const [counts, state, whyNoClass, venueRequests, sentAsks, takesRooms, refunds] = await Promise.all([
    countEnrolledBySession(supabase, sessionIds),
    findClassPublishState(supabase, businessId).catch(() => new Map()),
    findWhyNoClass(supabase, businessId),
    /* the rooms artists asked this studio for — every answer, so the answered
       ones stay in To do's history */
    findVenueRequestsForBusinesses(supabase, [businessId], ["requested", "accepted", "declined"]).catch(() => []),
    findAskedClassPeopleForBusinesses(supabase, [businessId], ["asked", "confirmed", "rejected"], { withdrawn: true }).catch(() => []),
    findTakesRoomRequests(supabase, businessId),
    owner ? findRefundsByBusiness(supabase, businessId).catch(() => []) : Promise.resolve([]),
  ]);
  const { requestsIn, requestsOut } = buildRequests({ venueIn: venueRequests, classPeopleOut: sentAsks });
  const artists = await findClassArtists(supabase, [
    ...new Set([...classes.map((c) => c.id), ...hosted.map((h) => h.danceClass.id), ...[...requestsIn, ...requestsOut].map((r) => r.danceClass?.id).filter((x): x is string => Boolean(x))]),
  ]);
  const artistOf = (id: string | undefined) => (id ? (artists.get(id) ?? null) : null);
  const seatsOf = (id: string | undefined) => (id ? (counts.get(id) ?? 0) : 0);
  const nowMs = stampNow();

  const drafts = classes.filter((c) => c.status === "draft");
  const draftIds = new Set(drafts.map((c) => c.id));
  /* ⚠ a draft whose date has passed is closed (11 Oct 2026, the user) — Past,
     nothing to press; one with no session is not drawn at all */
  const openDrafts = drafts.filter((c) => c.session !== null && !hasPassed(c.session.startsAt, nowMs));
  const closedDrafts = drafts.filter((c) => c.session !== null && hasPassed(c.session.startsAt, nowMs));

  /* ── TO DO ─────────────────────────────────────────────────────────────── */
  const todo: ClassItem[] = [
    /* an artist wants one of the rooms — the owner or a manager answers.
       ⚠ A request whose class has already started is closed: it goes to Answered */
    ...requestsIn
      .filter((r) => r.status === "asked" && !askExpired(r, nowMs))
      .map((r) => askToYouItem(r, artistOf(r.danceClass?.id), "guest", true)),
    ...openDrafts.map((c) =>
      draftItem({
        c,
        businessId,
        state: state.get(c.id),
        askedTeacherId: sentAsks.find((a) => a.classId === c.id && a.kind === "artist" && a.status === "asked" && !a.withdrawn)?.id ?? null,
        canEdit: true,
        artist: artistOf(c.id),
        filled: seatsOf(c.session?.id),
        role: "yours",
      })
    ),
    ...[refundsItem(refunds, `/business/${businessId}/refunds`, "yours")].filter((x): x is ClassItem => x !== null),
    ...requestsOut
      .filter((r) => r.status === "asked" && !askExpired(r, nowMs) && r.kind === "classPerson" && !(r.danceClass && draftIds.has(r.danceClass.id)))
      .map((r) => askYouSentItem(r, artistOf(r.danceClass?.id), "yours")),
  ];

  /* ── UPCOMING · PAST ───────────────────────────────────────────────────── */
  const runs = [
    ...classes.filter((c) => c.status !== "draft" && c.session !== null).map((c) => ({ c, role: "yours", relation: null })),
    ...hosted.filter((h) => h.danceClass.session !== null).map((h) => ({ c: h.danceClass, role: "guest", relation: "atYourStudio" as const })),
  ]
    .map(({ c, role, relation }): ClassItem & { at: string | null } => {
      const group = groupWithDoor(c.session?.startsAt ?? null, c.session?.endsAt ?? null, nowMs);
      const path = `/c/${c.shareSlug}`;
      return {
        key: `${role}-${c.id}`,
        tab: (group === "past" ? "past" : "upcoming") as ClassesTab,
        group,
        role,
        at: c.session?.startsAt ?? null,
        node: (
          <ClassTile
            danceClass={c}
            filled={seatsOf(c.session?.id)}
            artist={artistOf(c.id)}
            city={role === "guest" ? (business.city ?? null) : undefined}
            href={path}
            relation={relation}
            /* whoever runs the studio runs its door — its own classes and the
               guest artists' in its rooms */
            actions={runActions({ group, path, title: c.title, canDoor: true, canShare: role === "yours" })}
          />
        ),
      };
    })
    .concat(closedDrafts.map((c) => ({ ...closedDraftItem({ key: `draft-${c.id}`, c, artist: artistOf(c.id), filled: seatsOf(c.session?.id), role: "yours", canEdit: true }), tab: "past" as ClassesTab, group: "past" as const, at: c.session?.startsAt ?? null })))
    .sort((a, b) => (a.group === "past" && b.group === "past" ? (b.at ?? "").localeCompare(a.at ?? "") : (a.at ?? "9").localeCompare(b.at ?? "9")));

  const items: ClassItem[] = [...todo, ...runs];

  const waitsOnYou = todo.some((i) => i.section !== "waiting");
  const tabAsked = tabFromAddress(sp.tab, sp.show, sp.stage);
  const initialTab: ClassesTab = tabAsked ?? (waitsOnYou ? "todo" : "upcoming");
  const initialRole = sp.role ?? "all";

  const add = whyNoClass ? (
    <div data-testid="why-no-class" style={{ fontSize: 12, color: SUB, lineHeight: 1.4 }}>
      {whyNoClass}
    </div>
  ) : (
    <DeskAddButton label="Add Class" href={`/business/${businessId}/classes?new=1`} />
  );

  /* the rooms the form offers are read only when the form is asked for */
  const rooms = opening && !whyNoClass ? await findRoomsByBusiness(supabase, businessId).catch(() => []) : [];

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      <ClassesHome
        /* keyed on the ADDRESS, never the computed default — see /my-classes */
        key={`${tabAsked ?? "auto"}-${initialRole}`}
        mode="studio"
        top={<DeskHero tool="classes" as="h1" margin="0" toggle={false} />}
        add={add}
        settings={<TakingRequestsSwitch mode="studio" businessId={businessId} on={takesRooms} />}
        roles={ROLES}
        items={items}
        answered={answeredItems(requestsIn, requestsOut, artistOf, nowMs)}
        initialTab={initialTab}
        initialRole={initialRole}
        basePath={`/business/${businessId}/classes`}
      />
      {opening && !whyNoClass ? (
        <ClassForm
          businessId={businessId}
          businessType={business.type}
          rooms={rooms}
          meId={user.id}
          studioPlace={[business.area, business.city].filter(Boolean).join(", ")}
          suggestedStyles={business.styles}
          sheet
        />
      ) : null}
    </div>
  );
}
