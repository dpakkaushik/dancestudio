import { MEMBER_LABEL, MEMBER_ROLE_WORD } from "@/types/staff";
import type { MemberRole } from "@/repositories/businesses";
import type { AnsweredInvite } from "@/repositories/invites";
import type { AnsweredCrewAsk } from "@/repositories/crews";
import type { BusinessInvite } from "@/types/staff";

/** ⚠ A PLAIN MODULE, ON PURPOSE (11 Oct 2026). The answered invitation cards are
 *  drawn by a client component, but the rows are built on the SERVER pages — and
 *  a function exported from a `"use client"` file is a client reference on the
 *  server, not a function (the 26 Sep `orgStandingWords` lesson, and 11 Oct's
 *  `isClassAsk`). So the shape and its builders live here. */

/** what became of an invitation — the reply chip on an answered card */
export type InviteReply = "joined" | "declined" | "withdrawn" | "left";

/** an answered invitation, as plain data so a server page can hand it over */
export interface AnsweredInviteRow {
  key: string;
  kind: "team" | "crew";
  /** the card's face: the business or crew (receiver side), the person asked (sender side) */
  name: string;
  photoPath: string | null;
  eyebrow: string;
  sub: string | null;
  /** the seat the invitation offered */
  seatWord: string;
  seatColour: string;
  reply: InviteReply;
  /** when it was answered (ISO) */
  at: string | null;
}

/* the seat an invite offers, in the app's own word ("Faculty", never "trainer") */
export const teamSeatOf = (r: string): { word: string; colour: string } => {
  const k = r as MemberRole;
  return MEMBER_ROLE_WORD[k] ? { word: MEMBER_ROLE_WORD[k], colour: MEMBER_LABEL[k].colour } : { word: r, colour: "#64748B" };
};

const CREW_COLOUR = "#DC2626";

const TEAM_REPLY: Record<string, InviteReply> = { accepted: "joined", declined: "declined", revoked: "withdrawn" };

/** the RECEIVER's answered team invitation — the Studios hub's Answered sheet */
export function teamAnsweredRow(i: AnsweredInvite, fallbackPhoto: string | null): AnsweredInviteRow {
  const seat = teamSeatOf(i.memberRole);
  return {
    key: `team-${i.inviteId}`,
    kind: "team",
    name: i.businessName,
    photoPath: i.businessPhotoPath ?? fallbackPhoto,
    eyebrow: "Team invitation",
    sub: i.inviterName ? `Invited by ${i.inviterName}` : null,
    seatWord: seat.word,
    seatColour: seat.colour,
    reply: TEAM_REPLY[i.status] ?? "declined",
    at: i.answeredAt,
  };
}

/** the SENDER's answered team invitation — the Team desk's Answered sheet. The
 *  face is the person asked; an address-only invite has none. */
export function sentTeamAnsweredRow(i: BusinessInvite, photoPath: string | null): AnsweredInviteRow | null {
  const reply = TEAM_REPLY[i.status];
  if (!reply) return null;
  const seat = teamSeatOf(i.memberRole);
  return {
    key: `sent-${i.id}`,
    kind: "team",
    name: i.name,
    photoPath,
    eyebrow: "Asked onto the team",
    sub: i.email ?? null,
    seatWord: seat.word,
    seatColour: seat.colour,
    reply,
    at: i.updatedAt ?? i.createdAt,
  };
}

/** a crew ask that is over — the RECEIVER's (the crew is the face) or the
 *  SENDER's (the person asked is) */
export function crewAnsweredRow(a: AnsweredCrewAsk, side: "receiver" | "sender"): AnsweredInviteRow {
  const receiver = side === "receiver";
  return {
    key: `crew-${a.id}`,
    kind: "crew",
    name: receiver ? a.crewName : a.name,
    photoPath: receiver ? a.crewPhoto : a.avatarPath,
    eyebrow: receiver ? "Crew invitation" : "Asked to join",
    sub: receiver ? [a.leaderName ? `Invited by ${a.leaderName}` : null, a.crewCity || null].filter(Boolean).join(" · ") || null : null,
    seatWord: a.role === "trainee" ? "Trainee" : "Member",
    seatColour: CREW_COLOUR,
    reply: a.reply,
    at: a.at,
  };
}
