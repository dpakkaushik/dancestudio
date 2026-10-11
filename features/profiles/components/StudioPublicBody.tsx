import { InvertedPanel } from "@/components/ui/InvertedPanel";
import { MembershipsOnSale } from "@/features/memberships/components/MembershipsOnSale";
import { photoUrl } from "@/lib/media/photo";
import type { MembershipOnSale as MembershipOnSaleRow } from "@/repositories/memberships";
import type { CalendarEntry } from "@/types/calendar";
import type { PublicTeamMember } from "@/types/publicProfile";
import type { Room } from "@/types/room";
import { NextSessions, type NextSessionsBooking } from "./NextSessions";
import { PeopleGroup, PersonChip } from "./profile-kit";
import { StudioPlace } from "./StudioPlace";

/** EVERYTHING UNDER A STUDIO'S TOP PANEL — the place (address, rooms, what it
 *  sells), the next sessions and the team by role.
 *
 *  ⚠ ONE COMPONENT FOR TWO SCREENS (12 Oct 2026, the user: "since home is now
 *  empty can show all elements from public profile page here as well"): the
 *  studio's public page and its own home draw this, so the two cannot drift —
 *  the lesson `PersonBody` was extracted for on 20 Sep. */
export function StudioPublicBody({
  businessName,
  isStudio,
  accent,
  address,
  rooms,
  memberships,
  signedIn,
  canBuy,
  nextSessions,
  booking,
  team,
}: {
  businessName: string;
  isStudio: boolean;
  accent: string;
  address: string;
  rooms: Room[];
  memberships: MembershipOnSaleRow[];
  signedIn: boolean;
  /** a member of the studio is not offered a pass of their own studio */
  canBuy: boolean;
  nextSessions: CalendarEntry[];
  booking?: NextSessionsBooking;
  team: PublicTeamMember[];
}) {
  /* the seats a studio's page names (19 Sep 2026) and the assistants (20 Sep);
     a `staff` seat is never named — a front-desk job is not a public association */
  const owners = team.filter((m) => m.role === "owner");
  const faculty = team.filter((m) => m.role === "trainer");
  const visiting = team.filter((m) => m.role === "visiting_faculty");
  const assistants = team.filter((m) => m.role === "assistant");
  const chip = (m: PublicTeamMember, word: string) => (
    <PersonChip key={m.userId} href={`/person/${m.userId}`} name={m.name} role={word} roleColour={accent} photo={photoUrl(m.photoPath)} />
  );
  const onSale = <MembershipsOnSale memberships={memberships} businessName={businessName} accent={accent} signedIn={signedIn} canBuy={canBuy} />;
  return (
    <>
      {isStudio ? (
        <StudioPlace address={address} rooms={rooms} tint={accent}>
          {onSale}
        </StudioPlace>
      ) : null}
      <InvertedPanel ground="page">
        <NextSessions entries={nextSessions} booking={booking} />
        {isStudio ? null : onSale}
        {owners.length ? <PeopleGroup title="Owner" n={owners.length}>{owners.map((m) => chip(m, m.isOrg ? "Organization" : "Owner"))}</PeopleGroup> : null}
        {faculty.length ? <PeopleGroup title="Faculty" n={faculty.length}>{faculty.map((m) => chip(m, "Faculty"))}</PeopleGroup> : null}
        {visiting.length ? <PeopleGroup title="Visiting faculty" n={visiting.length}>{visiting.map((m) => chip(m, "Visiting faculty"))}</PeopleGroup> : null}
        {assistants.length ? <PeopleGroup title="Assistants" n={assistants.length}>{assistants.map((m) => chip(m, "Assistant"))}</PeopleGroup> : null}
      </InvertedPanel>
    </>
  );
}
