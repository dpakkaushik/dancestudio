import type { RequestItem } from "@/features/inbox/components/InboxScreen";
import { sessionDayLabel } from "@/lib/format/session";
import type { VenueRequest } from "@/repositories/classes";
import type { findMyPendingInvites, findPendingInvites } from "@/repositories/invites";
import type { MyOrgTeamAsk, OrgTeamMember } from "@/repositories/organizationTeam";
import type { MyClaimAsk } from "@/types/claim";
import type { CrewMember, MyCrewAsk, PartnerAsk } from "@/types/crew";

/** THE REQUESTS DESK'S ROWS, BUILT ONCE (18 Sep 2026). The person's Inbox has
 *  turned the asks that already exist — class asks, team invites, crew asks,
 *  duet partners, room requests — into `RequestItem`s since Step 18; a studio's
 *  inbox and a crew's inbox (the Home · Inbox bar on their homes) want exactly
 *  the same rows, scoped to one entity. So the words and the mapping live here,
 *  and each page hands in whichever sources it has. Every list is optional:
 *  a crew has no venue requests and a studio no partner asks. */

/* DOS_LINK_WHAT (prototype 1805): the role in words, and the verb of the ask */
export const CLAIM_WORDS = {
  artist: { what: "the artist taking it", verb: "list you as the artist on" },
  assistant: { what: "a class assistant", verb: "add you as an assistant on" },
} as const;
export const TEAM_WORDS = { what: "on the team", verb: "add you to the team at" } as const;
/* Step 22: the crew ask (DOS_LINK_WHAT.member) and the duet partner (DOS_LINK_WHAT.partner) */
export const CREW_WORDS = { what: "a crew member", verb: "add you to" } as const;
export const PARTNER_WORDS = { what: "your entry partner", verb: "enter with you into" } as const;
/* 18 Sep 2026: an artist asks a studio for one of its rooms — the class waits for the answer */
export const VENUE_WORDS = { what: "the room for a class", verb: "hold a class in" } as const;
/* push 2 (19 Sep 2026): an organization names a person on its public page — as its owner, or on its team */
export const ORG_TEAM_WORDS = {
  owner: { what: "an owner", verb: "name you as an owner of" },
  member: { what: "a team member", verb: "add you to the team of" },
} as const;

const dayWords = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d)));
};

type MyPendingInvite = Awaited<ReturnType<typeof findMyPendingInvites>>[number];
type SentInvite = Awaited<ReturnType<typeof findPendingInvites>>[number] & { tenantName: string };

export interface RequestSources {
  venueIn?: VenueRequest[];
  claimsIn?: MyClaimAsk[];
  invitesIn?: MyPendingInvite[];
  crewIn?: MyCrewAsk[];
  partnerIn?: PartnerAsk[];
  venueOut?: VenueRequest[];
  claimsOut?: MyClaimAsk[];
  invitesOut?: SentInvite[];
  crewOut?: Array<CrewMember & { crewName: string }>;
  partnerOut?: PartnerAsk[];
  /** push 2: an organization's asks — to the person (in), and the ones the organization is waiting on (out) */
  orgIn?: MyOrgTeamAsk[];
  orgOut?: Array<OrgTeamMember & { orgName: string }>;
}

const newestFirst = (a: RequestItem, b: RequestItem) => b.at.localeCompare(a.at);

export function buildRequests(s: RequestSources): { requestsIn: RequestItem[]; requestsOut: RequestItem[] } {
  const requestsIn: RequestItem[] = [
    /* an artist wants one of your rooms (18 Sep 2026): accepting holds the room
       and lets them publish; the class itself is theirs, and so is its money */
    ...(s.venueIn ?? []).map((v): RequestItem => ({
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
    ...(s.claimsIn ?? []).map((c): RequestItem => ({
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
    ...(s.invitesIn ?? []).map((i): RequestItem => ({
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
    ...(s.crewIn ?? []).map((c): RequestItem => ({
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
    ...(s.partnerIn ?? []).map((p): RequestItem => ({
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
    /* an organization's page is public, so being named on it is a claim about you */
    ...(s.orgIn ?? []).map((o): RequestItem => ({
      kind: "orgteam",
      id: o.id,
      dir: "in",
      who: o.orgName,
      what: ORG_TEAM_WORDS[o.role].what,
      verb: ORG_TEAM_WORDS[o.role].verb,
      subjectKind: "ORGANIZATION",
      subjectTitle: o.orgName,
      when: null,
      href: `/org/${o.orgId}`,
      at: o.createdAt,
      note: o.role === "owner" ? "You would be shown as this organization's OWNER on its public page — a label, not a login." : "You would be shown on this organization's public page under TEAM.",
      memberId: o.id,
    })),
  ].sort(newestFirst);

  const requestsOut: RequestItem[] = [
    /* the rooms your page has asked for and not yet been given — waiting, or declined */
    ...(s.venueOut ?? []).map((v): RequestItem => ({
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
    ...(s.claimsOut ?? []).map((c): RequestItem => ({
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
    ...(s.invitesOut ?? []).map((i): RequestItem => ({
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
    ...(s.crewOut ?? []).map((c): RequestItem => ({
      kind: "crew",
      id: c.id,
      dir: "out",
      who: c.name,
      what: CREW_WORDS.what,
      verb: CREW_WORDS.verb,
      subjectKind: "CREW",
      subjectTitle: c.crewName,
      when: null,
      href: `/crews/${c.crewId}/manage/team`,
      at: c.createdAt,
      note: null,
      memberId: c.id,
      crewId: c.crewId,
    })),
    ...(s.partnerOut ?? []).map((p): RequestItem => ({
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
    ...(s.orgOut ?? []).map((o): RequestItem => ({
      kind: "orgteam",
      id: o.id,
      dir: "out",
      who: o.name,
      what: ORG_TEAM_WORDS[o.role].what,
      verb: ORG_TEAM_WORDS[o.role].verb,
      subjectKind: "ORGANIZATION",
      subjectTitle: o.orgName,
      when: null,
      href: "/business/team",
      at: o.createdAt,
      note: null,
      memberId: o.id,
    })),
  ].sort(newestFirst);

  return { requestsIn, requestsOut };
}
