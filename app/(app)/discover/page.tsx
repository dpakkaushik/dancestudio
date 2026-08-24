import Link from "next/link";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { StudioCard } from "@/features/discovery/components/StudioCard";
import { DOS_CITIES, DOS_CITY_CENTROIDS, type DosCity } from "@/lib/constants/cities";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedClasses } from "@/repositories/classes";
import { findNearbyTenants } from "@/repositories/discovery";
import {
  countEnrolledBySession,
  findMyEnrolledSessionIds,
} from "@/repositories/enrollments";
import { findProfileById } from "@/repositories/profiles";
import type { EnrollmentStatus } from "@/types/enrollment";

const EL = "var(--el)";
const CARD = "var(--card)";
const TABS = [
  ["classes", "Classes"],
  ["studios", "Studios"],
  ["artists", "Artists"],
] as const;

const isCity = (v: string | undefined): v is DosCity =>
  Boolean(v) && (DOS_CITIES as readonly string[]).includes(v as string);

/** Discover — lifted from the prototype's S_discover: city on top, the entity
 *  tabs, "Upcoming classes" / "Studios near you" shelves (DanceOSApp.jsx:4771-4812).
 *  Style filters, sort and the map view arrive in later slices. */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const profile = user ? await findProfileById(supabase, user.id) : null;
  const city: DosCity = isCity(params.city)
    ? params.city
    : isCity(profile?.city ?? undefined)
      ? (profile!.city as DosCity)
      : "Pune";
  const tab = TABS.some(([k]) => k === params.tab) ? (params.tab as string) : "classes";
  const centre = DOS_CITY_CENTROIDS[city];

  const [allClasses, nearby, mine] = await Promise.all([
    tab === "classes" ? findPublishedClasses(supabase) : Promise.resolve([]),
    tab !== "classes"
      ? findNearbyTenants(supabase, {
          ...centre,
          type: tab === "studios" ? "studio" : "trainer_business",
        })
      : Promise.resolve([]),
    user && tab === "classes"
      ? findMyEnrolledSessionIds(supabase)
      : Promise.resolve(new Map<string, { id: string; status: EnrollmentStatus }>()),
  ]);

  const classes = allClasses.filter((c) => c.tenantCity === city);
  const counts =
    tab === "classes"
      ? await countEnrolledBySession(
          supabase,
          classes.map((c) => c.session?.id).filter(Boolean) as string[]
        )
      : new Map<string, number>();

  const shelfHead =
    tab === "classes" ? "Upcoming classes" : tab === "studios" ? "Studios near you" : "Artists near you";
  const shelfCount = tab === "classes" ? classes.length : nearby.length;

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
      <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, margin: "8px 0 10px" }}>
        Discover
      </div>

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
      <div style={{ display: "flex", gap: 2, background: EL, borderRadius: 12, padding: 3, margin: "8px 0 12px" }}>
        {TABS.map(([k, word]) => {
          const on = tab === k;
          return (
            <Link
              key={k}
              href={`/discover?city=${encodeURIComponent(city)}&tab=${k}`}
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

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 0 10px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.3 }}>{shelfHead}</div>
        <div style={{ fontSize: 11, fontWeight: 800, color: SUB }}>
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
              actions={
                c.session ? (
                  <EnrollButton
                    sessionId={c.session.id}
                    isFull={filled >= c.capacity}
                    isSignedIn={Boolean(user)}
                    mine={mine.get(c.session.id) ?? null}
                  />
                ) : null
              }
            />
          );
        })}
      {tab !== "classes" && nearby.map((t) => <StudioCard key={t.id} tenant={t} />)}

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
          {tab === "classes"
            ? `No upcoming classes in ${city} — try another city.`
            : `Nothing within 25 km of ${city} yet.`}
        </div>
      )}
    </div>
  );
}
