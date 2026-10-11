import type { SupabaseClient } from "@supabase/supabase-js";
import { findMyAnsweredInvites, findMyPendingInvites } from "@/repositories/invites";
import { findArtistPageOwners, findBusinessPhotoPaths, findMyMemberships } from "@/repositories/businesses";
import { findMyInboxOff } from "@/repositories/askSettings";
import { isArtistTeam, teamAnsweredRow, teamSeatOf, type AnsweredInviteRow } from "@/features/inbox/inviteRows";
import type { TeamInviteRow } from "@/features/inbox/components/JoinInvites";
import type { ArtistTeamRow } from "@/features/staff/components/ArtistTeams";
import type { AskKind } from "@/repositories/askSettings";

export interface ArtistTeamsData {
  invites: TeamInviteRow[];
  teams: ArtistTeamRow[];
  answered: AnsweredInviteRow[];
  inboxOff: AskKind[];
}

/** WHAT THE ARTIST TEAMS COLUMN READS (11 Oct 2026) — for an artist's own Team
 *  desk and for a plain user's `/team` alike, so the two cannot disagree. Every
 *  read answers empty rather than throwing: a Team page must not break over the
 *  column a person may never open. */
export async function loadArtistTeams(supabase: SupabaseClient, userId: string): Promise<ArtistTeamsData> {
  const [pending, answeredAll, memberships, inboxOff] = await Promise.all([
    findMyPendingInvites(supabase).catch(() => []),
    findMyAnsweredInvites(supabase).catch(() => []),
    findMyMemberships(supabase).catch(() => []),
    findMyInboxOff(supabase, userId).catch(() => [] as AskKind[]),
  ]);
  const pendingArtist = pending.filter((i) => isArtistTeam(i.businessType));
  const answeredArtist = answeredAll.filter((i) => isArtistTeam(i.businessType));
  /* the artist teams this person is ON — never their own page */
  const seats = memberships.filter((m) => m.business.type === "artist_page" && m.memberRole !== "owner");
  const [owners, photos] = await Promise.all([
    findArtistPageOwners(supabase, seats.map((m) => m.business.id)).catch(() => ({}) as Awaited<ReturnType<typeof findArtistPageOwners>>),
    findBusinessPhotoPaths(supabase, [...new Set([...pendingArtist.map((i) => i.businessId), ...answeredArtist.map((i) => i.businessId)])]).catch(() => ({}) as Record<string, string | null>),
  ]);
  return {
    invites: pendingArtist.map((i) => ({ ...i, photoPath: i.businessPhotoPath ?? photos[i.businessId] ?? null })),
    teams: seats
      .filter((m) => owners[m.business.id]?.userId !== userId)
      .map((m) => {
        const o = owners[m.business.id];
        const seat = teamSeatOf(m.memberRole);
        return {
          businessId: m.business.id,
          name: o?.name ?? m.business.name,
          photoPath: o?.photoPath ?? m.business.photoPath ?? null,
          ownerId: o?.userId ?? null,
          city: m.business.city ?? null,
          seatWord: seat.word,
          seatColour: seat.colour,
        };
      }),
    answered: answeredArtist.map((i) => teamAnsweredRow(i, photos[i.businessId] ?? null)),
    inboxOff,
  };
}
