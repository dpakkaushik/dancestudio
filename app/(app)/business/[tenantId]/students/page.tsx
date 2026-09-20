import { redirect } from "next/navigation";
import { StudentsDesk } from "@/features/leads/components/StudentsDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findStudents } from "@/repositories/students";
import { findMyTenants } from "@/repositories/tenants";

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
