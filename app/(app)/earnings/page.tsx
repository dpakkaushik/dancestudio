import { redirect } from "next/navigation";
import { MyEarnings } from "@/features/payouts/components/MyEarnings";
import { monthLabelOf } from "@/lib/format/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyEarnings } from "@/repositories/payouts";

const stampNowIso = (): string => new Date().toISOString();

/** Your own teaching money. Every row is yours: RLS admits you to your claims
 *  and to payouts where you are the person paid. */
export default async function MyEarningsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const now = stampNowIso();
  const data = await findMyEarnings(supabase, user.id, now);

  return <MyEarnings data={data} monthLabel={monthLabelOf(now)} />;
}
