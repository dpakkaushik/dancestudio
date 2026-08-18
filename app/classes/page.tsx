import Link from "next/link";
import { ClassTile } from "@/features/classes/components/ClassTile";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedClasses } from "@/repositories/classes";

/** Learner class listing — lifted from the prototype's Discover "Upcoming classes"
 *  shelf (DanceOSApp.jsx:4771-4809). City/style filters arrive with Step 5. */
export default async function ClassesPage() {
  const supabase = await createSupabaseServerClient();
  const classes = await findPublishedClasses(supabase);

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
      <Link href="/" style={{ fontSize: 20, color: INK, textDecoration: "none" }}>
        ←
      </Link>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "8px 0 10px",
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 800, fontFamily: DOS_DISPLAY, letterSpacing: -0.5 }}>
          Upcoming classes
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: SUB }}>{classes.length} listed</div>
      </div>

      {classes.map((c) => (
        <ClassTile
          key={c.id}
          danceClass={c}
          tenantName={c.tenantName}
          city={c.tenantCity}
        />
      ))}
      {classes.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: SUB,
            border: "1.5px dashed rgba(255,255,255,.13)",
            borderRadius: 20,
            fontSize: 13,
          }}
        >
          No upcoming classes yet — studios are just setting up.
        </div>
      )}
    </div>
  );
}
