import { redirect } from "next/navigation";
import { ClassesManager } from "@/features/classes/components/ClassesManager";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassesByTenant } from "@/repositories/classes";
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
  return <ClassesManager tenantId={tenantId} tenantName={tenant.name} classes={classes} />;
}
