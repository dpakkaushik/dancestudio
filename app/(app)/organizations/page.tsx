import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrganizationsHub } from "@/features/organizations/components/OrganizationsHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findWhyNoOrganization } from "@/repositories/orgStanding";
import { findPlanCatalog, pickPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { findMyStudioSubscriptions } from "@/repositories/subscriptions";
import { findMyMemberships } from "@/repositories/tenants";

export const metadata: Metadata = { title: "Organizations — DanceOS" };

/** /organizations — THE ORGANIZATIONS HUB (26 Sep 2026): the organizations this
 *  account OWNS, and the door to opening one. The Studios hub for the third
 *  kind of business a person opens: the gate is `why_no_organization()`, the
 *  price is the catalog's `org_monthly`, and each organization's own mandate is
 *  read through `findMyStudioSubscriptions`, whose sentence (`why_not_public`)
 *  answers an organization's own blocker — GST, then the mandate — since the
 *  same migration. */
export default async function OrganizationsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  if (!(await findProfileById(supabase, user.id))) {
    redirect("/onboarding");
  }
  const [memberships, whyNoOrganization, catalog] = await Promise.all([
    findMyMemberships(supabase),
    findWhyNoOrganization(supabase).catch(() => null),
    findPlanCatalog(supabase).catch(() => []),
  ]);
  const organizations = memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "org").map((m) => m.tenant);
  const subscriptions = organizations.length
    ? await findMyStudioSubscriptions(
        supabase,
        organizations.map((t) => t.id)
      ).catch(() => ({}))
    : {};
  return <OrganizationsHub organizations={organizations} whyNoOrganization={whyNoOrganization} subscriptions={subscriptions} orgPrice={pickPlan(catalog, "org")} />;
}
