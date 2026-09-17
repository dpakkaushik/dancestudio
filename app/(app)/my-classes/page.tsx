import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyConfirmedClaims } from "@/repositories/claims";
import { findMyEnrollments } from "@/repositories/enrollments";
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
type Show = "booked" | "assist";
const SHOWS: Array<{ k: Show; label: string; aria: string }> = [
  { k: "booked", label: "Booked", aria: "Show the classes you booked" },
  { k: "assist", label: "Assist", aria: "Show the classes you teach or assist on" },
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
  const show: Show = rawShow === "assist" ? "assist" : "booked";

  const [class_bookings, artistOn, assistantOn, memberships] = await Promise.all([
    findMyEnrollments(supabase),
    findMyConfirmedClaims(supabase, "artist"),
    findMyConfirmedClaims(supabase, "assistant"),
    findMyMemberships(supabase),
  ]);
  const jobs: Array<MyClaimAsk & { job: "Teaching" | "Assisting" }> = [
    ...artistOn.map((c) => ({ ...c, job: "Teaching" as const })),
    ...assistantOn.map((c) => ({ ...c, job: "Assisting" as const })),
  ].sort((a, b) => (a.startsAt ?? "9").localeCompare(b.startsAt ?? "9"));
  const myPage = memberships.find((m) => m.memberRole === "owner" && m.tenant.type === "artist_page")?.tenant ?? null;
  const booked = class_bookings.filter((e) => e.status === "enrolled").length;

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "8px 0 10px", gap: 10 }}>
        {/* DosShelfHead "Your classes" · "N booked" (6120) */}
        <h1 style={{ fontSize: 17, fontWeight: 900, fontFamily: DOS_DISPLAY, letterSpacing: -0.5, lineHeight: 1.2, margin: 0 }}>Your classes</h1>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", whiteSpace: "nowrap" }}>
            {show === "booked" ? `${booked} booked` : `${jobs.length} on`}
          </div>
          {/* the same classes as a calendar (Step 14) — day, week, month, schedule */}
          <Link href="/calendar" style={{ fontSize: 11.5, fontWeight: 800, color: INK, textDecoration: "none", border: "1px solid var(--el)", borderRadius: 999, padding: "6px 12px", whiteSpace: "nowrap" }}>
            Calendar ›
          </Link>
        </div>
      </div>

      <div role="group" aria-label="Show" style={{ display: "flex", gap: 2, background: "var(--el)", borderRadius: 12, padding: 3, marginBottom: 12 }}>
        {SHOWS.map(({ k, label, aria }) => {
          const on = show === k;
          return (
            <Link key={k} href={k === "booked" ? "/my-classes" : `/my-classes?show=${k}`} aria-label={aria} aria-current={on ? "page" : undefined} style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, textDecoration: "none", background: on ? "var(--solid)" : "transparent", color: on ? INK : SUB, boxShadow: on ? "0 1px 4px rgba(0,0,0,.3)" : "none" }}>
              {label}
            </Link>
          );
        })}
        {myPage ? (
          /* MANAGE (an artist's own register): a door, not a third copy of Draft / Published / Completed */
          <Link href={`/business/${myPage.id}/classes`} aria-label="Manage the classes on your artist page" style={{ flex: 1, textAlign: "center", padding: "8px 2px", borderRadius: 9, fontSize: 11.5, fontWeight: 800, textDecoration: "none", color: SUB }}>
            Manage ›
          </Link>
        ) : null}
      </div>

      {show === "booked" ? (
        <>
          {class_bookings.map((e) => (
            <ClassTile
              key={e.id}
              danceClass={toTileClass(e)}
              tenantName={e.tenantName}
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
