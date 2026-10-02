import type { FollowListResult } from "@/features/profiles/server-actions/followLists";
import type { CrewMember } from "@/types/crew";

/** ⚠⚠ A CREW'S AND A STUDIO'S FOLLOWING IS ITS TEAM (2 Oct 2026, the user:
 *  "following for crew and studio should by default show list of team members.
 *  and reflect in user/ artist profile when seeing following").
 *
 *  Asked, they chose DERIVED rather than stored: no follow rows are written —
 *  the list is worked out from who is on the team, so joining or leaving updates
 *  it by itself and nobody can "unfollow" their own team. The other half of the
 *  same rule is `findTeamFollows` in `repositories/follows`: a member's own
 *  Following carries the crews and studios they are on.
 *
 *  Plain data in, plain rows out — the page already holds the team, so the sheet
 *  reads nothing. */
type Row = FollowListResult["rows"][number];

const STUDIO_ROLE: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  trainer: "Faculty",
  visiting_faculty: "Visiting faculty",
  assistant: "Assistant",
};

/** a crew's CONFIRMED people, leader first — an unanswered ask is not the team */
export function crewTeamRows(members: CrewMember[]): Row[] {
  return members
    .filter((m) => m.status === "confirmed")
    .sort((a, b) => (a.role === "leader" ? -1 : b.role === "leader" ? 1 : 0))
    .map((m) => ({
      id: `t-${m.userId}`,
      name: m.name,
      sub: m.role === "leader" ? "Crew leader" : m.role === "trainee" ? "Trainee" : "Member",
      href: `/person/${m.userId}`,
      photoPath: m.avatarPath ?? null,
    }));
}

/** a studio's team as `public_studio_team` hands it back, already in its order */
export function studioTeamRows(team: Array<{ userId: string; role: string; name: string; photoPath: string | null }>): Row[] {
  const seen = new Set<string>();
  return team
    .filter((m) => (seen.has(m.userId) ? false : (seen.add(m.userId), true)))
    .map((m) => ({
      id: `t-${m.userId}`,
      name: m.name,
      sub: STUDIO_ROLE[m.role] ?? "Team",
      href: `/person/${m.userId}`,
      photoPath: m.photoPath ?? null,
    }));
}
