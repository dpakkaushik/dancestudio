import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionScreen } from "@/features/settings/components/SubscriptionScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyArtistPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";

export const metadata: Metadata = { title: "Subscription — DanceOS" };

/** /subscription — the prototype's S_subscr behind the settings sheet's
 *  Subscription row and the locked Artist tools switch (19111: "locked → the
 *  plan page"). */
export default async function SubscriptionPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [plan, profile] = await Promise.all([findMyArtistPlan(supabase), findProfileById(supabase, user.id)]);
  return <SubscriptionScreen plan={plan} isStudioOwner={profile?.role === "studio"} />;
}
