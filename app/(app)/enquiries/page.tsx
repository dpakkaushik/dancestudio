import { redirect } from "next/navigation";
import { InboxScreen } from "@/features/inbox/components/InboxScreen";
import { DOS_TINT } from "@/lib/design/tokens";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findMyLedCrews } from "@/repositories/crews";
import { findReceivedEnquiries, findReceivedEnquiriesForCrews, findSentEnquiries } from "@/repositories/enquiries";
import { findProfileById } from "@/repositories/profiles";
import { findMyMemberships } from "@/repositories/tenants";
import { findMyArtistPlan } from "@/repositories/plans";
import { kindOf } from "@/types/profile";

const stampNowIso = (): string => new Date().toISOString();

/** ⚠⚠ ENQUIRIES IS A TAB OF ITS OWN (27 Sep 2026, the user: *"only enquiry
 *  becomes a new option in tab and is removed from inbox"*).
 *
 *  It was the Inbox's third section, and the two are not the same question: the
 *  Inbox is what somebody has asked OF you — a class, a room, a duet, a seat on
 *  a team — and every row there is a yes or a no you owe them. An enquiry is
 *  somebody wanting to BOOK you, and it has a life of its own: a quote, a
 *  revision, an advance, a balance, won or lost. Sharing a desk made the badge
 *  on the bar count two unlike things as one number.
 *
 *  ⚠ IT DRAWS THE SAME COMPONENT (`InboxScreen desk="enquiries"`) rather than a
 *  fork of it: the cards, the Received/Sent sides, the pipeline tiles and the
 *  Done treatment are identical, and this repo's bill for copying a screen has
 *  been paid three times already.
 *
 *  ⚠ The reads are exactly the Inbox's enquiry reads and nothing else — the
 *  requests batch is not made here at all, so the tab costs what it draws. */
export default async function EnquiriesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [profile, memberships, plan, ledCrews] = await Promise.all([
    findProfileById(supabase, user.id),
    findMyMemberships(supabase),
    findMyArtistPlan(supabase),
    /* the crews you lead take enquiries too (18 Sep 2026); a business leads none */
    findMyLedCrews(supabase).catch(() => []),
  ]);

  const [enquiriesToBusinesses, enquiriesToCrews, enquiriesOut] = await Promise.all([
    findReceivedEnquiries(
      supabase,
      memberships.map((m) => m.tenant.id)
    ),
    findReceivedEnquiriesForCrews(
      supabase,
      ledCrews.map((c) => c.id)
    ),
    findSentEnquiries(supabase, user.id),
  ]);

  /* one desk: what your businesses were asked, and what your crews were asked, newest first */
  const enquiriesIn = [...enquiriesToBusinesses, ...enquiriesToCrews].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const accent = DOS_TINT[kindOf(profile?.role ?? "user", Boolean(plan?.active))];

  return (
    <InboxScreen
      desk="enquiries"
      accent={accent}
      requestsIn={[]}
      requestsOut={[]}
      enquiriesIn={enquiriesIn}
      enquiriesOut={enquiriesOut}
      nowIso={stampNowIso()}
    />
  );
}
