import { redirect } from "next/navigation";
import { EarningsScreen } from "@/features/payouts/components/EarningsScreen";
import { MyEarnings } from "@/features/payouts/components/MyEarnings";
import { asPeriod } from "@/lib/format/period";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPersonEarnings } from "@/repositories/earnings";
import { findMyEarnings } from "@/repositories/payouts";
import { findMyMemberships } from "@/repositories/businesses";

/* the clock is read OUTSIDE the component — `react-hooks/purity` refuses an
   impure call during render, even in a server component */
const stampNowIso = (): string => new Date().toISOString();

/** Your own teaching money. Every row is yours: RLS admits you to your classPeople
 *  and to payouts where you are the person paid.
 *
 *  ⚠ THE SUMMARY IS THE SHARED EARNINGS SCREEN NOW (21 Sep 2026): the period
 *  filters, the chart and Revenue / Expenses / what is left, the same as every
 *  other kind of profile. `MyEarnings` keeps what is ITS OWN — the studio-by-
 *  studio count of what you are owed, and who has actually paid you — and its
 *  hero and money card are suppressed, because the screen above now says what
 *  they said, and said it of a PERIOD rather than of all time.
 *
 *  ⚠ A PERSON HAS NO EXPENSES, so "what is left" is what came in, and the screen
 *  says so rather than drawing an empty block. */
export default async function MyEarningsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const period = asPeriod((await searchParams).period);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const now = stampNowIso();
  /* ⚠ YOUR OWN BUSINESSES ARE NOT "STUDIOS THAT PAID YOU" (2 Oct 2026, the user:
     "all items on home tab should be for that specific profile"). Measured on
     their account: this screen listed their own studio and their own artist page
     under WHERE IT CAME FROM — the same money those two businesses' Earnings
     desks already show. A person's screen is what OTHER businesses paid them. */
  const owned = (await findMyMemberships(supabase).catch(() => []))
    .filter((m) => m.memberRole === "owner")
    .map((m) => m.business.id);
  const [report, data] = await Promise.all([
    findPersonEarnings(supabase, user.id, period, now, owned),
    findMyEarnings(supabase, user.id, now, owned),
  ]);

  return (
    <EarningsScreen report={report} title="Earnings" sub="What studios have paid you" basePath="/earnings" noExpenses>
      <MyEarnings data={data} summary={false} />
    </EarningsScreen>
  );
}
