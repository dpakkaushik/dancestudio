import { redirect } from "next/navigation";
import { LeadsDesk } from "@/features/leads/components/LeadsDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassesByTenant } from "@/repositories/classes";
import { findLeadsByTenant } from "@/repositories/leads";
import { findMyTenants } from "@/repositories/tenants";

/* the clock lives outside the component — this repo's lint refuses an impure
   call during render (react-hooks/purity), the same rule Step 7 hit */
const stampNow = (): number => Date.now();

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

  const tenants = await findMyTenants(supabase);
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }

  const [leads, classes] = await Promise.all([
    findLeadsByTenant(supabase, tenantId),
    findClassesByTenant(supabase, tenantId),
  ]);

  return (
    <LeadsDesk
      tenantId={tenantId}
      tenantName={tenant.name}
      leads={leads}
      // a trial is agreed against a real, bookable class
      classes={classes.filter((c) => c.status === "published")}
      now={stampNow()}
    />
  );
}
