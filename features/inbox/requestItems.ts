import type { ClassRelation } from "@/lib/format/classLabels";
import { sessionDayLabel } from "@/lib/format/session";
import type { VenueRequest } from "@/repositories/classes";
import type { DanceClass } from "@/types/class";
import { askToTileClass, type MyClassPersonAsk } from "@/types/classPerson";

/** A CLASS ASK, as the Classes screen and a studio's register draw it — teach,
 *  assist, and a room.
 *
 *  ⚠⚠ ONLY CLASS ASKS SINCE 11 Oct 2026 (the user: "only enquiries to be handled
 *  from inbox and rest all from their respective home tile section how we did
 *  for classes"). The Inbox's Requests and Invites columns are gone: a team
 *  invitation is answered on the Studios hub's Team column, a crew ask on the
 *  Crews hub's Member column (`features/inbox/components/JoinInvites.tsx`), and
 *  the practice ask went with the Inbox's practice handling. So the invite,
 *  crew and practice kinds — and every field only they carried — went with
 *  them. The type moved here from `InboxScreen` the same day: the screen that
 *  used to draw these no longer does. */
export interface RequestItem {
  kind: "classPerson" | "venue";
  id: string;
  dir: "in" | "out";
  /** in: who is asking; out: who is being asked */
  who: string;
  /** DOS_LINK_WHAT (1805): the role in words */
  what: string;
  /** DOS_LINK_WHAT verb: "list you as the artist on" */
  verb: string;
  subjectKind: "CLASS";
  subjectTitle: string;
  when: string | null;
  href: string | null;
  at: string;
  note: string | null;
  classPersonId?: string;
  /** a venue ask is keyed on the CLASS that wants the room */
  classId?: string;
  /** THE ASK'S OWN STATE (19 Sep 2026): an answered ask stays, with its answer
   *  on it. ⚠ `withdrawn` (2 Oct 2026): taken back before it was answered. */
  status?: "asked" | "confirmed" | "rejected" | "withdrawn";
  /** the class itself, so the screen draws the app's own class card (27 Sep 2026) */
  danceClass?: DanceClass | null;
  /** the card's chip — Asked to teach, Asked to assist, Room request */
  relation?: ClassRelation;
  /** THE CLASS'S EDIT FORM, for an ask YOU sent (11 Oct 2026) */
  editHref?: string | null;
}

/** ⚠ HERE, in a plain module, and never in a "use client" file: a server page
 *  calls it, and a function exported from a client module is a client REFERENCE
 *  on the server, not a function (11 Oct 2026). */
export const isClassAsk = (r: RequestItem) => r.kind === "classPerson" || r.kind === "venue";

/* DOS_LINK_WHAT (prototype 1805): the role in words, and the verb of the ask */
export const CLAIM_WORDS = {
  artist: { what: "the artist taking it", verb: "list you as the artist on" },
  assistant: { what: "a class assistant", verb: "add you as an assistant on" },
} as const;
/* the card's chip for an ask — the shared word list (4 Oct 2026) */
const CLAIM_RELATION = { artist: "askedToTeach", assistant: "askedToAssist" } as const;
/* 18 Sep 2026: an artist asks a studio for one of its rooms — the class waits for the answer */
export const VENUE_WORDS = { what: "the room for a class", verb: "hold a class in" } as const;

export interface RequestSources {
  venueIn?: VenueRequest[];
  classPeopleIn?: MyClassPersonAsk[];
  venueOut?: VenueRequest[];
  classPeopleOut?: MyClassPersonAsk[];
}

const newestFirst = (a: RequestItem, b: RequestItem) => b.at.localeCompare(a.at);

/* the tables say yes and no in their own vocabularies — one word each here */
const askStatus = (s: string | null | undefined): RequestItem["status"] =>
  s === "confirmed" || s === "accepted" ? "confirmed" : s === "rejected" || s === "declined" ? "rejected" : "asked";
/* a withdrawn ask is a soft-deleted row still `asked` — the reads mark it */
const statusOf = (s: string, withdrawn: boolean | undefined): RequestItem["status"] => (withdrawn ? "withdrawn" : askStatus(s));

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
      relation: "roomRequest",
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
      status: statusOf(c.status, c.withdrawn),
      danceClass: askToTileClass(c),
      relation: CLAIM_RELATION[c.kind],
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
      relation: "roomRequest",
      editHref: `/business/${v.artistBusinessId}/classes/${v.classId}/edit`,
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
      status: statusOf(c.status, c.withdrawn),
      danceClass: askToTileClass(c),
      relation: CLAIM_RELATION[c.kind],
      editHref: c.classBusinessId ? `/business/${c.classBusinessId}/classes/${c.classId}/edit` : null,
    })),
  ].sort(newestFirst);

  return { requestsIn, requestsOut };
}
