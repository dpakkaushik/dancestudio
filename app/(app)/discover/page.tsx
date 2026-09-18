import Link from "next/link";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { CrewCard } from "@/features/crews/components/CrewCard";
import { CrewI } from "@/features/crews/components/crew-kit";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { CityChip } from "@/features/discovery/components/CityChip";
import { CompactCard } from "@/features/discovery/components/CompactCard";
import { DiscoverFilters } from "@/features/discovery/components/DiscoverFilters";
import { FollowedShelf, type FollowedTile } from "@/features/discovery/components/FollowedShelf";
import { NearMeChip } from "@/features/discovery/components/NearMeChip";
import { StudioCard } from "@/features/discovery/components/StudioCard";
import { ArtistI, ClassI, DosFollowers, EventI, StudioI } from "@/features/discovery/components/discover-kit";
import { filterClasses, filterCrews, filterEvents, filterTenants, filtersToParams, parseFilters, radiusOf } from "@/features/discovery/filters";
import { EventCard } from "@/features/events/components/EventCard";
import { gradientOf } from "@/features/profiles/components/PublicProfile";
import { DOS_STYLE_NAMES } from "@/lib/constants/styles";
import { INDIA_CENTRE, centreOf, findDiscoverCities } from "@/repositories/cities";
import { DOS_DISPLAY, DOS_UI, INK, PINK, SUB } from "@/lib/design/tokens";
import { dayKeyOf } from "@/lib/format/month";
import { photoUrl } from "@/lib/media/photo";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassArtists, findClassesWithArtist } from "@/repositories/claims";
import { findPublishedClasses, findPublishedStylesByTenant } from "@/repositories/classes";
import { findCrewsByCity } from "@/repositories/crews";
import { findDiscoverArtists, findNearbyTenants, findTenantCardFacts, type DiscoverArtist, type TenantCardFacts } from "@/repositories/discovery";
import { findPublishedEvents } from "@/repositories/events";
import { findFollowerCounts, findMyFollowedPeople, findMyFollowing } from "@/repositories/follows";
import { findPersonFollowerCounts } from "@/repositories/publicPerson";
import { findEventHostCards, type EventHostCard } from "@/repositories/publicOrganization";
import type { ClassArtist } from "@/types/claim";
import { countEnrolledBySession, findMyEnrolledSessionIds } from "@/repositories/enrollments";
import { findProfileById } from "@/repositories/profiles";
import type { EnrollmentStatus } from "@/types/enrollment";

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
const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" };

/** ENTITY_TABS (prototype 4149) — the prototype's order, opening on Studios.
 *  The URL words are the ones the app has always used, so every existing link
 *  keeps working. */
const TABS = [
  ["studios", "Studios", StudioI],
  ["artists", "Artists", ArtistI],
  ["crews", "Crews", CrewI],
  ["classes", "Classes", ClassI],
  ["events", "Events", EventI],
] as const;

const stampNowIso = (): string => new Date().toISOString();

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
  const [profile, cities] = await Promise.all([
    user ? findProfileById(supabase, user.id) : Promise.resolve(null),
    findDiscoverCities(supabase),
  ]);
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
         requests, and that one answer took the whole Events tab to a 500 page —
         a shelf of real, published events unreachable because a rail could not
         be sorted. So: on the Classes tab the classes ARE the shelf and the error
         stands; on any other tab it is logged and the rail keeps its default
         order. The client also retries a 502/503/504 once before this is even
         reached (lib/supabase/fetch.ts). */
      if (tab === "classes") throw e;
      console.error("[Discover] the class list could not be read; the style rail keeps its default order:", e);
      return [];
    }),
    wantsBusinesses
      ? findNearbyTenants(supabase, {
          ...centre,
          radiusKm: radiusOf(filters),
          type: "studio",
          /* `p_limit`/`p_offset` are sent only for a page past the first, so the
             first page never depends on the paged signature (Rule 4's overload lesson) */
          ...(offset > 0 ? { limit: PAGE_SIZE, offset } : {}),
        })
      : Promise.resolve([]),
    user && tab === "classes" ? findMyEnrolledSessionIds(supabase) : Promise.resolve(new Map<string, { id: string; status: EnrollmentStatus }>()),
    wantsFollows && wantsBusinesses ? findMyFollowing(supabase) : Promise.resolve([]),
    wantsArtists ? findDiscoverArtists(supabase, { city: city || null, limit: PAGE_SIZE, offset }) : Promise.resolve([] as DiscoverArtist[]),
    wantsFollows && wantsArtists ? findMyFollowedPeople(supabase) : Promise.resolve([]),
  ]);

  const styleCount = new Map<string, number>();
  allClasses.forEach((c) => styleCount.set(c.style, (styleCount.get(c.style) ?? 0) + 1));
  const styleOrder = [...DOS_STYLE_NAMES].sort((a, b) => (styleCount.get(b) ?? 0) - (styleCount.get(a) ?? 0));

  /* Discover's Events tab (Step 21): published, still to come, in this city */
  const events = tab === "events" ? filterEvents(await findPublishedEvents(supabase, dayKeyOf(stampNowIso()), city), filters) : [];
  /* who hosts each of them, with a picture and the organization's page (18 Sep 2026) */
  const hosts = tab === "events" ? await findEventHostCards(supabase, events.map((e) => e.tenantId)) : new Map<string, EventHostCard>();
  /* Discover's Crews tab (Step 22) */
  const crews = tab === "crews" ? filterCrews(await findCrewsByCity(supabase, city), filters) : [];

  const inCity = filterClasses(
    allClasses.filter((c) => c.tenantCity === city),
    filters
  );
  /* ⚠ A CLASS WITH NOBODY TAKING IT IS NOT ON DISCOVER (18 Sep 2026, the user:
     "remove all classes on discover without an artist in it"). The test is the
     confirmed claim ROW, which everybody may read — not the teacher's name,
     which only a signed-in reader may — so the shelf is the same list for a
     stranger as for a member. (A published class should always have one since
     `classes_publish_needs_a_yes`; what this removes is what was published
     BEFORE that rule, on 18 Sep 2026.) */
  const taught = tab === "classes" ? await findClassesWithArtist(supabase, inCity.map((c) => c.id)) : new Set<string>();
  const classes = tab === "classes" ? inCity.filter((c) => taught.has(c.id)) : inCity;
  const counts = tab === "classes" ? await countEnrolledBySession(supabase, classes.map((c) => c.session?.id).filter(Boolean) as string[]) : new Map<string, number>();
  /* WHO that teacher is — name and face, for the card's centre. A signed-out
     visitor may not read `profiles`, so this map is empty for them and the card
     falls back to the style square; the class is still ON the shelf, because the
     filter above asked a question anon can answer. */
  const classArtists = tab === "classes" ? await findClassArtists(supabase, classes.map((c) => c.id)) : new Map<string, ClassArtist>();

  /* every business card ends with its styles — the styles of its published
     classes — and a style filter narrows through the same map */
  const stylesByTenant = wantsBusinesses ? await findPublishedStylesByTenant(supabase, nearby.map((t) => t.id)) : new Map<string, string[]>();
  const businesses = wantsBusinesses ? filterTenants(nearby, filters, stylesByTenant) : [];
  const followed = following.filter((f) => f.tenantType === "studio");
  /* an artist narrows by style through THEIR OWN styles — the ones on their profile */
  const artists = wantsArtists ? artistsRaw.filter((a) => filters.styles.length === 0 || a.styles.some((s) => filters.styles.includes(s))) : [];
  /* the follower count sits at the foot of every card — a number, never a name (Step 15);
     the faces come from the businesses themselves (the nearby RPC carries none) */
  const [followerCounts, facts, personCounts] = await Promise.all([
    wantsBusinesses ? findFollowerCounts(supabase, businesses.map((t) => t.id)) : Promise.resolve(new Map<string, number>()),
    wantsBusinesses ? findTenantCardFacts(supabase, [...businesses.map((t) => t.id), ...followed.map((f) => f.tenantId)]) : Promise.resolve(new Map<string, TenantCardFacts>()),
    wantsArtists ? findPersonFollowerCounts(supabase, artists.map((a) => a.id)) : Promise.resolve(new Map<string, { followers: number; following: number }>()),
  ]);
  /* the face and the tick reach the cards together — one read, two facts (D7).
     The pin used to ride along for the map view; the map went on 18 Sep 2026. */
  businesses.forEach((t) => {
    t.photoPath = facts.get(t.id)?.photoPath ?? null;
    t.verifiedAt = facts.get(t.id)?.verifiedAt ?? null;
  });
  const followedTiles: FollowedTile[] = wantsArtists
    ? /* the ARTISTS you follow are people (18 Sep 2026): the ones with a live plan, opening their profile */
      followedPeople
        .filter((p) => p.isArtist)
        .map((p) => ({ id: p.userId, name: p.name, kind: "artist" as const, href: `/person/${p.userId}`, photo: photoUrl(p.avatarPath ?? undefined), grad: gradientOf(p.name) }))
    : followed.map((f) => ({
        id: f.tenantId,
        name: f.tenantName,
        kind: "studio" as const,
        href: publicProfilePath({ id: f.tenantId, type: f.tenantType }),
        photo: photoUrl(facts.get(f.tenantId)?.photoPath ?? undefined),
        grad: gradientOf(f.tenantName),
      }));

  const shelfHead = tab === "classes" ? "Upcoming classes" : tab === "studios" ? "Studios near you" : tab === "artists" ? "Artists" : tab === "crews" ? "Crews" : "Events near you";
  const shelfCount = tab === "classes" ? classes.length : tab === "events" ? events.length : tab === "crews" ? crews.length : tab === "artists" ? artists.length : businesses.length;
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
    return `/discover?${q.toString()}`;
  };
  const pageFoot: React.CSSProperties = { fontSize: 11.5, fontWeight: 800, color: INK, textDecoration: "none", padding: "9px 14px", borderRadius: 999, border: `1.5px solid ${EL}`, background: "var(--card)" };

  /* five section tabs (4571-4585): flex:1 tiles, the mark over a 10px word, the open one on the ink */
  const tabTiles = (
    <div style={{ display: "flex", gap: 6, margin: "10px 0 4px" }}>
      {TABS.map(([k, word, Icon]) => {
        const on = tab === k;
        return (
          <Link
            key={k}
            href={`/discover?city=${encodeURIComponent(city)}&tab=${k}`}
            aria-label={word}
            aria-current={on ? "page" : undefined}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              padding: "10px 2px 8px",
              borderRadius: 14,
              textDecoration: "none",
              background: on ? "var(--text)" : "var(--card)",
              color: on ? "var(--solid)" : SUB,
              border: `1.5px solid ${on ? "var(--text)" : EL}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon size={26} />
            <div style={{ fontSize: 10, fontWeight: 800 }}>{word}</div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div
      style={{
        /* the page's own colour bleeding off the top (4491-4496): stops in PIXELS, so the wash
           always ends just under the section tabs no matter how long the list below runs */
        background: `linear-gradient(180deg, ${PINK}80 0px, ${PINK}3d 150px, ${PINK}12 250px, var(--bg) 340px)`,
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
      {/* THE TOP OF DISCOVER (4501-4531): a small word saying what this is, the title set large, THE PLACE ONCE */}
      <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>DISCOVER</div>
      {/* ⚠ WHERE YOU ARE, ON ONE LINE (18 Sep 2026, the user: "place near me
          alongside Location drop down, adjust in the best way"). The two controls
          answer the SAME question — measure from this city, or measure from me —
          so they belong side by side rather than stacked, and Near me sat on a
          row of its own only because the map toggle used to keep it company.
          The title takes the line above and the pair takes the one under it, at
          the right, because a 27px display heading and two chips cannot share a
          line on a 430px phone without the heading losing words. */}
      <div style={{ marginTop: 5, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 27, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -1, lineHeight: 1.05, color: INK }}>Dance near you</span>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8, minWidth: 0, flexWrap: "wrap" }}>
          {/* Near me first: it is the one that CHANGES what the city chip means */}
          {wantsBusinesses ? <NearMeChip on={near !== null} params={{ city, tab, ...filtersToParams(filters) }} /> : null}
          <CityChip city={city || "Anywhere"} cities={cities.map((c) => c.city)} tab={tab} extra={filtersToParams(filters)} />
        </div>
      </div>

      {/* the search box, the five tabs, the style rail, Filters + quick chips, the filter sheet (Step 23) */}
      <DiscoverFilters tab={tab} city={city} filters={filters} styleOrder={styleOrder} tabs={tabTiles} />

      {/* "Followed by you" (FollowedRow 4112, mounted 4767) — Studios and Artists, for a signed-in person */}
      {wantsFollows ? <FollowedShelf rows={followedTiles} /> : null}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 0 10px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.3 }}>{shelfHead}</div>
        <div style={{ fontSize: 11, fontWeight: 800, color: SUB }} data-testid="shelf-count">
          {shelfCount} in {city}
        </div>
      </div>

      {tab === "classes" &&
        classes.map((c) => {
          const filled = c.session ? counts.get(c.session.id) ?? 0 : 0;
          return (
            <ClassTile
              key={c.id}
              danceClass={c}
              filled={filled}
              artist={classArtists.get(c.id) ?? null}
              city={c.tenantCity}
              href={`/c/${c.shareSlug}`}
              actions={
                c.session ? (
                  <EnrollButton
                    sessionId={c.session.id}
                    isFull={filled >= c.capacity}
                    isSignedIn={Boolean(user)}
                    mine={mine.get(c.session.id) ?? null}
                    priceInr={c.priceInr}
                    shareSlug={c.shareSlug}
                  />
                ) : null
              }
            />
          );
        })}

      {tab === "studios" && businesses.map((t) => <StudioCard key={t.id} tenant={t} followers={followerCounts.get(t.id) ?? 0} styles={stylesByTenant.get(t.id) ?? []} />)}

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
              styles={a.styles}
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

      {tab === "events" &&
        events.map((e) => {
          const h = hosts.get(e.tenantId);
          return <EventCard key={e.id} event={e} href={`/e/${e.shareSlug}`} host={h ? { name: h.name, photo: photoUrl(h.photoPath ?? undefined), href: h.orgId ? `/org/${h.orgId}` : null } : null} />;
        })}

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
              <Link href={`/discover?city=${encodeURIComponent(city)}&tab=${tab}`} style={{ display: "inline-block", marginTop: 7, fontSize: 11.5, fontWeight: 800, color: SUB, textDecoration: "none" }}>
                Clear filters
              </Link>
            </>
          ) : tab === "classes" ? (
            `No upcoming classes in ${city} — try another city.`
          ) : tab === "events" ? (
            "No events match that yet."
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
    </div>
  );
}
