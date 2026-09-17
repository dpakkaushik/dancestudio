import { redirect } from "next/navigation";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassPublishState, findClassesByTenant } from "@/repositories/classes";
import { countEnrolledBySession } from "@/repositories/enrollments";
import { findMyTenants } from "@/repositories/tenants";

/* the clock lives outside the component (react-hooks/purity) — the register's
   LIVE filter is arithmetic over the moment the page was served */
const stampNowIso = (): string => new Date().toISOString();

/** A STUDIO's classes register. Since 18 Sep 2026 every row wears the request
 *  it waits on — the teacher asked and their answer — and Publish is offered
 *  only once the database would accept it. An ARTIST's register is not a page
 *  of its own any more: it is the Manage segment of Your classes (the user:
 *  "Manage class should not take to a separate page for artist"), so an artist
 *  page's address lands there (Rule 14). */
export default async function TenantClassesPage({
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

  // membership check: RLS only returns businesses the user belongs to
  const businesses = await findMyTenants(supabase);
  const tenant = businesses.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }
  /* an organization's hosting row (R15) runs events, never classes (17 Sep 2026) */
  if (tenant.type === "org") {
    redirect(`/business/${tenantId}/events`);
  }
  if (tenant.type === "artist_page") {
    redirect("/my-classes?show=manage");
  }

  const classes = await findClassesByTenant(supabase, tenantId);
  const sessionIds = classes.map((c) => c.session?.id).filter(Boolean) as string[];
  const [counts, state] = await Promise.all([
    countEnrolledBySession(supabase, sessionIds),
    findClassPublishState(supabase, tenantId).catch(() => new Map()),
  ]);
  return (
    <ClassesManager
      tenantId={tenantId}
      classes={classes}
      filledBySession={Object.fromEntries(counts)}
      publishState={Object.fromEntries(state)}
      nowIso={stampNowIso()}
    />
  );
}
