import { redirect } from "next/navigation";
import { StudentsDesk } from "@/features/leads/components/StudentsDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findStudents } from "@/repositories/students";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

/** THE STUDENTS DESK (21 Sep 2026, re-cut from the leads pipeline).
 *
 *  ⚠ NO LEAD READS LEFT HERE. The desk used to compose `findLeadsByTenant` +
 *  `findStudentStats` + every published class (for the trial picker); it now
 *  makes ONE call, `findStudents`, which is where the word "student" is defined:
 *  checked in here, or holding a pass this business sold, or a walk-in the desk
 *  typed in itself. The stages, the funnel and the trial class are gone — the
 *  user: "Students section dont need to track a lead". */
export default async function TenantStudentsPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const businesses = await findMyTenants(supabase);
  const tenant = businesses.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }

  /* ⚠⚠ NOT EVERY SEAT SEES THE STUDENTS (21 Sep 2026, the user's answer on
     whether a visiting teacher or an assistant should: *"No"*).
     This was membership-only, so ANY seat read the whole roster — every
     student's name, their PHONE NUMBER and what they hold. ⚠ The app's own
     permissions text never claimed that: `MEMBER_POWER_NOTE` gives students to
     `staff` ("Sees the students desk") and to `trainer` ("sees its students"),
     and says of `visiting_faculty` only "Teaches the class they accepted, and
     runs the register on that one only". So the SHEET an owner reads before
     handing out a seat and the CODE disagreed, and the sheet was right — which
     is why this is a gate rather than a new rule.
     ⚠ SAID PLAINLY: this is a PRESENTATION gate. The rows underneath are
     ordinary RLS-bounded reads that admit every member, so a determined seat can
     still reach them through the API — narrowing that is a policy change on
     `leads` and `attendance`, not a redirect, and it is not this slice. What
     changes today is that the app stops handing it over. */
  const myRole = await findMyMembershipRole(supabase, tenantId);
  if (myRole === "visiting_faculty" || myRole === "assistant") {
    redirect(`/business/${tenantId}`);
  }

  /* fails soft: a studio's own list of people must draw even when one of the
     four reads under it is refused */
  const students = await findStudents(supabase, tenantId).catch(() => []);

  /* WHERE AN INVITED PERSON LANDS — the studio's own public page, which is the
     one address that explains what they are being invited to. An artist page
     redirects to its owner's profile, so it is named the way the rest of the app
     names it rather than being linked at directly. */
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  const inviteUrl = `${base}/${tenant.type === "studio" ? "studio" : "artist"}/${tenantId}`;

  return <StudentsDesk tenantId={tenantId} tenantName={tenant.name} students={students} inviteUrl={inviteUrl} />;
}
