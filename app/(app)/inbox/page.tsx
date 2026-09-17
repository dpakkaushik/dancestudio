import { redirect } from "next/navigation";
import { InboxScreen, type RequestItem } from "@/features/inbox/components/InboxScreen";
import { DOS_TINT } from "@/lib/design/tokens";
import { sessionDayLabel } from "@/lib/format/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findAskedClaimsForTenants, findMyPendingClaims } from "@/repositories/claims";
import { findMyVenueAsks, findVenueRequestsForTenants } from "@/repositories/classes";
import { findAskedForMyCrews, findMyPendingCrewAsks, findMyPendingPartnerAsks, findMyUnansweredPartners } from "@/repositories/crews";
import { findReceivedEnquiries, findSentEnquiries } from "@/repositories/enquiries";
import { findMyPendingInvites, findPendingInvites } from "@/repositories/invites";
import { findProfileById } from "@/repositories/profiles";
import { findMyMemberships } from "@/repositories/tenants";
import { findMyArtistPlan } from "@/repositories/plans";
import { kindOf } from "@/types/profile";

const stampNowIso = (): string => new Date().toISOString();

/* DOS_LINK_WHAT (prototype 1805): the role in words, and the verb of the ask */
const CLAIM_WORDS = {
  artist: { what: "the artist taking it", verb: "list you as the artist on" },
  assistant: { what: "a class assistant", verb: "add you as an assistant on" },
} as const;
const TEAM_WORDS = { what: "on the team", verb: "add you to the team at" } as const;
/* Step 22: the crew ask (DOS_LINK_WHAT.member) and the duet partner (DOS_LINK_WHAT.partner) */
const CREW_WORDS = { what: "a crew member", verb: "add you to" } as const;
const PARTNER_WORDS = { what: "your entry partner", verb: "enter with you into" } as const;
/* 18 Sep 2026: an artist asks a studio for one of its rooms — the class waits for the answer */
const VENUE_WORDS = { what: "the room for a class", verb: "hold a class in" } as const;
const dayWords = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** Inbox tab — the prototype's S_chats: Requests and Enquiries, two desks that
 *  count what is waiting on you. Requests are rows that already exist (class
 *  claims, team invites), read from BOTH ends: what is asked of you, and what
 *  your businesses have asked of others. */
export default async function InboxPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const [profile, memberships, plan] = await Promise.all([findProfileById(supabase, user.id), findMyMemberships(supabase), findMyArtistPlan(supabase)]);
  const businesses = memberships.map((m) => m.tenant);
  const tenantIds = businesses.map((t) => t.id);
  /* the rooms asked of the STUDIOS you own, and the rooms your own PAGE has asked for */
  const ownedStudioIds = memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "studio").map((m) => m.tenant.id);
  const ownedPageIds = memberships.filter((m) => m.memberRole === "owner" && m.tenant.type === "artist_page").map((m) => m.tenant.id);

  const [claimsIn, invitesIn, claimsOut, invitesOutByTenant, enquiriesIn, enquiriesOut, crewIn, crewOut, partnerIn, partnerOut, venueIn, venueOut] = await Promise.all([
    findMyPendingClaims(supabase),
    findMyPendingInvites(supabase),
    findAskedClaimsForTenants(supabase, tenantIds),
    Promise.all(businesses.map(async (t) => (await findPendingInvites(supabase, t.id)).map((i) => ({ ...i, tenantName: t.name })))),
    findReceivedEnquiries(supabase, tenantIds),
    findSentEnquiries(supabase, user.id),
    findMyPendingCrewAsks(supabase),
    findAskedForMyCrews(supabase),
    findMyPendingPartnerAsks(supabase),
    findMyUnansweredPartners(supabase),
    findVenueRequestsForTenants(supabase, ownedStudioIds).catch(() => []),
    findMyVenueAsks(supabase, ownedPageIds).catch(() => []),
  ]);

  const requestsIn: RequestItem[] = [
    /* an artist wants one of your rooms (18 Sep 2026): accepting holds the room
       and lets them publish; the class itself is theirs, and so is its money */
    ...venueIn.map((v): RequestItem => ({
      kind: "venue",
      id: v.classId,
      dir: "in",
      who: v.artistName,
      what: VENUE_WORDS.what,
      verb: `${VENUE_WORDS.verb} ${v.room ?? "a room"} at ${v.venueName}:`,
      subjectKind: "CLASS",
      subjectTitle: v.label,
      when: v.startsAt ? sessionDayLabel(v.startsAt) : null,
      href: `/c/${v.shareSlug}`,
      at: v.createdAt,
      note: "Accepting holds the room for them; the class is theirs to publish, and its bookings are theirs.",
      classId: v.classId,
    })),
    ...claimsIn.map((c): RequestItem => ({
      kind: "claim",
      id: c.id,
      dir: "in",
      who: c.tenantName,
      what: CLAIM_WORDS[c.kind].what,
      verb: CLAIM_WORDS[c.kind].verb,
      subjectKind: "CLASS",
      subjectTitle: c.classTitle,
      when: c.startsAt ? sessionDayLabel(c.startsAt) : null,
      href: `/c/${c.classShareSlug}`,
      at: c.createdAt,
      note: c.payPerSessionInr > 0 ? `₹${c.payPerSessionInr.toLocaleString("en-IN")} a session` : null,
      claimId: c.id,
    })),
    ...invitesIn.map((i): RequestItem => ({
      kind: "invite",
      id: i.inviteId,
      dir: "in",
      who: i.tenantName,
      what: TEAM_WORDS.what,
      verb: TEAM_WORDS.verb,
      subjectKind: "STUDIO",
      subjectTitle: i.tenantName,
      when: null,
      href: `/join/${i.code}`,
      at: i.createdAt,
      note: `As ${i.memberRole}`,
      inviteCode: i.code,
    })),
    /* a crew roster is a public page, so being on one is a claim about you (16428) */
    ...crewIn.map((c): RequestItem => ({
      kind: "crew",
      id: c.id,
      dir: "in",
      who: c.leaderName,
      what: CREW_WORDS.what,
      verb: CREW_WORDS.verb,
      subjectKind: "CREW",
      subjectTitle: c.crewName,
      when: null,
      href: `/crew/${c.crewId}`,
      at: c.createdAt,
      note: "Adding you to the crew roster — this shows on their public page.",
      memberId: c.id,
    })),
    /* a duet partner is asked; the entry stands either way (1815) */
    ...partnerIn.map((p): RequestItem => ({
      kind: "partner",
      id: p.bookingId,
      dir: "in",
      who: p.entrantName,
      what: PARTNER_WORDS.what,
      verb: PARTNER_WORDS.verb,
      subjectKind: "EVENT",
      subjectTitle: p.eventTitle,
      when: p.startDate ? dayWords(p.startDate) : null,
      href: p.eventShareSlug ? `/e/${p.eventShareSlug}` : null,
      at: p.createdAt,
      note: "Their entry is in either way — this decides whether the organiser sees you as confirmed.",
      bookingId: p.bookingId,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const requestsOut: RequestItem[] = [
    /* the rooms your page has asked for and not yet been given — waiting, or declined */
    ...venueOut.map((v): RequestItem => ({
      kind: "venue",
      id: v.classId,
      dir: "out",
      who: v.venueName,
      what: `${v.room ?? "a room"} at ${v.venueName}`,
      verb: VENUE_WORDS.verb,
      subjectKind: "CLASS",
      subjectTitle: v.label,
      when: v.startsAt ? sessionDayLabel(v.startsAt) : null,
      href: `/c/${v.shareSlug}`,
      at: v.createdAt,
      note: v.venueStatus === "declined" ? `${v.venueName} declined — pick another studio, or a place of your own, from the class's Edit form.` : "The class stays a draft until the studio accepts.",
      classId: v.classId,
    })),
    ...claimsOut.map((c): RequestItem => ({
      kind: "claim",
      id: c.id,
      dir: "out",
      who: c.personName,
      what: CLAIM_WORDS[c.kind].what,
      verb: CLAIM_WORDS[c.kind].verb,
      subjectKind: "CLASS",
      subjectTitle: c.classTitle,
      when: c.startsAt ? sessionDayLabel(c.startsAt) : null,
      href: `/c/${c.classShareSlug}`,
      at: c.createdAt,
      note: null,
      claimId: c.id,
    })),
    ...invitesOutByTenant.flat().map((i): RequestItem => ({
      kind: "invite",
      id: i.id,
      dir: "out",
      who: i.name,
      what: TEAM_WORDS.what,
      verb: TEAM_WORDS.verb,
      subjectKind: "STUDIO",
      subjectTitle: i.tenantName,
      when: null,
      href: null,
      at: i.createdAt,
      note: `${i.email} · as ${i.memberRole}`,
      inviteId: i.id,
      tenantId: i.tenantId,
    })),
    ...crewOut.map((c): RequestItem => ({
      kind: "crew",
      id: c.id,
      dir: "out",
      who: c.name,
      what: CREW_WORDS.what,
      verb: CREW_WORDS.verb,
      subjectKind: "CREW",
      subjectTitle: c.crewName,
      when: null,
      href: `/crews/${c.crewId}/manage`,
      at: c.createdAt,
      note: null,
      memberId: c.id,
      crewId: c.crewId,
    })),
    ...partnerOut.map((p): RequestItem => ({
      kind: "partner",
      id: p.bookingId,
      dir: "out",
      who: p.partnerName,
      what: PARTNER_WORDS.what,
      verb: PARTNER_WORDS.verb,
      subjectKind: "EVENT",
      subjectTitle: p.eventTitle,
      when: p.startDate ? dayWords(p.startDate) : null,
      href: p.eventShareSlug ? `/e/${p.eventShareSlug}` : null,
      at: p.createdAt,
      note: "Your entry holds whether or not they answer.",
      bookingId: p.bookingId,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const accent = DOS_TINT[kindOf(profile?.role ?? "user", Boolean(plan?.active))];

  return (
    <InboxScreen
      accent={accent}
      requestsIn={requestsIn}
      requestsOut={requestsOut}
      enquiriesIn={enquiriesIn}
      enquiriesOut={enquiriesOut}
      nowIso={stampNowIso()}
    />
  );
}
