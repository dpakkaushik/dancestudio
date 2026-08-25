import { redirect } from "next/navigation";
import { EarningsDesk } from "@/features/payouts/components/EarningsDesk";
import { monthLabelOf } from "@/lib/format/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantPayLedger } from "@/repositories/payouts";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

/* the clock lives outside the component — this repo's lint refuses an impure
   call during render (react-hooks/purity), even in a server component */
const stampNowIso = (): string => new Date().toISOString();

export default async function TenantEarningsPage({
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

  /* ⚠ owner-only, checked on the server and not merely hidden in the UI: the
     prototype's settings footnote is explicit that payout approval is the
     owner's alone and cannot be granted (18434). RLS backs this up — the payouts
     table admits the owner and the person paid, nobody else — so a trainer
     opening this URL would see an empty ledger anyway. */
  const role = await findMyMembershipRole(supabase, tenantId);
  if (role !== "owner") {
    redirect(`/business/${tenantId}/classes`);
  }

  const now = stampNowIso();
  const ledger = await findTenantPayLedger(supabase, tenantId, now);

  return (
    <EarningsDesk
      tenantId={tenantId}
      tenantName={tenant.name}
      ledger={ledger}
      monthLabel={monthLabelOf(now)}
    />
  );
}
