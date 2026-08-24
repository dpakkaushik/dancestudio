import { ClassTile } from "@/features/classes/components/ClassTile";
import { EnrollButton } from "@/features/enrollments/components/EnrollButton";
import { DOS_DISPLAY, DOS_UI, INK, LILAC, SUB } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPublishedClasses } from "@/repositories/classes";
import {
  countEnrolledBySession,
  findMyEnrolledSessionIds,
} from "@/repositories/enrollments";
import type { EnrollmentStatus } from "@/types/enrollment";

/** Learner class listing — lifted from the prototype's Discover "Upcoming classes"
 *  shelf (DanceOSApp.jsx:4771-4809). City/style filters arrive with Step 5. */
export default async function ClassesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const classes = await findPublishedClasses(supabase);
  const sessionIds = classes.map((c) => c.session?.id).filter(Boolean) as string[];
  const [counts, mine] = await Promise.all([
    countEnrolledBySession(supabase, sessionIds),
    user
      ? findMyEnrolledSessionIds(supabase)
      : Promise.resolve(new Map<string, { id: string; status: EnrollmentStatus }>()),
  ]);

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
          Upcoming classes
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: SUB }}>{classes.length} listed</div>
      </div>

      {classes.map((c) => {
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
      {classes.length === 0 && (
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
          No upcoming classes yet — studios are just setting up.
        </div>
      )}
    </div>
  );
}
