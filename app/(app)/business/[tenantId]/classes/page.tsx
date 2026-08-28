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

  // membership check: RLS only returns tenants the user belongs to
  const tenants = await findMyTenants(supabase);
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
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
