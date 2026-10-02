import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { findReceivedEnquiries, findReceivedEnquiriesForCrews, findSentEnquiries } from "@/repositories/enquiries";
import type { findMyMemberships } from "@/repositories/businesses";
import type { Enquiry } from "@/types/enquiry";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type Memberships = Awaited<ReturnType<typeof findMyMemberships>>;

/** ⚠⚠ ONE PROFILE'S ENQUIRIES, FOR ITS INBOX (2 Oct 2026, the user: *"shift back
 *  enquiries to inbox from home tools for all profiles"*). The reads that were
 *  `EnquiriesDesk`'s, unchanged, so the person's, a studio's and a crew's Inbox
 *  each draw exactly what the desk used to:
 *
 *  · a PERSON — Received is their own artist page's (nothing else they run),
 *    Sent is every enquiry they sent;
 *  · a STUDIO — what was sent to it, and no Sent side (an enquiry is sent BY A
 *    PERSON, `guard_person_only`);
 *  · a CREW — what was sent to it, the leader being who `is_enquiry_member`
 *    admits.
 *
 *  The settings are the OWNER's and only a business has any: a person's are their
 *  artist page's, a studio's are the studio's, a crew has none. */
export async function loadEnquiries(
  supabase: Client,
  scope: { kind: "person"; userId: string; memberships: Memberships } | { kind: "business"; id: string; memberships: Memberships } | { kind: "crew"; id: string },
): Promise<{ enquiriesIn: Enquiry[]; enquiriesOut: Enquiry[]; settingsFor: Memberships[number]["business"][] }> {
  const businessIds =
    scope.kind === "person"
      ? scope.memberships.filter((m) => m.memberRole === "owner" && m.business.type === "artist_page").map((m) => m.business.id)
      : scope.kind === "business"
        ? [scope.id]
        : [];
  const [toBusinesses, toCrews, out] = await Promise.all([
    businessIds.length ? findReceivedEnquiries(supabase, businessIds).catch(() => []) : Promise.resolve([]),
    scope.kind === "crew" ? findReceivedEnquiriesForCrews(supabase, [scope.id]).catch(() => []) : Promise.resolve([]),
    scope.kind === "person" ? findSentEnquiries(supabase, scope.userId).catch(() => []) : Promise.resolve([]),
  ]);
  const settingsFor =
    scope.kind === "crew"
      ? []
      : scope.memberships
          .filter((m) => m.memberRole === "owner")
          .filter((m) => (scope.kind === "business" ? m.business.id === scope.id : m.business.type === "artist_page"))
          .map((m) => m.business);
  return {
    enquiriesIn: [...toBusinesses, ...toCrews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    enquiriesOut: out,
    settingsFor,
  };
}
