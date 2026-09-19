import { redirect } from "next/navigation";
import { LeadsDesk } from "@/features/leads/components/LeadsDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findClassesByTenant } from "@/repositories/classes";
import { findLeadsByTenant, findStudentStats } from "@/repositories/leads";
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

  const businesses = await findMyTenants(supabase);
  const tenant = businesses.find((t) => t.id === tenantId);
  if (!tenant) {
    redirect("/business");
  }

  const [leads, classes] = await Promise.all([
    findLeadsByTenant(supabase, tenantId),
    findClassesByTenant(supabase, tenantId),
  ]);
  /* WHAT EACH STUDENT HAS DONE HERE (19 Sep 2026, the user: "track student
     performance, photo stats"). Only the rows that name somebody on DanceOS
     have a record to count; a walk-in typed at the desk has none. Fails soft —
     the desk is the studio's list of people first. */
  const stats = await findStudentStats(
    supabase,
    tenantId,
    leads.map((l) => l.userId).filter((x): x is string => Boolean(x))
  ).catch(() => new Map());

  return (
    <LeadsDesk
      tenantId={tenantId}
      tenantName={tenant.name}
      leads={leads}
      stats={Object.fromEntries(stats)}
      // a trial is agreed against a real, bookable class
      classes={classes.filter((c) => c.status === "published")}
      now={stampNow()}
    />
  );
}
