import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionScreen } from "@/features/settings/components/SubscriptionScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findMyArtistSubscription, findMyStudioSubscriptions, type StudioSubscriptionState } from "@/repositories/subscriptions";
import { findMyMemberships } from "@/repositories/tenants";

export const metadata: Metadata = { title: "Subscription — DanceOS" };

/** /subscription — the PERSON's plan (the prototype's S_subscr), reached from
 *  the Subscription tile on Home since 26 Sep 2026 (the user: "subscriptions
 *  also become an option on home tab for all profiles and is removed from
 *  settings for all … subscribe to become an artist should not be a separate
 *  tab in settings like artist tools"). A recurring subscription since 10 Sep
 *  2026; prices come from the catalog an admin edits.
 *
 *  ⚠ AND THE BUSINESSES THIS ACCOUNT OWNS ARE LISTED UNDER IT (Rule 9: money):
 *  each studio (₹1,200) and, since 26 Sep 2026, each organization (₹5,000) with
 *  its own strip and the app's one Stop renewing — because there is no
 *  organization login any more, its mandate is the person's to start and stop.
 *  `findMyTenants` is every business this account is ON; a trainer neither pays
 *  nor cancels, so the list is the OWNER seat's alone. */
export default async function SubscriptionPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [subscription, catalog, memberships] = await Promise.all([
    findMyArtistSubscription(supabase).catch(() => null),
    findPlanCatalog(supabase).catch(() => []),
    findMyMemberships(supabase).catch(() => []),
  ]);
  const owned = memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant);
  const businesses = owned.filter((t) => t.type === "studio" || t.type === "org");
  const states: Record<string, StudioSubscriptionState> = businesses.length
    ? await findMyStudioSubscriptions(supabase, businesses.map((t) => t.id)).catch(() => ({}))
    : {};
  return (
    <SubscriptionScreen
      subscription={subscription}
      catalog={catalog}
      studioPrice={pickPlan(catalog, "studio")}
      orgPrice={pickPlan(catalog, "org")}
      businesses={businesses.map((t) => ({
        id: t.id,
        name: t.name,
        kind: t.type === "org" ? "org" : "studio",
        /* what "verified" means for each kind: a studio's badge, an organization's GST number */
        verified: t.type === "org" ? Boolean(t.gstinVerifiedAt) : Boolean(t.verifiedAt),
        state: states[t.id] ?? null,
      }))}
    />
  );
}
