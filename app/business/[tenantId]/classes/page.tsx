import { redirect } from "next/navigation";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassesByTenant } from "@/repositories/classes";
import { countEnrolledBySession } from "@/repositories/enrollments";
import { findMyTenants } from "@/repositories/tenants";

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
  const counts = await countEnrolledBySession(supabase, sessionIds);
  return (
    <ClassesManager
      tenantId={tenantId}
      tenantName={tenant.name}
      classes={classes}
      filledBySession={Object.fromEntries(counts)}
    />
  );
}
