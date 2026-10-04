import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionScreen } from "@/features/settings/components/SubscriptionScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlanCatalog } from "@/repositories/plans";
import { findMyArtistSubscription } from "@/repositories/subscriptions";
import { findProfileById } from "@/repositories/profiles";

export const metadata: Metadata = { title: "Subscription — DanceOS" };

/** /subscription — the PERSON's plan (the prototype's S_subscr), reached from
 *  the Subscription tile on Home since 26 Sep 2026. A recurring subscription
 *  since 10 Sep 2026; prices come from the catalog an admin edits.
 *
 *  ⚠ ONLY THE ARTIST PLAN SINCE 4 Oct 2026 (the user: "Only Artist subscription
 *  for User/ artist"). The studios this account owns used to be listed under it;
 *  each one's subscription and its Cancel Subscription live on that studio's own
 *  Subscription tile (`/business/{id}/subscription`), so no money lost its door
 *  (Rule 9), and this page makes three fewer reads. */
export default async function SubscriptionPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [subscription, catalog, me] = await Promise.all([
    findMyArtistSubscription(supabase).catch(() => null),
    findPlanCatalog(supabase).catch(() => []),
    /* whose plan it is — the face and the name the Artist plan's card leads with */
    findProfileById(supabase, user.id).catch(() => null),
  ]);
  return (
    <SubscriptionScreen
      person={{ id: user.id, name: me?.fullName ?? "You", photoPath: me?.avatarPath ?? null }}
      subscription={subscription}
      catalog={catalog}
    />
  );
}
