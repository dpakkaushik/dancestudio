import { redirect } from "next/navigation";
import { OrgTeamDesk } from "@/features/organization/components/OrgTeamDesk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyOrganizationTeam } from "@/repositories/organizationTeam";
import { findProfileById } from "@/repositories/profiles";

/** /business/team — the Team tile on an ORGANIZATION's Home (18 Sep 2026, the
 *  user's list: "Organization Users — Events, Studios, Team, Earnings, Stats").
 *  Until push 2 (19 Sep 2026) it opened the prototype's own "nothing here yet",
 *  because an organization is ONE LOGIN and nothing sat at its level. It still
 *  is one login: what this desk keeps is the people the organization NAMES on
 *  its public page — its Owner, its Team — asked and confirmed. A person who
 *  reaches this address is sent Home; the desk is an organization's. */
export default async function OrgTeamPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile || profile.role !== "org") {
    redirect("/");
  }
  const members = await findMyOrganizationTeam(supabase);
  return <OrgTeamDesk orgId={user.id} orgName={profile.fullName} members={members} />;
}
