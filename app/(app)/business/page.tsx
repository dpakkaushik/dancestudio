import { redirect } from "next/navigation";
import { BusinessHub } from "@/features/tenants/components/BusinessHub";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyVerificationRequest } from "@/repositories/admin";
import { findMyArtistPlan } from "@/repositories/plans";
import { findProfileById } from "@/repositories/profiles";
import { countRoomsByTenants } from "@/repositories/rooms";
import { findSupportThreads } from "@/repositories/support";
import { findMyMemberships } from "@/repositories/tenants";

/** /business — an organization's studios (and where its verification stands), or
 *  a person's one artist page. Who is here decides which hub is drawn (8 Sep 2026). */
export default async function BusinessPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    redirect("/onboarding");
  }
  // membership is the spine, and the ROLE on it decides which list a business
  // sits in — owned rows get their room count for the sub-line (prototype 2655)
  const [memberships, plan, request, threads] = await Promise.all([
    findMyMemberships(supabase),
    profile.role === "org" ? Promise.resolve(null) : findMyArtistPlan(supabase),
    profile.role === "org" ? findMyVerificationRequest(supabase) : Promise.resolve(null),
    /* the card carries a door to the conversation about this decision (10 Sep 2026) */
    profile.role === "org" ? findSupportThreads(supabase).catch(() => []) : Promise.resolve([]),
  ]);
  /* the thread about THIS request if there is one, else the newest conversation */
  const thread = threads.find((t) => request && t.requestId === request.id) ?? threads[0] ?? null;
  const roomCounts = await countRoomsByTenants(
    supabase,
    memberships.filter((m) => m.memberRole === "owner").map((m) => m.tenant.id)
  );
  return (
    <BusinessHub
      memberships={memberships}
      roomCounts={roomCounts}
      role={profile.role}
      isArtist={Boolean(plan?.active)}
      verification={
        profile.role === "org"
          ? {
              verifiedAt: profile.verifiedAt,
              request,
              socialsCount: profile.socials.length,
              threadId: thread?.id ?? null,
              unread: threads.reduce((n, t) => n + t.unread, 0),
            }
          : null
      }
    />
  );
}
