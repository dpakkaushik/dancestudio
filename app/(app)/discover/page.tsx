import Link from "next/link";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { CrewCard } from "@/features/crews/components/CrewCard";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { DiscoverFilters } from "@/features/discovery/components/DiscoverFilters";
import { StudioCard } from "@/features/discovery/components/StudioCard";
import { filterClasses, filterCrews, filterEvents, filterTenants, parseFilters, radiusOf } from "@/features/discovery/filters";
import { EventCard } from "@/features/events/components/EventCard";
import { DOS_CITIES, DOS_CITY_CENTROIDS, type DosCity } from "@/lib/constants/cities";
import { DOS_STYLE_NAMES } from "@/lib/constants/styles";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { dayKeyOf } from "@/lib/format/month";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedClasses, findPublishedStylesByTenant } from "@/repositories/classes";
import { findCrewsByCity } from "@/repositories/crews";
import { findNearbyTenants } from "@/repositories/discovery";
import { findPublishedEvents } from "@/repositories/events";
import { findFollowerCounts } from "@/repositories/follows";
import { countEnrolledBySession, findMyEnrolledSessionIds } from "@/repositories/enrollments";
import { findProfileById } from "@/repositories/profiles";
import type { EnrollmentStatus } from "@/types/enrollment";

const EL = "var(--el)";
const CARD = "var(--card)";
const TABS = [
  ["classes", "Classes"],
  ["studios", "Studios"],
  ["artists", "Artists"],
  ["crews", "Crews"],
  ["events", "Events"],
] as const;

const stampNowIso = (): string => new Date().toISOString();

const isCity = (v: string | undefined): v is DosCity => Boolean(v) && (DOS_CITIES as readonly string[]).includes(v as string);

/** Discover — lifted from the prototype's S_discover: the city rail, the one
 *  search box, the entity tabs, THE STYLE RAIL, Filters and the quick chips,
 *  then the shelf for the tab you are on (4425-4895). Since Step 23 every way
 *  of narrowing a list is URL state, applied here on the server with the
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

  const profile = user ? await findProfileById(supabase, user.id) : null;
  const city: DosCity = isCity(params.city) ? params.city : isCity(profile?.city ?? undefined) ? (profile!.city as DosCity) : "Pune";
  const tab = TABS.some(([k]) => k === params.tab) ? (params.tab as string) : "classes";
  const centre = DOS_CITY_CENTROIDS[city];
  const filters = parseFilters(params, DOS_STYLE_NAMES);
  const wantsBusinesses = tab === "studios" || tab === "artists";

  /* every published class is read on every tab: the classes shelf needs them,
     and the style rail is ORDERED by how many classes each style has (4212) */
  const [allClasses, nearby, mine] = await Promise.all([
    findPublishedClasses(supabase, 200),
    wantsBusinesses
      ? findNearbyTenants(supabase, {
          ...centre,
          radiusKm: radiusOf(filters),
          type: tab === "studios" ? "studio" : "trainer_business",
        })
      : Promise.resolve([]),
    user && tab === "classes" ? findMyEnrolledSessionIds(supabase) : Promise.resolve(new Map<string, { id: string; status: EnrollmentStatus }>()),
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

  /* a business is narrowed by style through the styles of its published classes */
  const stylesByTenant = wantsBusinesses && filters.styles.length ? await findPublishedStylesByTenant(supabase, nearby.map((t) => t.id)) : new Map<string, string[]>();
  const businesses = wantsBusinesses ? filterTenants(nearby, filters, stylesByTenant) : [];
  /* the follower count sits at the foot of every business card — a number, never a name (Step 15) */
  const followerCounts = wantsBusinesses ? await findFollowerCounts(supabase, businesses.map((t) => t.id)) : new Map<string, number>();

  const shelfHead = tab === "classes" ? "Upcoming classes" : tab === "studios" ? "Studios near you" : tab === "artists" ? "Artists near you" : tab === "crews" ? "Crews" : "Events near you";
  const shelfCount = tab === "classes" ? classes.length : tab === "events" ? events.length : tab === "crews" ? crews.length : businesses.length;
  const narrowed = filters.styles.length > 0 || Object.keys(params).some((k) => ["sort", "dist", "when", "dur", "price", "cat", "fmt", "q"].includes(k));

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
      <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, margin: "8px 0 10px" }}>Discover</div>

      {/* city rail — the closed DOS_CITIES list, one chip per city */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "none" }}>
        {DOS_CITIES.map((c) => {
          const on = c === city;
          return (
            <Link
              key={c}
              href={`/discover?city=${encodeURIComponent(c)}&tab=${tab}`}
              style={{
                padding: "8px 13px",
                borderRadius: 999,
                whiteSpace: "nowrap",
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: "none",
                background: on ? EL : CARD,
                color: INK,
                border: `1.5px solid ${on ? INK : "transparent"}`,
                flexShrink: 0,
              }}
            >
              {c}
            </Link>
          );
        })}
      </div>

      {/* entity tabs */}
      <div style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3, margin: "8px 0 4px" }}>
        {TABS.map(([k, word]) => {
          const on = tab === k;
          return (
            <Link
              key={k}
              href={`/discover?city=${encodeURIComponent(city)}&tab=${k}`}
              aria-pressed={on}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "center",
                padding: "8px 4px",
                borderRadius: 9,
                fontSize: 11.5,
                fontWeight: 800,
                textDecoration: "none",
                background: on ? LILAC : "transparent",
                color: on ? INK : SUB,
                boxShadow: on ? "0 1px 4px rgba(0,0,0,.3)" : "none",
              }}
            >
              {word}
            </Link>
          );
        })}
      </div>

      {/* the search box, the style rail, Filters + quick chips, the filter sheet (Step 23) */}
      <DiscoverFilters tab={tab} city={city} filters={filters} styleOrder={styleOrder} />

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
      {wantsBusinesses && businesses.map((t) => <StudioCard key={t.id} tenant={t} followers={followerCounts.get(t.id) ?? 0} />)}

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
