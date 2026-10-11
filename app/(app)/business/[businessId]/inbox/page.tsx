import { redirect } from "next/navigation";
import { EnquirySettings } from "@/features/enquiries/components/EnquirySettings";
import { loadEnquiries } from "@/features/enquiries/server/loadEnquiries";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findVenueRequestsForBusinesses } from "@/repositories/classes";
import { findMyMemberships, runsTheBusiness } from "@/repositories/businesses";

const stampNowIso = (): string => new Date().toISOString();

/** ONE STUDIO'S INBOX (18 Sep 2026, the user: "both crew and studios should get a
 *  home and inbox tab below on their home pages as both have enquiries to deal
 *  with and studios have their requests to deal with as well"). The Inbox tab
 *  on a studio's own home. The same two desks the person's Inbox draws, scoped
 *  to THIS studio: since 11 Oct 2026 the enquiries sent to it and nothing else,
 *  with one line counting the room requests that wait in Classes. Every member of
 *  the team reads it — the desk is the studio's CRM and staff answer the phone
 *  (Step 12's rule), and RLS already admits them to each of these rows. */
export default async function StudioInboxPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { businessId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const memberships = await findMyMemberships(supabase);
  const membership = memberships.find((m) => m.business.id === businessId);
  /* ⚠ and the seat has to RUN the business (28 Sep 2026) — this is the Inbox TAB
     of a home a faculty seat can no longer open, so admitting it here would be a
     door into a house whose front door is shut */
  if (!membership || !runsTheBusiness(membership.memberRole)) {
    redirect("/business");
  }
  const { business } = membership;
  /* ⚠ AN ORGANIZATION'S HOME WORE THIS BAR TOO from 26 Sep 2026, so its Inbox
     tab landed here — its team asks, for its owner. Both went with
     organizations on 29 Sep. An artist page's inbox is the person's own. */
  /* ⚠ an artist page's enquiries are the PERSON's Inbox (2 Oct 2026), so a link
     to "this page's enquiries" lands there rather than on the page's home */
  if (business.type === "artist_page") {
    const { show } = await searchParams;
    redirect(show ? `/inbox?show=${encodeURIComponent(show)}` : "/inbox");
  }
  if (business.type !== "studio") {
    redirect(`/business/${businessId}`);
  }

  /* ⚠ AND IT READS THEM AGAIN (2 Oct 2026, the user: "shift back enquiries to
     inbox from home tools for all profiles") — the studio's enquiries are this
     Inbox's third desk, read through the loader the person's Inbox shares */
  /* ⚠⚠ THE ROOM REQUESTS AND THE TEACHERS ASKED MOVED TO THE REGISTER (11 Oct
     2026, the user's choice: class requests live in Classes only). This desk
     keeps the enquiries and the invites it sent, and one line counting the room
     requests that wait — the room switch went with them. */
  /* ⚠⚠ ENQUIRIES ONLY (11 Oct 2026, the user: "only enquiries to be handled from
     inbox"). The invites this studio SENT left with the Invites column — they
     are on its own Team desk (`/business/{id}/staff`), with Withdraw. */
  const [venueWaiting, enq, { show }] = await Promise.all([
    findVenueRequestsForBusinesses(supabase, [businessId], ["requested"]).catch(() => []),
    loadEnquiries(supabase, { kind: "business", id: businessId, memberships }),
    searchParams,
  ]);

  return (
    <InboxScreen
      accent={gradientOf(business.name)[1]}
      enquiriesIn={enq.enquiriesIn}
      enquiriesOut={[]}
      receivedOnly
      deskSub={business.name}
      settings={<EnquirySettings businesses={enq.settingsFor} />}
      pointers={[
        { testId: "class-requests-pointer", n: venueWaiting.length, href: `/business/${businessId}/classes`, one: "room request", many: "room requests", where: "Room requests are answered in Classes", tint: "#8B5CF6" },
      ]}
      initialSection={show === "done" ? "done" : undefined}
      nowIso={stampNowIso()}
    />
  );
}
