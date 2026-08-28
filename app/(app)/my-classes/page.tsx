import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { EvIcon, bookingWords, eventCodeOf, eventTimeWords, eventWhen } from "@/features/events/components/event-kit";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyEnrollments } from "@/repositories/enrollments";
import { findMyEventBookings } from "@/repositories/events";
import { EV_TINT, TYPE_LABEL } from "@/types/event";
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

/** The learner's bookings — the prototype's "your calendar" view of booked classes. */
export default async function MyClassesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [enrollments, tickets] = await Promise.all([findMyEnrollments(supabase), findMyEventBookings(supabase, user.id)]);

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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "8px 0 10px",
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
          My classes
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: SUB }}>{enrollments.length} booked</div>
          {/* the same bookings as a calendar (Step 14) — day, week, month, schedule */}
          <Link
            href="/calendar"
            style={{
              fontSize: 11.5,
              fontWeight: 800,
              color: INK,
              textDecoration: "none",
              border: "1px solid var(--el)",
              borderRadius: 999,
              padding: "6px 12px",
              whiteSpace: "nowrap",
            }}
          >
            Calendar ›
          </Link>
        </div>
      </div>

      {enrollments.map((e) => (
        <ClassTile
          key={e.id}
          danceClass={toTileClass(e)}
          tenantName={e.tenantName}
          city={e.tenantCity}
          href={`/c/${e.shareSlug}`}
          actions={
            <EnrollButton
              sessionId={e.sessionId}
              isFull={false}
              isSignedIn
              mine={{ id: e.id, status: e.status }}
              priceInr={e.priceInr}
              shareSlug={e.shareSlug}
            />
          }
        />
      ))}
      {enrollments.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: SUB,
            border: "1.5px dashed var(--el)",
            borderRadius: 20,
            fontSize: 13,
          }}
        >
          Nothing booked yet —{" "}
          <Link href="/classes" style={{ color: "#5AC8FA", fontWeight: 800 }}>
            find a class
          </Link>{" "}
          to get started.
        </div>
      )}

      {/* ── YOUR TICKETS (Step 21) — the seats and entries you hold, soonest first.
          An event booking is a booking too (S_bookings 6099); each row opens the
          event's own page, where the pass and the cancel live. ── */}
      {tickets.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "22px 0 10px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.3 }}>Your tickets</div>
            <div style={{ fontSize: 11, fontWeight: 800, color: SUB }}>
              {tickets.length} {tickets.length === 1 ? "booking" : "bookings"}
            </div>
          </div>
          {tickets.map((t) => {
            const tint = EV_TINT[t.eventCat];
            return (
              <Link
                key={t.id}
                href={`/e/${t.eventShareSlug}`}
                aria-label={`Open ${t.eventTitle}`}
                style={{ display: "flex", alignItems: "center", gap: 11, background: "var(--card)", border: "1px solid var(--el)", borderLeft: `4px solid ${tint}`, borderRadius: 16, padding: "11px 13px", marginBottom: 8, textDecoration: "none", color: INK }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, background: `${tint}1f`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <EvIcon cat={t.eventCat} size={18} color={tint} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.eventTitle}</span>
                  <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>
                    {eventWhen(t.startDate, t.startDate)} · {eventTimeWords(t.startTime)} · {t.venue}
                  </span>
                  <span style={{ display: "block", fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                    {TYPE_LABEL[t.eventCat]} · {bookingWords(t)}
                  </span>
                </span>
                <span style={{ flexShrink: 0, textAlign: "right" }}>
                  <span style={{ display: "block", fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace', fontSize: 10, color: "var(--muted)" }}>{eventCodeOf(t.id)}</span>
                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 800, color: tint, marginTop: 3 }}>{t.checkedInAt ? "Checked in" : t.amountInr > 0 ? `₹${t.amountInr}` : "Free"}</span>
                </span>
              </Link>
            );
          })}
        </>
      )}
    </div>
  );
}
