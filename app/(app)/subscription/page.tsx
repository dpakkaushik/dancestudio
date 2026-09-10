import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionScreen } from "@/features/settings/components/SubscriptionScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { findMyArtistSubscription } from "@/repositories/subscriptions";

export const metadata: Metadata = { title: "Subscription — DanceOS" };

/** /subscription — the prototype's S_subscr behind the settings sheet's
 *  Subscription row and the locked Artist tools switch (19111: "locked → the
 *  plan page"). A recurring subscription since 10 Sep 2026; prices come from
 *  the catalog an admin edits. */
export default async function SubscriptionPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [subscription, profile, catalog] = await Promise.all([
    findMyArtistSubscription(supabase).catch(() => null),
    findProfileById(supabase, user.id),
    findPlanCatalog(supabase).catch(() => []),
  ]);
  return (
    <SubscriptionScreen
      subscription={subscription}
      catalog={catalog}
      isOrg={profile?.role === "org"}
      studioPrice={pickPlan(catalog, "studio")}
    />
  );
}
