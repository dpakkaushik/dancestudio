import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
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
const SHOWS: Array<{ k: Show; label: string; aria: string }> = [
  { k: "booked", label: "Booked", aria: "Show the classes you booked" },
  { k: "assist", label: "Assist", aria: "Show the classes you teach or assist on" },
  /* MANAGE, IN PLACE (18 Sep 2026, the user: "Manage class should not take to a
     separate page for artist — should be handled from within the same page"):
     the artist's own register, drawn here as a third segment */
  { k: "manage", label: "Manage", aria: "Manage the classes on your artist page" },
];

const when = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso))
    : "no date yet";

export default async function MyClassesPage({ searchParams }: { searchParams: Promise<{ show?: string | string[]; kind?: string | string[] }> }) {
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

  const [class_bookings, artistOn, assistantOn, memberships] = await Promise.all([
    findMyEnrollments(supabase),
    findMyConfirmedClaims(supabase, "artist"),
    findMyConfirmedClaims(supabase, "assistant"),
    findMyMemberships(supabase),
  ]);
  const myPage = memberships.find((m) => m.memberRole === "owner" && m.tenant.type === "artist_page")?.tenant ?? null;
  const show: Show = rawShow === "assist" ? "assist" : rawShow === "manage" && myPage ? "manage" : "booked";
  /* the teacher's own classes are theirs to manage, not to "assist on": an
     artist page's owner is its every class's confirmed teacher by construction */
  const jobs: Array<MyClaimAsk & { job: "Teaching" | "Assisting" }> = [
    ...artistOn.filter((c) => !myPage || c.tenantName !== myPage.name).map((c) => ({ ...c, job: "Teaching" as const })),
    ...assistantOn.map((c) => ({ ...c, job: "Assisting" as const })),
  ].sort((a, b) => (a.startsAt ?? "9").localeCompare(b.startsAt ?? "9"));
  const booked = class_bookings.filter((e) => e.status === "enrolled").length;
  /* the teacher each booked card wears in its centre (18 Sep 2026) */
  const bookedArtists = await findClassArtists(supabase, class_bookings.map((e) => e.classId));

  /* the register, when Manage is open: the page's classes, their seats, and what
     each one still waits for before it can be published */
  const manage =
    show === "manage" && myPage
      ? await (async () => {
          const classes = await findClassesByTenant(supabase, myPage.id);
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
      <DeskHero tool="classes" as="h1" margin="0 0 10px" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 10px", gap: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" }}>
          {show === "booked" ? `${booked} booked` : show === "assist" ? `${jobs.length} on` : `${manage?.classes.length ?? 0} on your page`}
        </div>
        {/* the same classes as a calendar (Step 14) — day, week, month, schedule */}
        <Link href="/calendar" style={{ fontSize: 11.5, fontWeight: 800, color: INK, textDecoration: "none", border: "1px solid var(--el)", borderRadius: 999, padding: "6px 12px", whiteSpace: "nowrap" }}>
          Calendar ›
        </Link>
      </div>

      <div role="group" aria-label="Show" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 12 }}>
        {SHOWS.filter((s) => s.k !== "manage" || myPage).map(({ k, label, aria }) => {
          const on = show === k;
          return (
            <Link key={k} href={k === "booked" ? "/my-classes" : `/my-classes?show=${k}`} aria-label={aria} aria-current={on ? "page" : undefined} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, textDecoration: "none", background: on ? "var(--solid)" : "transparent", color: on ? INK : SUB, boxShadow: on ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}>
              {label}
            </Link>
          );
        })}
      </div>

      {show === "manage" && myPage && manage ? (
        /* the artist's register, in place: Create, Draft · Published · Completed,
           each row wearing the request it waits on (ClassesManager, embedded) */
        <ClassesManager embedded tenantId={myPage.id} classes={manage.classes} filledBySession={manage.filled} artists={manage.artists} publishState={manage.state} whyNoClass={manage.whyNoClass} nowIso={new Date().toISOString()} />
      ) : show === "booked" ? (
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
      ) : (
        <>
          {jobs.map((c) => (
            <Link
              key={c.id}
              href={`/c/${c.classShareSlug}`}
              aria-label={`Open ${c.classTitle}`}
              style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${c.job === "Teaching" ? "#F59E0B" : "#8B5CF6"}`, borderRadius: 16, padding: "11px 13px", marginBottom: 8, textDecoration: "none", color: INK }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.classTitle}</span>
                <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>
                  {c.tenantName} · {when(c.startsAt)}
                </span>
              </span>
              <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, textTransform: "uppercase", color: c.job === "Teaching" ? "#F59E0B" : "#8B5CF6" }}>{c.job}</span>
            </Link>
          ))}
          {jobs.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: SUB, border: "1.5px dashed var(--el)", borderRadius: 20, fontSize: 13, lineHeight: 1.5 }}>
              Nothing you teach or assist on yet. A studio asks you onto a class, you say yes in your Inbox, and it appears here.
            </div>
          )}
        </>
      )}
    </div>
  );
}
