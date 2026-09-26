import { redirect } from "next/navigation";
import { OrgTeamDesk } from "@/features/organization/components/OrgTeamDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyOrganizationTeam } from "@/repositories/organizationTeam";
import { findMyMemberships } from "@/repositories/tenants";

/** /business/{id}/team — ONE ORGANIZATION'S TEAM DESK (26 Sep 2026). The Team
 *  tile on an organization's own home. It was `/business/team`, the retired
 *  organization login's single desk; an organization is a business a person
 *  opens now, so the desk is keyed on it like a studio's staff desk is.
 *
 *  ⚠ OWNER-ONLY, checked here rather than trusted from the tile: every write
 *  behind this desk is the owner's (`assert_caller_owns_organization`), and the
 *  read policy admits the owner and each person to their own row — so a
 *  teammate who typed this address would see a desk with one row on it and a
 *  button that refuses. They are sent to the organization's home instead. A
 *  studio's address here is sent to its own Team desk. */
export default async function OrgTeamPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const membership = (await findMyMemberships(supabase)).find((m) => m.tenant.id === tenantId);
  if (!membership) {
    redirect("/organizations");
  }
  if (membership.tenant.type !== "org") {
    redirect(`/business/${tenantId}/staff`);
  }
  if (membership.memberRole !== "owner") {
    redirect(`/business/${tenantId}`);
  }
  const members = await findMyOrganizationTeam(supabase, tenantId);
  return <OrgTeamDesk orgId={tenantId} orgName={membership.tenant.name} members={members} />;
}
