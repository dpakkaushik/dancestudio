import { redirect } from "next/navigation";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassesByTenant } from "@/repositories/classes";
import { countEnrolledBySession } from "@/repositories/enrollments";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

/* the clock lives outside the component (react-hooks/purity) — the register's
   LIVE filter is arithmetic over the moment the page was served */
const stampNowIso = (): string => new Date().toISOString();

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
  /* an organization's hosting row (R15) runs events, never classes (17 Sep 2026,
     the user: "classes can only be created by users with artist subscription and
     studios") — the database refuses one there, so the register is not a place either */
  if (tenant.type === "org") {
    redirect(`/business/${tenantId}/events`);
  }

  const classes = await findClassesByTenant(supabase, tenantId);
  const sessionIds = classes.map((c) => c.session?.id).filter(Boolean) as string[];
  const [counts, role] = await Promise.all([
    countEnrolledBySession(supabase, sessionIds),
    findMyMembershipRole(supabase, tenantId),
  ]);
  return (
    <ClassesManager
      tenantId={tenantId}
      classes={classes}
      filledBySession={Object.fromEntries(counts)}
      isOwner={role === "owner"}
      nowIso={stampNowIso()}
    />
  );
}
