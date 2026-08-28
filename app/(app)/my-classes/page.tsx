import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyEnrollments } from "@/repositories/enrollments";
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

  const enrollments = await findMyEnrollments(supabase);

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
    </div>
  );
}
