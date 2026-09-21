import { redirect } from "next/navigation";
import { EarningsDesk } from "@/features/payouts/components/EarningsDesk";
import { EarningsScreen } from "@/features/payouts/components/EarningsScreen";
import { monthLabelOf } from "@/lib/format/session";
import { asPeriod } from "@/lib/format/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findBusinessEarnings } from "@/repositories/earnings";
import { findTenantIncome } from "@/repositories/income";
import { findTenantPayLedger } from "@/repositories/payouts";
import { findMyMembershipRole, findMyTenants } from "@/repositories/tenants";

/* the clock lives outside the component — this repo's lint refuses an impure
   call during render (react-hooks/purity), even in a server component */
const stampNowIso = (): string => new Date().toISOString();

export default async function TenantEarningsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { tenantId } = await params;
  const period = asPeriod((await searchParams).period);
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
  const [report, ledger, income] = await Promise.all([
    findBusinessEarnings(supabase, [tenantId], period, now),
    findTenantPayLedger(supabase, tenantId, now),
    findTenantIncome(supabase, tenantId, now),
  ]);

  /* ⚠ THE SUMMARY IS THE SHARED SCREEN NOW (21 Sep 2026, the user: "lets fix
     earnings for all profile types"). What this desk used to say at the top —
     a GROSS card governed by month chips, and a separate money-OUT card whose
     month label was decorative over an all-time figure — is said above, of one
     period, with the two sides in the same window and **the net between them**,
     which no money screen in this app had ever printed.
     What the desk keeps is its WORK: what you owe person by person, what you
     have settled, recording a payment, and the month statements with their CSV. */
  return (
    <EarningsScreen
      report={report}
      title="Earnings"
      sub={tenant.name}
      basePath={`/business/${tenantId}/earnings`}
    >
      <EarningsDesk
        tenantId={tenantId}
        tenantName={tenant.name}
        ledger={ledger}
        income={income}
        monthLabel={monthLabelOf(now)}
        summary={false}
        /* an ARTIST PAGE's owner is the one person with two ledgers — what their
           page took, and what studios have paid them for teaching. Their Home tile
           opens this one now (20 Sep 2026), so the other gets its door here. A
           studio's owner is paid by nobody, so they are offered none. */
        selfEarningsHref={tenant.type === "artist_page" ? "/earnings" : null}
      />
    </EarningsScreen>
  );
}
