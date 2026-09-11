import Link from "next/link";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { CrewCard } from "@/features/crews/components/CrewCard";
import { CrewI } from "@/features/crews/components/crew-kit";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { CityChip } from "@/features/discovery/components/CityChip";
import { CompactCard } from "@/features/discovery/components/CompactCard";
import { DiscoverFilters } from "@/features/discovery/components/DiscoverFilters";
import { DiscoverMap } from "@/features/discovery/components/DiscoverMap";
import { FollowedShelf, type FollowedTile } from "@/features/discovery/components/FollowedShelf";
import { NearMeChip } from "@/features/discovery/components/NearMeChip";
import type { MapMarker } from "@/features/geo/components/GoogleMap";
import { StudioCard } from "@/features/discovery/components/StudioCard";
import { ArtistI, ClassI, DosFollowers, EventI, kmLabel, StudioI } from "@/features/discovery/components/discover-kit";
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
import { findPublishedClasses, findPublishedStylesByTenant } from "@/repositories/classes";
import { findCrewsByCity } from "@/repositories/crews";
import { findNearbyTenants, findTenantCardFacts, type TenantCardFacts } from "@/repositories/discovery";
import { findPublishedEvents } from "@/repositories/events";
import { findFollowerCounts, findMyFollowing } from "@/repositories/follows";
import { countEnrolledBySession, findMyEnrolledSessionIds } from "@/repositories/enrollments";
import { findProfileById } from "@/repositories/profiles";
import type { EnrollmentStatus } from "@/types/enrollment";

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
  /* LIST OR MAP (11 Sep 2026): the same shelf, drawn as pins. A toggle rather
     than always-on, because every map view is a Maps JavaScript API load that
     Google bills per view once the demo key is retired — and because a list is
     still the faster way to read twenty names. */
  const view: "list" | "map" = params.view === "map" ? "map" : "list";
  const filters = parseFilters(params, DOS_STYLE_NAMES);
  const wantsBusinesses = tab === "studios" || tab === "artists";
  /* the follow shelf heads Studios and Artists for a signed-in person; a crew has no follow yet */
  const wantsFollows = Boolean(user) && wantsBusinesses;

  /* every published class is read on every tab: the classes shelf needs them,
     and the style rail is ORDERED by how many classes each style has (4212) */
  const [allClasses, nearby, mine, following] = await Promise.all([
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
          type: tab === "studios" ? "studio" : "trainer_business",
        })
      : Promise.resolve([]),
    user && tab === "classes" ? findMyEnrolledSessionIds(supabase) : Promise.resolve(new Map<string, { id: string; status: EnrollmentStatus }>()),
    wantsFollows ? findMyFollowing(supabase) : Promise.resolve([]),
  ]);

  const styleCount = new Map<string, number>();
  allClasses.forEach((c) => styleCount.set(c.style, (styleCount.get(c.style) ?? 0) + 1));
  const styleOrder = [...DOS_STYLE_NAMES].sort((a, b) => (styleCount.get(b) ?? 0) - (styleCount.get(a) ?? 0));

  /* Discover's Events tab (Step 21): published, still to come, in this city */
  const events = tab === "events" ? filterEvents(await findPublishedEvents(supabase, dayKeyOf(stampNowIso()), city), filters) : [];
  /* Discover's Crews tab (Step 22) */
  const crews = tab === "crews" ? filterCrews(await findCrewsByCity(supabase, city), filters) : [];

  const classes = filterClasses(
    allClasses.filter((c) => c.tenantCity === city),
    filters
  );
  const counts = tab === "classes" ? await countEnrolledBySession(supabase, classes.map((c) => c.session?.id).filter(Boolean) as string[]) : new Map<string, number>();

  /* every business card ends with its styles — the styles of its published
     classes — and a style filter narrows through the same map */
  const stylesByTenant = wantsBusinesses ? await findPublishedStylesByTenant(supabase, nearby.map((t) => t.id)) : new Map<string, string[]>();
  const businesses = wantsBusinesses ? filterTenants(nearby, filters, stylesByTenant) : [];
  const followed = following.filter((f) => f.tenantType === (tab === "studios" ? "studio" : "trainer_business"));
  /* the follower count sits at the foot of every business card — a number, never a name (Step 15);
     the faces come from the tenants themselves (the nearby RPC carries none) */
  const [followerCounts, facts] = await Promise.all([
    wantsBusinesses ? findFollowerCounts(supabase, businesses.map((t) => t.id)) : Promise.resolve(new Map<string, number>()),
    wantsBusinesses ? findTenantCardFacts(supabase, [...businesses.map((t) => t.id), ...followed.map((f) => f.tenantId)]) : Promise.resolve(new Map<string, TenantCardFacts>()),
  ]);
  /* the face and the tick reach the cards together — one read, two facts (D7);
     the point rides along for the map view (11 Sep 2026) */
  businesses.forEach((t) => {
    t.photoPath = facts.get(t.id)?.photoPath ?? null;
    t.verifiedAt = facts.get(t.id)?.verifiedAt ?? null;
    t.lat = facts.get(t.id)?.lat ?? null;
    t.lng = facts.get(t.id)?.lng ?? null;
  });
  /* THE PINS: only businesses that have placed themselves. The rest sit on the
     city's centroid, and twenty pins on one point is not a map of anything. */
  const markers: MapMarker[] = businesses
    .filter((t) => t.located && t.lat != null && t.lng != null)
    .map((t) => ({
      id: t.id,
      lat: t.lat as number,
      lng: t.lng as number,
      label: `${t.name}${t.area ? ` · ${t.area}` : ""}`,
      href: publicProfilePath(t),
      tint: t.type === "trainer_business" ? "#EC4899" : "#3B82F6",
    }));
  const followedTiles: FollowedTile[] = followed.map((f) => ({
    id: f.tenantId,
    name: f.tenantName,
    kind: f.tenantType === "studio" ? "studio" : "artist",
    href: publicProfilePath({ id: f.tenantId, type: f.tenantType }),
    photo: photoUrl(facts.get(f.tenantId)?.photoPath ?? undefined),
    grad: gradientOf(f.tenantName),
  }));

  const shelfHead = tab === "classes" ? "Upcoming classes" : tab === "studios" ? "Studios near you" : tab === "artists" ? "Artists" : tab === "crews" ? "Crews" : "Events near you";
  const shelfCount = tab === "classes" ? classes.length : tab === "events" ? events.length : tab === "crews" ? crews.length : businesses.length;
  const narrowed = filters.styles.length > 0 || Object.keys(params).some((k) => ["sort", "dist", "when", "dur", "price", "cat", "fmt", "q"].includes(k));

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
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 5, minWidth: 0 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 27, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -1, lineHeight: 1.05, color: INK }}>Dance near you</span>
        <CityChip city={city || "Anywhere"} cities={cities.map((c) => c.city)} tab={tab} extra={filtersToParams(filters)} />
      </div>

      {/* "near you" can now mean YOU (11 Sep 2026) — the chip swaps the city's
          centre for the browser's own point, and the distance on every card
          becomes a distance to the person reading it */}
      {wantsBusinesses ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, minWidth: 0, flexWrap: "wrap" }}>
          <NearMeChip on={near !== null} params={{ city, tab, ...filtersToParams(filters), ...(view === "map" ? { view: "map" } : {}) }} />
          {/* the same shelf as pins on a map, or back to names (11 Sep 2026) */}
          <Link
            href={`/discover?${new URLSearchParams({ city, tab, ...filtersToParams(filters), ...(near ? { near: `${near.lat},${near.lng}` } : {}), ...(view === "map" ? {} : { view: "map" }) }).toString()}`}
            aria-pressed={view === "map"}
            aria-label={view === "map" ? "Show as a list" : "Show on a map"}
            style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 4, height: 30, padding: "0 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap", background: view === "map" ? "var(--text)" : "var(--card)", color: view === "map" ? "var(--solid)" : SUB, border: `1px solid ${view === "map" ? "var(--text)" : EL}` }}
          >
            {view === "map" ? "☰ List" : "🗺 Map"}
          </Link>
        </div>
      ) : null}

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
              tenantName={c.tenantName}
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

      {/* THE MAP, above the list it draws (11 Sep 2026) */}
      {wantsBusinesses && view === "map" ? (
        <DiscoverMap centre={centre} markers={markers} unplaced={businesses.length - markers.length} what={tab === "studios" ? "Studios" : "Artists"} />
      ) : null}

      {tab === "studios" && businesses.map((t) => <StudioCard key={t.id} tenant={t} followers={followerCounts.get(t.id) ?? 0} styles={stylesByTenant.get(t.id) ?? []} />)}

      {/* artists draw the CompactCard, two to a row (4376-4423, 4815) */}
      {tab === "artists" && businesses.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {businesses.map((t) => (
            <CompactCard
              key={t.id}
              href={publicProfilePath(t)}
              ariaLabel={`Open ${t.name}`}
              name={t.name}
              label="ARTIST"
              photo={photoUrl(t.photoPath)}
              grad={gradientOf(t.name)}
              city={t.city ?? t.area ?? "—"}
              km={t.located ? kmLabel(t.distanceKm) : null}
              styles={stylesByTenant.get(t.id) ?? []}
              verified={Boolean(t.verifiedAt)}
              foot={<DosFollowers n={followerCounts.get(t.id) ?? 0} size={11} />}
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

      {tab === "events" && events.map((e) => <EventCard key={e.id} event={e} href={`/e/${e.shareSlug}`} />)}

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
          ) : (
            `Nothing within ${radiusOf(filters)} km of ${city} yet.`
          )}
        </div>
      )}
    </div>
  );
}
