import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionScreen } from "@/features/settings/components/SubscriptionScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { findMyArtistSubscription, findMyStudioSubscriptions, type StudioSubscriptionState } from "@/repositories/subscriptions";
import { findMyMemberships, findMyTenants } from "@/repositories/tenants";

export const metadata: Metadata = { title: "Subscription — DanceOS" };

/** /subscription — the prototype's S_subscr behind the settings sheet's
 *  Subscription row and the locked Artist tools switch (19111: "locked → the
 *  plan page"). A recurring subscription since 10 Sep 2026; prices come from
 *  the catalog an admin edits.
 *
 *  ⚠ AND SINCE 20 Sep 2026 IT IS WHERE A STUDIO'S SUBSCRIPTION LIVES TOO
 *  (Rule 9: money). The user: "remove … subscription from just the home tab for
 *  studio and organization profiles as already being handled from settings" —
 *  which was true of an ARTIST's plan and not of a studio's: this screen sent an
 *  organization to the hub, the hub's card carries Subscribe and no cancel, and
 *  the only "Stop renewing" in the whole app was the strip on the studio's own
 *  home. Deleting that strip on its own would have made a studio's subscription
 *  impossible to cancel anywhere — the exact hole the 15 Sep collapse of the hub
 *  nearly opened, recorded in this repo and avoided once already. So the control
 *  MOVED here rather than going: Settings → Subscription now really does handle
 *  it, for both kinds of account. */
export default async function SubscriptionPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [subscription, profile, catalog, tenants, memberships] = await Promise.all([
    findMyArtistSubscription(supabase).catch(() => null),
    findProfileById(supabase, user.id),
    findPlanCatalog(supabase).catch(() => []),
    findMyTenants(supabase).catch(() => []),
    findMyMemberships(supabase).catch(() => []),
  ]);
  const isOrg = profile?.role === "org";
  /* ⚠ A STUDIO IT OWNS — a person's too, since 26 Sep 2026 (the user: "can see
     verification progress and future subscription for the studio from there").
     `findMyTenants` is every business this account is ON; a trainer neither pays
     nor cancels, so the list is narrowed to the OWNER seat here, which is the
     rule the strip on the studio's home kept and this screen inherits. */
  const ownedIds = new Set(memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant.id));
  const studios = tenants.filter((t) => t.type === "studio" && ownedIds.has(t.id));
  const studioStates: Record<string, StudioSubscriptionState> = studios.length
    ? await findMyStudioSubscriptions(supabase, studios.map((t) => t.id)).catch(() => ({}))
    : {};
  return (
    <SubscriptionScreen
      subscription={subscription}
      catalog={catalog}
      isOrg={isOrg}
      studioPrice={pickPlan(catalog, "studio")}
      studios={studios.map((t) => ({ id: t.id, name: t.name, verified: Boolean(t.verifiedAt), state: studioStates[t.id] ?? null }))}
    />
  );
}
