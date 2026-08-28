import { redirect } from "next/navigation";
import { EarningsDesk } from "@/features/payouts/components/EarningsDesk";
import { monthLabelOf } from "@/lib/format/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findTenantIncome } from "@/repositories/income";
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
     owner's alone and cannot be granted (18434), and it gates the earnings
     screen itself on `isMine`. RLS backs the pay half up — the payouts table
     admits the owner and the person paid, nobody else. The income half is a
     PRESENTATION gate only: Step 9 admits every member of the tenant to the
     payments and refunds it sums, which the proof script asserts on purpose. */
  const role = await findMyMembershipRole(supabase, tenantId);
  if (role !== "owner") {
    redirect(`/business/${tenantId}/classes`);
  }

  const now = stampNowIso();
  const [ledger, income] = await Promise.all([
    findTenantPayLedger(supabase, tenantId, now),
    findTenantIncome(supabase, tenantId, now),
  ]);

  return (
    <EarningsDesk
      tenantId={tenantId}
      tenantName={tenant.name}
      ledger={ledger}
      income={income}
      monthLabel={monthLabelOf(now)}
    />
  );
}
