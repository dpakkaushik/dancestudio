import { redirect } from "next/navigation";
import { EnquirySettings } from "@/features/enquiries/components/EnquirySettings";
import { loadEnquiries } from "@/features/enquiries/server/loadEnquiries";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyPendingClassPeople } from "@/repositories/classPeople";
import { findMyPendingCrewAsks } from "@/repositories/crews";
import { findMyPendingInvites } from "@/repositories/invites";
import { findMyMemberships } from "@/repositories/businesses";
import { findMyArtistPlan } from "@/repositories/plans";
import { kindOf } from "@/types/profile";

const stampNowIso = (): string => new Date().toISOString();

/** Inbox tab — the prototype's S_chats.
 *
 *  ⚠⚠ ENQUIRIES ONLY SINCE 11 Oct 2026 (the user: "only enquiries to be handled
 *  from inbox and rest all from their respective home tile section how we did
 *  for classes"). The class asks moved to Classes' To do that morning; the team
 *  invitations now live on the Studios hub's Team column and the crew asks on
 *  the Crews hub's Member column, and the practice asks left with the Inbox's
 *  practice handling. What is read here for those three is only the COUNT of what
 *  waits on you, for the pointer line each draws.
 *
 *  ⚠ The reads that went with the two columns: answered invites, the invites
 *  this person's businesses sent, the crew asks both ways, the practices, and
 *  the switch list behind the Invites column's settings (that switch is on each
 *  hub's gear now). Old `?show=requests` / `?show=invites` links land here, on
 *  Enquiries — nothing breaks, the column is simply not there (Rule 14). */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const nowIso = stampNowIso();
  const [memberships, plan, { show }] = await Promise.all([findMyMemberships(supabase), findMyArtistPlan(supabase), searchParams]);

  /* the enquiries, through the loader a studio's Inbox shares; and the three
     counts, each answering an empty list rather than failing the Inbox */
  const [enq, classPeopleIn, invitesIn, crewIn] = await Promise.all([
    loadEnquiries(supabase, { kind: "person", userId: user.id, memberships }),
    findMyPendingClassPeople(supabase).catch(() => []),
    findMyPendingInvites(supabase).catch(() => []),
    findMyPendingCrewAsks(supabase, ["asked"]).catch(() => []),
  ]);
  /* ⚠ an ask whose class has STARTED waits on nobody (B15, 11 Oct 2026) — it is
     Expired under Classes › Answered, so the pointer does not count it */
  const classAsksWaiting = classPeopleIn.filter(
    (c) => c.status === "asked" && !c.withdrawn && !(c.startsAt && Date.parse(c.startsAt) <= Date.parse(nowIso))
  ).length;

  const accent = DOS_TINT[kindOf(Boolean(plan?.active))];

  return (
    <InboxScreen
      accent={accent}
      enquiriesIn={enq.enquiriesIn}
      enquiriesOut={enq.enquiriesOut}
      settings={<EnquirySettings businesses={enq.settingsFor} />}
      pointers={[
        { testId: "class-requests-pointer", n: classAsksWaiting, href: "/my-classes?tab=todo", one: "class request", many: "class requests", where: "Teach and assist asks are answered in Classes", tint: "#8B5CF6" },
        { testId: "team-invites-pointer", n: invitesIn.length, href: "/business?show=team", one: "team invite", many: "team invites", where: "Answered on Studios › Team", tint: "#0EA5E9" },
        { testId: "crew-invites-pointer", n: crewIn.length, href: "/crews?show=in", one: "crew invite", many: "crew invites", where: "Answered on Crews › Member", tint: "#DC2626" },
      ]}
      initialSection={show === "done" ? "done" : undefined}
      nowIso={nowIso}
    />
  );
}
