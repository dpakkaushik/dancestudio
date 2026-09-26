import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BizPage } from "@/features/settings/components/settings-kit";
import { StudioSubscriptionStrip } from "@/features/tenants/components/StudioSubscriptionStrip";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findMyStudioSubscriptions, type StudioSubscriptionState } from "@/repositories/subscriptions";
import { findMyMemberships } from "@/repositories/tenants";

export const metadata: Metadata = { title: "Subscription — DanceOS" };

/** /business/{id}/subscription — ONE BUSINESS'S OWN SUBSCRIPTION (26 Sep 2026).
 *  The Subscription tile on an organization's home, and the door a studio's
 *  owner has to that studio's mandate now that the Subscription tile is off
 *  every Settings sheet (the user: "subscriptions also become an option on home
 *  tab for all profiles and is removed from settings for all").
 *
 *  One `StudioSubscriptionStrip` — the strip with the app's one Stop renewing —
 *  for THIS business, priced by its kind: ₹1,200 for a studio, ₹5,000 for an
 *  organization. `why_not_public` answers the right blocker for either since
 *  `20260926120000`, so the strip does not know which it is drawing.
 *
 *  ⚠ OWNER-ONLY, checked here: a teammate neither pays nor cancels, and
 *  `subscribe` would refuse them — they are sent to the business's home. */
export default async function BusinessSubscriptionPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const membership = (await findMyMemberships(supabase)).find((m) => m.tenant.id === tenantId);
  if (!membership || (membership.tenant.type !== "studio" && membership.tenant.type !== "org")) {
    redirect("/business");
  }
  if (membership.memberRole !== "owner") {
    redirect(`/business/${tenantId}`);
  }
  const { tenant } = membership;
  const isOrg = tenant.type === "org";
  const [states, catalog] = await Promise.all([
    findMyStudioSubscriptions(supabase, [tenantId]).catch((): Record<string, StudioSubscriptionState> => ({})),
    findPlanCatalog(supabase).catch(() => []),
  ]);
  const state = states[tenantId] ?? null;
  const price = pickPlan(catalog, isOrg ? "org" : "studio");
  /* what "verified" means for each kind: a studio's badge, an organization's GST number */
  const verified = isOrg ? Boolean(tenant.gstinVerifiedAt) : Boolean(tenant.verifiedAt);

  return (
    <BizPage title="Subscription" sub={`${tenant.name} · ${isOrg ? "an organization's own mandate" : "one studio, one mandate"}`} grad="linear-gradient(135deg,#0369A1,#22D3EE)">
      {state ? (
        <StudioSubscriptionStrip tenantId={tenantId} tenantName={tenant.name} verified={verified} state={state} studioPrice={price} heading={tenant.name} />
      ) : (
        <div style={{ fontSize: 12, color: "var(--sub)", fontWeight: 700 }}>Where this subscription stands could not be read just now. Try again in a moment.</div>
      )}
      {!verified ? (
        <div style={{ fontSize: 11.5, color: "var(--sub)", lineHeight: 1.55, padding: "2px 2px 10px" }}>
          {isOrg ? "Verify the organization's GST number first — Settings › GST number — then the subscription can be started here." : "DanceOS verifies the studio first — Settings › Verification — then the subscription can be started here."}
        </div>
      ) : null}
    </BizPage>
  );
}
