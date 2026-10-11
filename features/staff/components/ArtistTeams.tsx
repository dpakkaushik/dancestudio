"use client";

import { ToolCard, ToolChip, ToolHead } from "@/components/ui/ToolCard";
import { TeamInvites, type TeamInviteRow } from "@/features/inbox/components/JoinInvites";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { MUTED, SUB } from "@/lib/design/tokens";

/** an artist's team this person holds a seat on — drawn as the ARTIST, because
 *  an artist page has no face of its own (R24) */
export interface ArtistTeamRow {
  businessId: string;
  /** the artist's own name, else the page's */
  name: string;
  photoPath: string | null;
  /** the artist's person id — the card is a door to their profile */
  ownerId: string | null;
  city: string | null;
  seatWord: string;
  seatColour: string;
}

/** THE ARTIST TEAMS COLUMN (11 Oct 2026, the user: "Team section to have two
 *  columns My Team which has current set and Artist Teams which manages team
 *  invites from artist which is currently being handled in studio teams … for
 *  studio team invites in studio. artist team invites in teams"). The artists
 *  asking you onto their team, answered here with Join · Decline, and the
 *  artists' teams you are already on. A studio's invitations stay on the
 *  Studios hub's Team column. */
export function ArtistTeams({
  invites,
  teams,
  stayOn,
}: {
  invites: TeamInviteRow[];
  teams: ArtistTeamRow[];
  /** the address a Join or a Decline keeps — this column */
  stayOn: string;
}) {
  const tint = DOS_TOOLS.team.c;
  return (
    <div data-testid="artist-teams">
      <TeamInvites invites={invites} stayOn={stayOn} heading="Invited to an artist's team" testId="artist-team-invites" />
      {teams.length > 0 ? (
        <>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, textTransform: "uppercase", margin: "6px 2px 8px" }}>
            Artist teams you are on · {teams.length}
          </div>
          {teams.map((t) => (
            <div key={t.businessId} style={{ marginBottom: 10 }}>
              <ToolCard testId="artist-team" href={t.ownerId ? `/person/${t.ownerId}` : undefined} hrefLabel={`${t.name} — open the profile`}>
                <ToolHead
                  tint={tint}
                  name={t.name}
                  photoPath={t.photoPath}
                  eyebrow="Artist · Team"
                  sub={t.city ?? undefined}
                  right={<ToolChip word={t.seatWord} fg={t.seatColour} bg={`${t.seatColour}1f`} />}
                />
              </ToolCard>
            </div>
          ))}
        </>
      ) : null}
      {invites.length === 0 && teams.length === 0 ? (
        <div data-testid="artist-teams-empty" style={{ border: "1.5px dashed var(--el)", borderRadius: 18, padding: "22px 16px", textAlign: "center", fontSize: 13, color: SUB }}>
          No artist has asked you onto their team.
        </div>
      ) : null}
    </div>
  );
}
