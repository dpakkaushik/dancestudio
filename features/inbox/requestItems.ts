import type { RequestItem } from "@/features/inbox/components/InboxScreen";
import { sessionDayLabel } from "@/lib/format/session";
import type { VenueRequest } from "@/repositories/classes";
import type { findMyPendingInvites, findPendingInvites } from "@/repositories/invites";
import { askToTileClass, type MyClassPersonAsk } from "@/types/classPerson";
import type { CrewMember, MyCrewAsk } from "@/types/crew";
import { practiceWhen, type CrewPractice } from "@/types/crewPractice";

/** THE REQUESTS DESK'S ROWS, BUILT ONCE (18 Sep 2026). The person's Inbox has
 *  turned the asks that already exist — class asks, team invites, crew asks,
 *  room requests, practices — into `RequestItem`s since Step 18; a studio's
 *  inbox and a crew's inbox (the Home · Inbox bar on their homes) want exactly
 *  the same rows, scoped to one entity. So the words and the mapping live here,
 *  and each page hands in whichever sources it has. Every list is optional:
 *  a crew has no venue requests and a studio no practices.
 *
 *  ⚠⚠ TWO OF THE SIX KINDS WENT ON 29 Sep 2026 with organizations and events:
 *  the DUET PARTNER ask (both ends — somebody entered an event with you) and the
 *  ORGANIZATION TEAM ask (both ends — an organization named you on its public
 *  page, and the four labels it could name you as). What is left is the class
 *  ask, the team invite, the crew ask, the venue request and the practice. */

/* DOS_LINK_WHAT (prototype 1805): the role in words, and the verb of the ask */
export const CLAIM_WORDS = {
  artist: { what: "the artist taking it", verb: "list you as the artist on" },
  assistant: { what: "a class assistant", verb: "add you as an assistant on" },
} as const;
export const TEAM_WORDS = { what: "on the team", verb: "add you to the team at" } as const;
/* Step 22: the crew ask (DOS_LINK_WHAT.member). ⚠ `PARTNER_WORDS` — the duet
   partner, DOS_LINK_WHAT.partner — went with events on 29 Sep 2026. */
export const CREW_WORDS = { what: "a crew member", verb: "add you to" } as const;
/* 18 Sep 2026: an artist asks a studio for one of its rooms — the class waits for the answer */
export const VENUE_WORDS = { what: "the room for a class", verb: "hold a class in" } as const;
/* 27 Sep 2026: a crew arranges a practice and asks everybody confirmed on it.
   ⚠ It is an ASK, not an invitation — it is about ONE OCCASION, like a class ask
   or a duet, rather than about BELONGING, so it falls in the Accept · Reject
   group and `JOIN_KINDS` leaves it out by omission (C61's split). */
export const PRACTICE_WORDS = { what: "at the practice", verb: "have you at a practice of" } as const;
/* ⚠ `ORG_TEAM_WORDS` and `ORG_ASK_NOTE` — the four labels an organization could
   name somebody as, and the sentence each one made them read before consenting —
   went with organizations on 29 Sep 2026. */

/* ⚠ `dayWords` dated a duet ask's event on its row and went with events
   (29 Sep 2026) — a practice ask carries its own instant instead */

type MyPendingInvite = Awaited<ReturnType<typeof findMyPendingInvites>>[number];
type SentInvite = Awaited<ReturnType<typeof findPendingInvites>>[number] & { businessName: string };

export interface RequestSources {
  venueIn?: VenueRequest[];
  classPeopleIn?: MyClassPersonAsk[];
  invitesIn?: MyPendingInvite[];
  crewIn?: MyCrewAsk[];
  venueOut?: VenueRequest[];
  classPeopleOut?: MyClassPersonAsk[];
  invitesOut?: SentInvite[];
  crewOut?: Array<CrewMember & { crewName: string }>;
  /** the practices this person has been asked to and not answered (27 Sep 2026).
   *  ⚠ There is no `practiceOut`: a practice is asked of the whole roster at
   *  once by the leader, and who has answered is the REGISTER on its own desk —
   *  a Sent row per person per practice would be the desk again, in a list that
   *  cannot act on any of it. */
  practiceIn?: CrewPractice[];
  /* ⚠ `orgIn` / `orgOut` (an organization's asks) and `events` (the events behind
     the duet asks, read by id in one query so the desk could draw the app's own
     event card) went on 29 Sep 2026. */
}

const newestFirst = (a: RequestItem, b: RequestItem) => b.at.localeCompare(a.at);

/* the three tables say yes and no in three vocabularies — one word each here
   (19 Sep 2026: an answered ask stays on the desk with its answer on it) */
const askStatus = (s: string | null | undefined): RequestItem["status"] =>
  s === "confirmed" || s === "accepted" ? "confirmed" : s === "rejected" || s === "declined" ? "rejected" : "asked";

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
      status: askStatus(v.venueStatus),
      danceClass: v.danceClass,
    })),
    ...(s.classPeopleIn ?? []).map((c): RequestItem => ({
      kind: "classPerson",
      id: c.id,
      dir: "in",
      who: c.businessName,
      what: CLAIM_WORDS[c.kind].what,
      verb: CLAIM_WORDS[c.kind].verb,
      subjectKind: "CLASS",
      subjectTitle: c.classTitle,
      when: c.startsAt ? sessionDayLabel(c.startsAt) : null,
      href: `/c/${c.classShareSlug}`,
      at: c.createdAt,
      note: c.payPerSessionInr > 0 ? `₹${c.payPerSessionInr.toLocaleString("en-IN")} a session` : null,
      classPersonId: c.id,
      status: askStatus(c.status),
      danceClass: askToTileClass(c),
    })),
    ...(s.invitesIn ?? []).map((i): RequestItem => ({
      kind: "invite",
      id: i.inviteId,
      dir: "in",
      who: i.businessName,
      what: TEAM_WORDS.what,
      verb: TEAM_WORDS.verb,
      subjectKind: "STUDIO",
      subjectTitle: i.businessName,
      when: null,
      href: `/join/${i.code}`,
      at: i.createdAt,
      note: `As ${i.memberRole}`,
      inviteCode: i.code,
    })),
    /* a crew roster is a public page, so being on one is a classPerson about you (16428) */
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
      status: askStatus(c.status),
    })),
    /* a practice your crew has arranged (27 Sep 2026) — an ask about ONE
       EVENING, answered here or on the crew's own desk, whichever you reach
       first. ⚠ The leader is never in this list: they arranged it, and
       `save_crew_practice` does not ask them. */
    ...(s.practiceIn ?? []).map((p): RequestItem => ({
      kind: "practice",
      id: p.id,
      dir: "in",
      who: p.crewName,
      what: PRACTICE_WORDS.what,
      verb: PRACTICE_WORDS.verb,
      subjectKind: "PRACTICE",
      subjectTitle: p.crewName,
      when: practiceWhen(p.startsAt),
      href: `/crew/${p.crewId}`,
      at: p.startsAt,
      note: `${p.place}${p.note ? ` · ${p.note}` : ""} — ${p.going} of ${p.asked} coming`,
      practiceId: p.id,
      crewId: p.crewId,
      status: askStatus(p.myStatus),
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
      note: v.venueStatus === "declined" ? `${v.venueName} declined — pick another studio, or a place of your own, from the class's Edit form.` : v.venueStatus === "accepted" ? `${v.venueName} said yes — the room is held for the class.` : "The class stays a draft until the studio accepts.",
      classId: v.classId,
      status: askStatus(v.venueStatus),
      danceClass: v.danceClass,
    })),
    ...(s.classPeopleOut ?? []).map((c): RequestItem => ({
      kind: "classPerson",
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
      classPersonId: c.id,
      status: askStatus(c.status),
      danceClass: askToTileClass(c),
    })),
    ...(s.invitesOut ?? []).map((i): RequestItem => ({
      kind: "invite",
      id: i.id,
      dir: "out",
      who: i.name,
      what: TEAM_WORDS.what,
      verb: TEAM_WORDS.verb,
      subjectKind: "STUDIO",
      subjectTitle: i.businessName,
      when: null,
      href: null,
      at: i.createdAt,
      note: `${i.email} · as ${i.memberRole}`,
      inviteId: i.id,
      businessId: i.businessId,
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
      status: askStatus(c.status),
    })),
  ].sort(newestFirst);

  return { requestsIn, requestsOut };
}
