import { CompactCard } from "@/features/discovery/components/CompactCard";
import { DosFollowers } from "@/features/discovery/components/discover-kit";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { photoUrl } from "@/lib/media/photo";
import type { CrewSummary } from "@/types/crew";

/** Discover's crew card — the prototype's CompactCard (4376-4423) in its CREW
 *  dress, two to a row under the Crews shelf: the crew's face filling the
 *  column, CREW in the chip inside it, the name, the city, and the roster size
 *  where an artist's follower count sits — a crew has no followers to count
 *  (crew follows: parity backlog). Opens the crew's page.
 *
 *  ⚠ NO STYLE TILE (27 Sep 2026, the user: "remove dance styles from studio,
 *  artist and crew discover cards"). The style is still what the Crews shelf is
 *  narrowed BY, and it is still on the crew's own page; what went is the tile on
 *  the card. */
export function CrewCard({ crew }: { crew: CrewSummary }) {
  return (
    <CompactCard
      href={`/crew/${crew.id}`}
      ariaLabel={`${crew.name} — Crew`}
      name={crew.name}
      label="CREW"
      photo={photoUrl(crew.photo)}
      grad={gradientOf(crew.name)}
      city={crew.city}
      foot={<DosFollowers n={crew.members} size={11} word={crew.members === 1 ? "member" : "members"} />}
    />
  );
}
