import Link from "next/link";
import { InvertedPanel } from "@/components/ui/InvertedPanel";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { CrewCard } from "@/features/crews/components/CrewCard";
import { CrewI } from "@/features/crews/components/crew-kit";
import { EnrollButton } from "@/features/classBookings/components/EnrollButton";
import { CompactCard } from "@/features/discovery/components/CompactCard";
import { DiscoverFilters } from "@/features/discovery/components/DiscoverFilters";
import { DiscoverTabs } from "@/features/discovery/components/DiscoverTabs";
import { FollowedShelf, type FollowedTile } from "@/features/discovery/components/FollowedShelf";
import { PlaceChip } from "@/features/discovery/components/PlaceChip";
import { StudioCard } from "@/features/discovery/components/StudioCard";
import { ArtistI, ClassI, DosFollowers, StudioI } from "@/features/discovery/components/discover-kit";
import { filterClasses, filterCrews, filterBusinesses, filtersToParams, parseFilters, radiusOf } from "@/features/discovery/filters";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { DOS_STYLE_NAMES } from "@/lib/constants/styles";
import { INDIA_CENTRE, centreOf, findDiscoverCities } from "@/repositories/cities";
import { DOS_DISPLAY, DOS_UI, INK, SKY, SUB, TAB_SUB, TAB_TITLE } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassArtists, findClassesWithArtist } from "@/repositories/classPeople";
import { findPublishedClasses, findPublishedStylesByBusiness } from "@/repositories/classes";
import { findCrewsByCity } from "@/repositories/crews";
import { findDiscoverArtists, findNearbyBusinesses, findBusinessCardFacts, type DiscoverArtist, type BusinessCardFacts } from "@/repositories/discovery";
import { findFollowerCounts, findMyFollowedPeople, findMyFollowing } from "@/repositories/follows";
import { findStudioHeaderPhotosMany, type HeaderPhoto } from "@/repositories/headerPhotos";
import { findPersonFollowerCounts } from "@/repositories/publicPerson";
import type { ClassArtist } from "@/types/classPerson";
import { after } from "next/server";
import { recordImpression } from "@/repositories/analytics";
import { countEnrolledBySession, findMyEnrolledSessionIds } from "@/repositories/classBookings";
import { findProfileById } from "@/repositories/profiles";
import { resolveActingAs, withAs } from "@/repositories/actingAs";
import type { ClassBookingStatus } from "@/types/classBooking";
import { canBookClass, noBookingWords } from "@/types/profile";

/** ONE PAGE OF A SHELF (18 Sep 2026, the user: "should give option for second
 *  page after that"). The radius search answered 50 rows and stopped, so a city
 *  with a 51st studio could never show it. `?page=N` is the offset now — the
 *  address is the state, as every other filter on this page — and the foot of
 *  the shelf offers the next page while a full page came back, and the one
 *  before while this is not the first. */
const PAGE_SIZE = 50;
const parsePage = (raw: string | undefined): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 400 ? n : 1;
};

const EL = "var(--el)";

/** ENTITY_TABS (prototype 4149) — the prototype's order, opening on Studios.
 *  The URL words are the ones the app has always used, so every existing link
 *  keeps working. ⚠ The Events tab went with events on 29 Sep 2026; `?tab=events`
 *  is not a tab any more and falls through to Studios, which is what an unknown
 *  word has always done. */
const TABS = [
  ["studios", "Studios", StudioI],
  ["artists", "Artists", ArtistI],
  ["crews", "Crews", CrewI],
  ["classes", "Classes", ClassI],
] as const;

/* ⚠ `stampNowIso` went with the events shelf (29 Sep 2026) — it dated the one
   read on this page that asked "still to come" */

/** A city is whatever the map named it (11 Sep 2026) — no list to belong to,
 *  so the only rule is that it is a sane-looking string. The database folds
 *  aliases onto one canonical name, so grouping holds without one here. */
const asCity = (v: string | undefined | null): string | null => {
  const s = String(v ?? "").trim();
  return s.length > 0 && s.length <= 120 ? s : null;
};

/** "18.516,73.856" from the address bar, or nothing. Bounded to India, because
 *  a pair of numbers in a URL is the least trustworthy input the app has and a
 *  radius search from the wrong hemisphere is an empty shelf with no
 *  explanation (11 Sep 2026). */
const parseNear = (raw: string | undefined): { lat: number; lng: number } | null => {
  const [a, b] = String(raw ?? "").split(",");
  const lat = Number(a);
  const lng = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5 ? { lat, lng } : null;
};

/** Discover — lifted from the prototype's S_discover (4425-4885): THE TOP OF
 *  DISCOVER (the page's colour bleeding off the top, a small word, the title,
 *  THE PLACE ONCE as one chip), the one search box, the five section tabs, THE
 *  STYLE RAIL, Filters and the quick chips, "Followed by you" for a signed-in
 *  person, then the shelf for the tab you are on. Since Step 23 every way of
 *  narrowing a list is URL state, applied here on the server with the
 *  predicates in `features/discovery/filters.ts` — "a filter that cannot be
 *  evaluated does not silently empty the list — it stands aside" (4460). */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /* THE CITY LIST IS THE REGISTRY (11 Sep 2026): every city that actually has a
     business in it, busiest first. It fills itself the first time somebody
     opens a studio somewhere new, so there is no constant to edit and no
     thirteenth city that cannot be named. */
  /* ⚠⚠ WHICH PROFILE IS READING THIS SHELF (27 Sep 2026, the user: "studio and
     organization profiles should not be able book classes and events from
     discover breaking now", and "crew can only take part in events and should
     not be able to book classes"). ⚠ The second half of that sentence was the
     only reason a CREW could act here at all, and events went on 29 Sep 2026 —
     so a crew now books nothing, which is what `canBookClass` already said.
     Discover belongs to no profile, so the ENTITY BAR's Discover link carries
     the one you pressed it from (`?as=`) and this resolves it against what the
     account actually belongs to — a pointer is never an authority. Unresolvable
     means "yourself", which is the permissive answer on purpose: this is a
     presentation gate, and failing it closed would take a booking away from
     somebody entitled to one. */
  const [profile, cities, actingAs] = await Promise.all([
    user ? findProfileById(supabase, user.id) : Promise.resolve(null),
    findDiscoverCities(supabase),
    user ? resolveActingAs(supabase, params.as) : Promise.resolve(null),
  ]);
  /* the raw value, kept only to carry onto the cards' own hrefs so the page a
     card opens agrees with the card that sent you */
  const asRaw = actingAs ? (params.as ?? null) : null;
  const noClass = actingAs && !canBookClass(actingAs) ? noBookingWords(actingAs) : null;
  /* asked for, else where this person says they are, else wherever is busiest */
  const city: string = asCity(params.city) ?? asCity(profile?.city) ?? cities[0]?.city ?? "";
  const tab = TABS.some(([k]) => k === params.tab) ? (params.tab as string) : "studios";
  /* WHERE "NEAR" IS MEASURED FROM (11 Sep 2026). The city's centre, unless the
     person has pressed Near me and their own point is in the address — in which
     case the distances on the cards are distances to THEM. A malformed or
     out-of-range pair is ignored rather than argued with: the city centre is
     always a usable answer, and an empty shelf is not. */
  const near = parseNear(params.near);
  /* the city's own centre from the registry; a city nobody has been to yet has
     none, and then the country is the honest place to measure from */
  const centre = near ?? centreOf(cities, city) ?? INDIA_CENTRE;
  const filters = parseFilters(params, DOS_STYLE_NAMES);
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;
  /* ⚠ AN ARTIST ON DISCOVER IS A PERSON (18 Sep 2026, the user: "should only come
     as their profile as artist, no separate page required"): the Artists tab
     lists the PEOPLE in this city with a live Artist plan, opening their
     profile, and the radius search answers Studios alone */
  const wantsBusinesses = tab === "studios";
  const wantsArtists = tab === "artists";
  /* the follow shelf heads Studios and Artists for a signed-in person; a crew has no follow yet */
  const wantsFollows = Boolean(user) && (wantsBusinesses || wantsArtists);

  /* every published class is read on every tab: the classes shelf needs them,
     and the style rail is ORDERED by how many classes each style has (4212) */
  const [allClasses, nearby, mine, following, artistsRaw, followedPeople] = await Promise.all([
    /* narrowed to the city IN THE QUERY (11 Sep 2026): asking for the newest 200
       nationally and filtering here made a city's classes disappear once the
       platform passed 200 published classes — see repositories/classes.ts */
    findPublishedClasses(supabase, 200, city).catch((e: unknown) => {
      /* ⚠ ON EVERY OTHER TAB THIS READ IS DECORATION (11 Sep 2026, found by the
         e2e suite): it orders the style rail and adds styles to business cards.
         Supabase's gateway answered it with a Cloudflare 502 once in a thousand
         requests, and that one answer took a whole OTHER tab to a 500 page — a
         real shelf unreachable because a rail could not be sorted. So: on the
         Classes tab the classes ARE the shelf and the error stands; on any
         other tab it is logged and the rail keeps its default
         order. The client also retries a 502/503/504 once before this is even
         reached (lib/supabase/fetch.ts). */
      if (tab === "classes") throw e;
      console.error("[Discover] the class list could not be read; the style rail keeps its default order:", e);
      return [];
    }),
    wantsBusinesses
      ? findNearbyBusinesses(supabase, {
          ...centre,
          radiusKm: radiusOf(filters),
          type: "studio",
          /* `p_limit`/`p_offset` are sent only for a page past the first, so the
             first page never depends on the paged signature (Rule 4's overload lesson) */
          ...(offset > 0 ? { limit: PAGE_SIZE, offset } : {}),
        })
      : Promise.resolve([]),
    user && tab === "classes" ? findMyEnrolledSessionIds(supabase) : Promise.resolve(new Map<string, { id: string; status: ClassBookingStatus }>()),
    wantsFollows && wantsBusinesses ? findMyFollowing(supabase) : Promise.resolve([]),
    wantsArtists ? findDiscoverArtists(supabase, { city: city || null, limit: PAGE_SIZE, offset }) : Promise.resolve([] as DiscoverArtist[]),
    wantsFollows && wantsArtists ? findMyFollowedPeople(supabase) : Promise.resolve([]),
  ]);

  const styleCount = new Map<string, number>();
  allClasses.forEach((c) => styleCount.set(c.style, (styleCount.get(c.style) ?? 0) + 1));
  const styleOrder = [...DOS_STYLE_NAMES].sort((a, b) => (styleCount.get(b) ?? 0) - (styleCount.get(a) ?? 0));

  /* ⚠ NO SECOND CITY FILTER HERE (2 Oct 2026): `findPublishedClasses` already
     narrows to the city a class is HELD in — the owner's, or the studio that
     accepted it. This line used to re-filter on the OWNER's city and threw away
     every artist's class held at a studio in another city, which is exactly the
     class the user found missing from Gurugram. */
  const inCity = filterClasses(
    allClasses,
    filters
  );

  /* THE TAB'S OWN READS, IN ONE ROUND TRIP (19 Sep 2026, "make app snappier" —
     these ran one after another, several of them serial for no reason):
     ⚠ the Events tab's own read (Step 21: published, still to come, in this
       city) went with events on 29 Sep 2026;
     · the Crews tab (Step 22);
     · ⚠ A CLASS WITH NOBODY TAKING IT IS NOT ON DISCOVER (18 Sep 2026, the user:
       "remove all classes on discover without an artist in it"). The test is the
       confirmed classPerson ROW, which everybody may read — not the teacher's name,
       which only a signed-in reader may — so the shelf is the same list for a
       stranger as for a member. (A published class should always have one since
       `classes_publish_needs_a_yes`; what this removes is what was published
       BEFORE that rule, on 18 Sep 2026.);
     · every business card ends with its styles — the styles of its published
       classes — and a style filter narrows through the same map. */
  const [crewsRaw, taught, stylesByBusiness] = await Promise.all([
    tab === "crews" ? findCrewsByCity(supabase, city) : Promise.resolve([]),
    tab === "classes" ? findClassesWithArtist(supabase, inCity.map((c) => c.id)) : Promise.resolve(new Set<string>()),
    wantsBusinesses ? findPublishedStylesByBusiness(supabase, nearby.map((t) => t.id)) : Promise.resolve(new Map<string, string[]>()),
  ]);
  const crews = tab === "crews" ? filterCrews(crewsRaw, filters) : [];
  const classes = tab === "classes" ? inCity.filter((c) => taught.has(c.id)) : inCity;

  /* the second round: what depends on the first — the seat counts, and WHO that
     teacher is: name and face, for the card's centre. A signed-out visitor may
     not read `profiles`, so that map is empty for them and the card falls back
     to the style square; the class is still ON the shelf, because the filter
     above asked a question anon can answer.
     ⚠ The host cards (18 Sep 2026) and what this person already held (27 Sep)
     went with events on 29 Sep. */
  const [counts, classArtists] = await Promise.all([
    tab === "classes" ? countEnrolledBySession(supabase, classes.map((c) => c.session?.id).filter(Boolean) as string[]) : Promise.resolve(new Map<string, number>()),
    tab === "classes" ? findClassArtists(supabase, classes.map((c) => c.id)) : Promise.resolve(new Map<string, ClassArtist>()),
  ]);
  const businesses = wantsBusinesses ? filterBusinesses(nearby, filters, stylesByBusiness) : [];
  const followed = following.filter((f) => f.businessType === "studio");
  /* an artist narrows by style through THEIR OWN styles — the ones on their profile */
  const artists = wantsArtists ? artistsRaw.filter((a) => filters.styles.length === 0 || a.styles.some((s) => filters.styles.includes(s))) : [];
  /* the follower count sits at the foot of every card — a number, never a name (Step 15);
     the faces come from the businesses themselves (the nearby RPC carries none) */
  /* ⚠⚠ AND THE POSTERS THE CARD SWIPES THROUGH (27 Sep 2026, the user: "Studio
     Cards on discover should have swipable photos in top section which are used
     in posters"). ONE query and ONE signing call for the whole shelf — fifty
     cards through `findBusinessHeaderPhotos` would be fifty RPCs and fifty
     signings, which is the per-card shape `findClassArtists` exists to avoid.
     They are the studio's own `studio_photos`, the same rows its poster rail
     draws, under the policy that makes a LISTED studio's pictures public. */
  const [followerCounts, facts, personCounts, shotsByBusiness] = await Promise.all([
    wantsBusinesses ? findFollowerCounts(supabase, businesses.map((t) => t.id)) : Promise.resolve(new Map<string, number>()),
    wantsBusinesses ? findBusinessCardFacts(supabase, [...businesses.map((t) => t.id), ...followed.map((f) => f.businessId)]) : Promise.resolve(new Map<string, BusinessCardFacts>()),
    wantsArtists ? findPersonFollowerCounts(supabase, artists.map((a) => a.id)) : Promise.resolve(new Map<string, { followers: number; following: number }>()),
    wantsBusinesses ? findStudioHeaderPhotosMany(supabase, businesses.map((t) => t.id)) : Promise.resolve(new Map<string, HeaderPhoto[]>()),
  ]);
  /* the face and the tick reach the cards together — one read, two facts (D7).
     The pin used to ride along for the map view; the map went on 18 Sep 2026. */
  businesses.forEach((t) => {
    t.photoPath = facts.get(t.id)?.photoPath ?? null;
    t.verifiedAt = facts.get(t.id)?.verifiedAt ?? null;
  });

  /* ⚠⚠ WHAT THIS SHELF ACTUALLY SHOWED (30 Sep 2026) — the writer for the
     `impressions` table `20260929140000` created and nothing had ever written
     to. Until now a studio with no bookings and a studio NOBODY WAS EVER SHOWN
     looked identical from every screen in the app, and they are opposite
     problems with opposite answers.
     ⚠ ONE ROW PER SHELF, in order — fifty cards is fifty rows under the obvious
     design, and "was I shown, and where in the list" is answered as well by an
     ordered array.
     ⚠ It runs AFTER the response has gone out, with the service role, and can
     never fail the page: Discover is the most-visited surface in the app and a
     measurement is not worth a 500.
     ⚠⚠ THE ARTISTS TAB IS DELIBERATELY NOT RECORDED. `impressions.subject_kind`
     admits `business | class | crew`, and an artist on this shelf is a PERSON
     since R24 — their id is a `profiles` id, not a business's. Filing them as
     'business' would put the wrong key in the column and quietly corrupt the one
     read that answers "was this studio shown"; widening the CHECK is a migration
     and belongs with its own approval. Said out loud rather than fudged. */
  const shownIds =
    tab === "classes" ? classes.map((c) => c.id) : tab === "crews" ? crews.map((c) => c.id) : wantsBusinesses ? businesses.map((b) => b.id) : [];
  if (shownIds.length > 0) {
    const shownKind = tab === "classes" ? "class" : tab === "crews" ? "crew" : "business";
    after(() =>
      recordImpression({
        viewerId: user?.id ?? null,
        surface: "discover",
        city: city || null,
        subjectKind: shownKind,
        subjectIds: shownIds,
      })
    );
  }
  const followedTiles: FollowedTile[] = wantsArtists
    ? /* the ARTISTS you follow are people (18 Sep 2026): the ones with a live plan, opening their profile */
      followedPeople
        .filter((p) => p.isArtist)
        .map((p) => ({ id: p.userId, name: p.name, kind: "artist" as const, href: `/person/${p.userId}`, photo: photoUrl(p.avatarPath ?? undefined), grad: gradientOf(p.name) }))
    : /* the STUDIOS shelf is studios (19 Sep 2026, the user: "there should be
         only one way to view these pages"): an artist is a person here, and a
         legacy follow of an artist BUSINESS belongs on the Artists tab beside
         the people, not under a heading that says Studios */
      followed
        .filter((f) => f.businessType === "studio")
        .map((f) => ({
        id: f.businessId,
        name: f.businessName,
        kind: "studio" as const,
        href: publicProfilePath({ id: f.businessId, type: f.businessType }),
        photo: photoUrl(facts.get(f.businessId)?.photoPath ?? undefined),
        grad: gradientOf(f.businessName),
      }));

  const shelfHead = tab === "classes" ? "Upcoming classes" : tab === "artists" ? "Artists" : tab === "crews" ? "Crews" : "Studios near you";
  const shelfCount = tab === "classes" ? classes.length : tab === "crews" ? crews.length : tab === "artists" ? artists.length : businesses.length;
  const narrowed = filters.styles.length > 0 || Object.keys(params).some((k) => ["sort", "dist", "when", "dur", "price", "cat", "fmt", "q"].includes(k));
  /* the shelf's foot (18 Sep 2026): the Studios and Artists shelves are paged —
     "Next page" while a FULL page came back (a shorter one is the end), "Previous"
     past the first; every other filter rides along in the address */
  const paged = wantsBusinesses || wantsArtists;
  const rawCount = wantsBusinesses ? nearby.length : wantsArtists ? artistsRaw.length : 0;
  const hasNext = paged && rawCount >= PAGE_SIZE;
  const hasPrev = paged && page > 1;
  const pageHref = (n: number): string => {
    const q = new URLSearchParams({ city, tab, ...filtersToParams(filters) });
    if (params.near) q.set("near", params.near);
    if (n > 1) q.set("page", String(n));
    /* ⚠ the acting profile rides every link off this page (27 Sep 2026) —
       dropping it on page 2 would hand back the Book button it removed */
    if (asRaw) q.set("as", asRaw);
    return `/discover?${q.toString()}`;
  };
  const pageFoot: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: INK, textDecoration: "none", padding: "9px 14px", borderRadius: 999, border: `1.5px solid ${EL}`, background: "var(--card)" };

  /* five section tabs (4571-4585): flex:1 tiles, the mark over a 10px word, the
     open one on the ink — and pressed the moment they are tapped (20 Sep 2026) */
  const tabTiles = (
    <DiscoverTabs
      active={tab}
      /* ⚠ the acting profile rides the tab links too (27 Sep 2026) — a tap on
         Classes must not be the way a studio gets its Book button back */
      tabs={TABS.map(([k, word, Icon]) => ({ key: k, word, href: withAs(`/discover?city=${encodeURIComponent(city)}&tab=${k}`, asRaw), icon: <Icon size={26} /> }))}
    />
  );

  return (
    <div
      style={{
        /* the page's own colour bleeding off the top (4491-4496): stops in PIXELS, so the wash
           always ends just under the section tabs no matter how long the list below runs */
        background: `linear-gradient(180deg, ${SKY}80 0px, ${SKY}3d 150px, ${SKY}12 250px, var(--bg) 340px)`,
        backgroundColor: "var(--bg)",
        backgroundRepeat: "no-repeat",
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        minHeight: "100vh",
        padding: "16px 16px 40px",
        boxSizing: "border-box",
        transition: "background .25s",
      }}
    >
      {/* THE TOP OF DISCOVER (4501-4531): what this page IS, set large; what it
          is doing for you, small; and THE PLACE ONCE.

          ⚠⚠ THE TWO LINES CHANGED PLACES (28 Sep 2026, the user: "Discover
          should be the bigger heading like other pages and dancer near you
          smaller and in same line as the location dropdown"), which REVERSES the
          hierarchy shipped the day before. 27 Sep read "bigger discover heading"
          as *make the heading on Discover bigger* and set "Dance near you" to 34px
          over a 9.5px DISCOVER eyebrow; it meant *make the word Discover the
          heading*. Both readings are available in those four words and the user's
          is the one that counts — so the eyebrow is gone and **"Discover" is the
          page's `<h1>`**, which is also the first one this page has ever had:
          `AppChrome` draws the wordmark over a TAB and no heading, so Discover
          was a screen with no `<h1>` at all, the fifth time this repo has found
          that shape (the desks 18 Sep, the studio Team desk 21 Sep, `EventForm`
          and `/rooms` 22 Sep, the Inbox 27 Sep).

          ⚠ 34px is not a new size — it is `DOS_TYPE.display`, what a person's
          name is set at on their own profile — so it is the same scale the
          27 Sep cut used, now on the word that earns it.

          ⚠ AND THE CHIP SHARES ITS LINE NOW, which C45 refused on 21 Sep for a
          reason that has stopped applying: *"a display heading and a chip cannot
          share a line on a 430px phone without the heading losing words"*. True
          of a 34px heading, and "Dance near you" is the SMALL line here — 12.5px
          against a chip that is ~110px wide, so 398px of content holds both with
          room to spare, and the sub-line ellipsises rather than pushing the chip
          off if a longer sentence ever lands there. The 5px keeps the measured
          rhythm the 27 Sep probe established. */}
      {/* ⚠ THE SUB-LINE IS THE PAGE'S LINE NOW (2 Oct 2026, the user: "Dance near
          you to be changed to - Dance First, Think Later ! with a bit bigger
          font"), and both it and the heading read `TAB_TITLE` / `TAB_SUB`, the
          pair the Inbox reads too. ⚠ It still shares the chip's line and still
          ellipsises before it pushes the chip off. */}
      <h1 data-testid="discover-title" style={{ ...TAB_TITLE, color: INK }}>
        Discover
      </h1>
      <div data-testid="discover-place-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 5, minWidth: 0 }}>
        <span data-testid="discover-sub" style={{ ...TAB_SUB, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Dance First, Think Later!
        </span>
        <PlaceChip city={city} cities={cities.map((c) => c.city)} tab={tab} extra={{ ...filtersToParams(filters), ...(asRaw ? { as: asRaw } : {}) }} near={near !== null} offerNearMe={wantsBusinesses} />
      </div>

      {/* the search box, the five tabs, the style rail, Filters + quick chips, the filter sheet (Step 23) */}
      <DiscoverFilters tab={tab} city={city} filters={filters} styleOrder={styleOrder} tabs={tabTiles} as={asRaw} />

      {/* "Followed by you" (FollowedRow 4112, mounted 4767) — Studios and Artists, for a signed-in person */}
      {wantsFollows ? <FollowedShelf rows={followedTiles} /> : null}

      {/* ⚠ THE SHELF STANDS ON ITS OWN INVERTED GROUND (21 Sep 2026, the user:
          "give similar dark and light opposite theme like tools on the discover
          tab for section under the followed by you section"). The same squircle
          the tool grids wear — and NOT the same two colours, which is the whole
          finding: a tool tile is an opaque gradient and survives any ground,
          while every card down here stands on `--card` (an alpha veil) and
          prints in `--text`, so a two-colour panel would have hidden the lot.
          `InvertedPanel` swaps the palette instead, and the head, the cards, the
          pager and the empty state below need no change of their own — they read
          the same tokens they always did, which now mean the other theme. */}
      <InvertedPanel
        head={
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 0 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.3 }}>{shelfHead}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: SUB }} data-testid="shelf-count">
              {shelfCount} in {city}
            </div>
          </div>
        }
      >
      {tab === "classes" &&
        classes.map((c) => {
          const filled = c.session ? counts.get(c.session.id) ?? 0 : 0;
          return (
            <ClassTile
              key={c.id}
              danceClass={c}
              filled={filled}
              artist={classArtists.get(c.id) ?? null}
              /* the city it is HELD in — a studio's room beats its owner's home */
              city={c.venueStatus === "accepted" && c.venueCity ? c.venueCity : c.businessCity}
              href={withAs(`/c/${c.shareSlug}`, asRaw)}
              actions={
                c.session ? (
                  <EnrollButton
                    sessionId={c.session.id}
                    isFull={filled >= c.capacity}
                    isSignedIn={Boolean(user)}
                    mine={mine.get(c.session.id) ?? null}
                    priceInr={c.priceInr}
                    shareSlug={c.shareSlug}
                    cannotBookWhy={noClass}
                  />
                ) : null
              }
            />
          );
        })}

      {/* ⚠ `stylesByBusiness` is still READ and still narrows the shelf — it just no
          longer reaches the card (27 Sep 2026, "remove dance styles from studio,
          artist and crew discover cards"). A style filter is answered by the same
          map it always was. */}
      {tab === "studios" &&
        businesses.map((t) => (
          <StudioCard
            key={t.id}
            business={t}
            followers={followerCounts.get(t.id) ?? 0}
            shots={(shotsByBusiness.get(t.id) ?? []).filter((p) => p.url).map((p) => ({ key: p.id, src: p.url as string, signed: p.signed }))}
          />
        ))}

      {/* artists draw the CompactCard, two to a row (4376-4423, 4815) — each one
          a PERSON with a live plan, opening their profile (18 Sep 2026) */}
      {tab === "artists" && artists.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {artists.map((a) => (
            <CompactCard
              key={a.id}
              href={`/person/${a.id}`}
              ariaLabel={`Open ${a.name}`}
              name={a.name}
              label="ARTIST"
              photo={photoUrl(a.photoPath ?? undefined)}
              grad={gradientOf(a.name)}
              city={a.city ?? "—"}
              km={null}
              verified={Boolean(a.verifiedAt)}
              foot={<DosFollowers n={personCounts.get(a.id)?.followers ?? 0} size={11} />}
            />
          ))}
        </div>
      )}

      {tab === "crews" && crews.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {crews.map((c) => (
            <CrewCard key={c.id} crew={c} />
          ))}
        </div>
      )}

      {/* ⚠ THE EVENTS SHELF WENT WITH EVENTS (29 Sep 2026): the app's one
          `EventCard`, its host named with a picture (18 Sep), and the
          `EventBookButton` that was `EnrollButton`'s twin (27 Sep). */}

      {/* the shelf's foot: one page at a time (18 Sep 2026) */}
      {(hasPrev || hasNext) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14 }} data-testid="shelf-pager">
          {hasPrev ? (
            <Link href={pageHref(page - 1)} style={pageFoot} aria-label="Previous page">
              ‹ Previous
            </Link>
          ) : (
            <span />
          )}
          <span style={{ fontSize: 10.5, fontWeight: 800, color: SUB }}>Page {page}</span>
          {hasNext ? (
            <Link href={pageHref(page + 1)} style={pageFoot} aria-label="Next page">
              Next page ›
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}

      {shelfCount === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: SUB,
            border: `1.5px dashed ${EL}`,
            borderRadius: 20,
            fontSize: 13,
          }}
        >
          {narrowed ? (
            <>
              <div style={{ fontSize: 26 }}>🕺</div>
              <div style={{ fontWeight: 700, color: INK, marginTop: 6 }}>Nothing in {city} matches that</div>
              <Link href={withAs(`/discover?city=${encodeURIComponent(city)}&tab=${tab}`, asRaw)} style={{ display: "inline-block", marginTop: 7, fontSize: 11.5, fontWeight: 800, color: SUB, textDecoration: "none" }}>
                Clear filters
              </Link>
            </>
          ) : tab === "classes" ? (
            `No upcoming classes in ${city} — try another city.`
          ) : tab === "crews" ? (
            `No crews in ${city} yet — lead one from Crews on Home.`
          ) : tab === "artists" ? (
            hasPrev ? "No more artists here." : `No artists in ${city} yet.`
          ) : hasPrev ? (
            "No more studios here."
          ) : (
            `Nothing within ${radiusOf(filters)} km of ${city} yet.`
          )}
        </div>
      )}
      </InvertedPanel>
    </div>
  );
}
