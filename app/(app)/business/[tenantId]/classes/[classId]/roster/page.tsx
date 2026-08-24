import { redirect } from "next/navigation";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassById } from "@/repositories/classes";
import { findRosterByClass } from "@/repositories/enrollments";
import { findMyTenants } from "@/repositories/tenants";
import type { RosterEntry } from "@/types/enrollment";

const EL = "var(--el)";

const initials = (name: string) =>
  (name.match(/\b\w/g) || ["D"]).slice(0, 2).join("").toUpperCase();

const since = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(
    new Date(iso)
  );

/** Roster rows — person-row treatment lifted from the prototype's people lists
 *  (PeoplePicker rows, DanceOSApp.jsx:649-654). */
function Row({ r }: { r: RosterEntry }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${EL}` }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: "linear-gradient(135deg,#5AC8FA,#7C3AED)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: 11.5,
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {initials(r.learnerName)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>{r.learnerName}</div>
        <div style={{ fontSize: 10, color: SUB }}>
          {[r.learnerCity, `booked ${since(r.enrolledAt)}`].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

export default async function RosterPage({
  params,
}: {
  params: Promise<{ tenantId: string; classId: string }>;
}) {
  const { tenantId, classId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const tenants = await findMyTenants(supabase);
  if (!tenants.some((t) => t.id === tenantId)) {
    redirect("/business");
  }
  const danceClass = await findClassById(supabase, classId);
  if (!danceClass || danceClass.tenantId !== tenantId) {
    redirect(`/business/${tenantId}/classes`);
  }

  const roster = await findRosterByClass(supabase, classId);
  const enrolled = roster.filter((r) => r.status === "enrolled");
  const waitlisted = roster.filter((r) => r.status === "waitlisted");

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
      <div style={{ margin: "10px 0 2px", fontSize: 10, fontWeight: 900, letterSpacing: 1.2, color: SUB }}>
        ROSTER
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
        {danceClass.title}
      </div>

      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "#707070", margin: "18px 0 4px" }}>
        ENROLLED · {enrolled.length}/{danceClass.capacity}
      </div>
      {enrolled.map((r) => (
        <Row key={r.id} r={r} />
      ))}
      {enrolled.length === 0 && (
        <div style={{ fontSize: 11.5, color: SUB, padding: "6px 0" }}>Nobody has booked yet.</div>
      )}

      {waitlisted.length > 0 && (
        <>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: "#707070", margin: "18px 0 4px" }}>
            WAITLIST · {waitlisted.length}
          </div>
          {waitlisted.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </>
      )}
    </div>
  );
}
