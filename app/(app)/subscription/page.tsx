import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SubscriptionScreen } from "@/features/settings/components/SubscriptionScreen";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findMyArtistSubscription, findMyStudioSubscriptions, type StudioSubscriptionState } from "@/repositories/subscriptions";
import { findMyMemberships } from "@/repositories/businesses";
import { findProfileById } from "@/repositories/profiles";

export const metadata: Metadata = { title: "Subscription — DanceOS" };

/** /subscription — the PERSON's plan (the prototype's S_subscr), reached from
 *  the Subscription tile on Home since 26 Sep 2026 (the user: "subscriptions
 *  also become an option on home tab for all profiles and is removed from
 *  settings for all … subscribe to become an artist should not be a separate
 *  tab in settings like artist tools"). A recurring subscription since 10 Sep
 *  2026; prices come from the catalog an admin edits.
 *
 *  ⚠ AND THE STUDIOS THIS ACCOUNT OWNS ARE LISTED UNDER IT (Rule 9: money):
 *  each one (₹1,200) with its own strip and the app's one Stop renewing.
 *  `findMyBusinesses` is every business this account is ON; a trainer neither pays
 *  nor cancels, so the list is the OWNER seat's alone.
 *  ⚠ The organizations half (₹5,000 each) went with organizations on 29 Sep. */
export default async function SubscriptionPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [subscription, catalog, memberships, me] = await Promise.all([
    findMyArtistSubscription(supabase).catch(() => null),
    findPlanCatalog(supabase).catch(() => []),
    findMyMemberships(supabase).catch(() => []),
    /* whose plan it is — the face and the name the Artist plan's card leads with */
    findProfileById(supabase, user.id).catch(() => null),
  ]);
  const owned = memberships.filter((m) => m.memberRole === "owner").map((m) => m.business);
  const businesses = owned.filter((t) => t.type === "studio");
  const states: Record<string, StudioSubscriptionState> = businesses.length
    ? await findMyStudioSubscriptions(supabase, businesses.map((t) => t.id)).catch(() => ({}))
    : {};
  return (
    <SubscriptionScreen
      person={{ id: user.id, name: me?.fullName ?? "You", photoPath: me?.avatarPath ?? null }}
      subscription={subscription}
      catalog={catalog}
      studioPrice={pickPlan(catalog, "studio")}
      businesses={businesses.map((t) => ({
        id: t.id,
        name: t.name,
        photoPath: t.photoPath ?? null,
        kind: "studio" as const,
        verified: Boolean(t.verifiedAt),
        state: states[t.id] ?? null,
      }))}
    />
  );
}
