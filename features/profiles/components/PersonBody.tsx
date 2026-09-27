import Link from "next/link";
import { MembershipsOnSale } from "@/features/memberships/components/MembershipsOnSale";
import type { MembershipOnSale } from "@/repositories/memberships";
import type { PersonOrganization } from "@/repositories/organizationTeam";
import type { PublicTeamMember } from "@/types/publicProfile";
import type { PublicPerson } from "@/repositories/publicPerson";
import { photoUrl } from "@/lib/media/photo";
import { CREW_ROLE_WORD } from "@/types/crew";
import { MEMBER_ROLE_WORD } from "@/types/staff";
/* ⚠ `Group` and `Row` went with the Train group (27 Sep 2026) — every group left
   on this page is a `PeopleGroup` of chips, which is the user's own shape from
   the same morning. `Tenant` went with them: nothing here is a business row any
   more, only associations and chips. */
import { PeopleGroup, PersonChip, SchedIcon, bigWhite } from "./profile-kit";
import type { ReactNode } from "react";

/** EVERYTHING UNDER A PERSON'S HERO — WRITTEN ONCE (20 Sep 2026).
 *
 *  The user, for the third time: *"FOR SOME REASON DUMMY PROFILE AND ACTUAL
 *  WORKING PROFILES HAVE SOME DISPLAY ISSUE ON PROFILES FIX THAT THEY BOTH
 *  SHOULD BE SAME … FOR SOME REASON YOU ARE NOT ABLE TO FIX THE DIFFERENCE IN
 *  PROFILES. FIX IT PERMANENTLY."*
 *
 *  They are right that it keeps coming back, and the reason is structural rather
 *  than cosmetic: `/profile` (`MyProfilePage`) and `/person/{id}`
 *  (`PublicPersonPage`) are TWO components drawing the same person from the same
 *  read (`findPublicPerson` — both routes call it), so every fix had to be made
 *  twice and one of the two was always missed. Read side by side on 20 Sep they
 *  had drifted five ways:
 *
 *    · **Schedule and Memberships were in OPPOSITE ORDERS.** A studio's page ran
 *      Schedule → Memberships and a person's ran Memberships → Schedule, which
 *      is the one the user caught by name: *"SCHEDULE WILL ALWAYS BE ABOVE
 *      MEMBERSHIPS IN PROFILE PAGE PLEASE CHECK FOR dEEPAK kAUSHIK PROFILE."*
 *    · The Profile tab drew NO memberships at all, so an artist selling one saw
 *      it on their public page and not on their own.
 *    · The groups were headed differently for the same rows — "Teaches at" and
 *      "Runs" on one, "Studios taught at" / "Studios associated with" /
 *      "Artists associated with" on the other.
 *    · The Profile tab hand-drew the figures, styles and links rows instead of
 *      `EntityBand`, so their spacing and their empty states were its own.
 *    · One showed a WhatsApp handle in the links rail and the other hid it.
 *
 *  So the parts that MUST be the same live here, in one file, and the two
 *  screens keep only what is genuinely theirs — the Follow bell, the Enquiry
 *  row and the report link on the public page; the Settings sheet, the follow
 *  sheets and an organization's own studio list on the tab. A future change to
 *  the order or to a heading lands on both by construction, which is the only
 *  kind of "permanently" that survives the next slice.
 *
 *  ⚠ SCHEDULE IS ABOVE MEMBERSHIPS, EVERYWHERE, and it is the user's rule rather
 *  than a preference: the schedule is what the page is FOR (10919 — "the one
 *  white bar"), and what is on sale is an offer underneath it. A studio's page
 *  already read that way; this is what makes a person's match it. */

export function PersonBody({
  person,
  isMe,
  signedIn,
  memberships = [],
  scheduleHref,
  accent,
  beforeGroups = null,
  omitStudioSeats = false,
  organizations = [],
  artistTeam = [],
}: {
  person: PublicPerson;
  isMe: boolean;
  signedIn: boolean;
  /** what this artist sells through the page behind them (19 Sep 2026) */
  memberships?: MembershipOnSale[];
  /** the public schedule of a business they run; null draws no bar rather than
   *  a button pointing nowhere (10868) */
  scheduleHref: string | null;
  accent: string;
  /** a group only ONE of the two screens has — an organization's own studios,
   *  which nobody but itself reads (R9) */
  beforeGroups?: ReactNode;
  /** ⚠ AN ORGANIZATION'S SEATS ARE ITS OWN STUDIOS (20 Sep 2026, and the e2e
   *  caught it in one line). "Studios associated with" is a person's SEATS on
   *  somebody else's studios; an organization's only seats are the owner rows on
   *  the studios it runs — which `beforeGroups` has already listed as "Your
   *  studios", and listed more completely, because that list carries the
   *  unlisted ones too. Drawn both ways, the same studio appeared twice on one
   *  screen, which is the very duplication this file exists to end. */
  omitStudioSeats?: boolean;
  /** ⚠ THE ORGANIZATIONS THAT NAME THEM (27 Sep 2026, the user: "all profiles
   *  should only showcase according to how the team sections are managed for
   *  each profile and their associations linked properly"). The link ran one way
   *  only: an organization's Team desk names somebody and prints them on its
   *  page with a door to here, and here said nothing back.
   *  `findOrganizationsNaming` has the whole reason, including why it needs no
   *  migration. Empty for a screen that does not pass it. */
  organizations?: PersonOrganization[];
  /** ⚠ THE PEOPLE ON THIS ARTIST'S OWN PAGE (27 Sep 2026, the user: "an
   *  artist's team, both ways"). The link ran one way here too: a person seated
   *  on an artist page has read "Artists associated with" on their own profile
   *  since 20 Sep, and the artist's profile named nobody back — because
   *  `public_studio_team` ended with `b.type = 'studio'` and refused an artist
   *  page outright (`20260927120000` is the one clause that opens it).
   *  ⚠ The OWNER row is dropped here and only here: they are whose page this
   *  is, and a row opening the profile you are standing on is the loop C37
   *  exists to stop. A studio's page still names its owner, which is a
   *  different person from the reader. */
  artistTeam?: PublicTeamMember[];
}) {
  const { profile } = person;
  /** ⚠ NEVER THEIR OWN ARTIST PAGE as a place they teach (R24) — but a class
   *  taught at SOMEBODY ELSE'S artist page is a real thing, and the old filter
   *  (`tenantType === "studio"`) was broader than the rule it cited, so it
   *  dropped those too. `person_teaches_at` returns artist pages with no type
   *  filter, so what has to go is the ONE page they own.
   *
   *  ⚠⚠ AND THE TEST IS `artistPageId`, NOT `runs` — caught by reading this back
   *  rather than by a run, which is the second time today. `runs` comes from
   *  `business_members`, and RLS admits that table to a business's OWN MEMBERS:
   *  for a stranger it is EMPTY, so `!runs.some(…)` would be true of everything
   *  and every visitor would have seen the person's own page listed under Teach —
   *  R24's exact bug, for the majority of viewers, introduced by the fix for a
   *  smaller one. `artistPageId` is a definer read that answers anybody. */
  const studiosTaughtAt = person.teachesAt.filter((t) => t.tenantType === "studio" || t.tenantId !== person.artistPageId);
  /* ⚠ WHERE THEY ARE SEATED (20 Sep 2026, the user's list E) — a different fact
     from the one above, which counts PUBLISHED CLASSES: somebody asked onto a
     team who has not taught yet is associated and teaches at nothing. Their own
     page is not an association with themselves, so it is left out. */
  const studiosWith = omitStudioSeats ? [] : person.associations.filter((a) => a.tenantType === "studio");
  const artistsWith = person.associations.filter((a) => a.tenantType === "artist_page" && a.role !== "owner");
  /* who works WITH this artist, on their own page — the owner is the person
     whose page it is, so their own row is not drawn (see the prop's comment) */
  const teamFaculty = artistTeam.filter((m) => m.role === "trainer" || m.role === "visiting_faculty");
  const teamAssistants = artistTeam.filter((m) => m.role === "assistant");

  /* ⚠ FOUR COLUMNS OF STUDIOS, NOT ONE (21 Sep 2026, the user: "Studios Should
     Have 3 Columns - Train Teach & Assist", and their own word for the fourth:
     "fourth section to be called Manage"). "Studios taught at" was ONE heading
     over two quite different facts — a studio where you are the artist and one
     where you assist somebody else — and `person_teaches_at` has always known
     which, in its `kinds` column ('Artist' | 'Assistant' | 'Artist ·
     Assistant'), so this needs no migration: it is a word the read already
     carried and no screen ever split on.
     ⚠ A studio where somebody does BOTH is in BOTH groups, deliberately: it is
     two true statements about one place, and picking one would make the other
     disappear. */
  /** ⚠⚠ ONE STUDIO, ONE ROW, ONE TITLE (27 Sep 2026 — the user's "Studios with
   *  team Title"). Three groups became one, so the merge has to decide what a
   *  row SAYS, and the order is the point: a SEAT outranks a class, because a
   *  seat is what the studio calls you and a class is what you did there. With
   *  no seat the row says what they actually do, which is the fact that would
   *  otherwise have left the page with the Teach and Assist groups.
   *  ⚠ Keyed by id, so a studio where somebody teaches AND assists AND holds a
   *  seat is one row rather than three — which is the duplication the collapse
   *  exists to end. */
  const studios = (() => {
    const byId = new Map<string, { id: string; name: string; photo: string | null; title: string }>();
    studiosWith.forEach((a) => {
      byId.set(a.tenantId, {
        id: a.tenantId,
        name: a.tenantName,
        photo: a.photoPath ? photoUrl(a.photoPath) : null,
        /* ⚠ a seat they have LEFT says so rather than disappearing (20 Sep
           2026) — the years somebody taught somewhere are part of who they are */
        title: a.ended ? `${MEMBER_ROLE_WORD[a.role]} · past` : MEMBER_ROLE_WORD[a.role],
      });
    });
    studiosTaughtAt.forEach((t) => {
      if (byId.has(t.tenantId)) return;
      const teaches = t.kinds.includes("Artist");
      const assists = t.kinds.includes("Assistant");
      byId.set(t.tenantId, {
        id: t.tenantId,
        name: t.tenantName,
        photo: null,
        title: teaches && assists ? "Teaches · assists" : teaches ? "Teaches here" : "Assists here",
      });
    });
    return [...byId.values()];
  })();

  /** ⚠ THE CREWS ARE ONE GROUP WITH THE POSITION ON THE ROW (27 Sep 2026, the
   *  user: "Crew with Postion"). They were Leader and Member, two groups — the
   *  distinction is real (S_bizhub 2596) and it is a WORD, not a heading, which
   *  is what the position chip now carries. */
  const crews = person.crews;

  return (
    <>
      {/* ── THE ONE WHITE BAR THE PAGE IS FOR (10919), AND IT IS ALWAYS FIRST ── */}
      {/* (the Studios merge is computed above the return — see `studios`) */}
      {scheduleHref ? (
        <div style={{ marginTop: 8 }}>
          <Link href={scheduleHref} aria-label="Schedule" style={bigWhite}>
            <SchedIcon />
            Schedule
          </Link>
        </div>
      ) : null}

      {/* ── WHAT THEY SELL (19 Sep 2026): an artist's memberships, bought from
          their own profile page exactly as a studio's are from its ── */}
      <MembershipsOnSale memberships={memberships} businessName={profile.fullName} accent={accent} signedIn={signedIn} canBuy={!isMe} />

      {/* an organization's own studios, under one hood — the tab's alone */}
      {beforeGroups}

      {/* ── THE ASSOCIATIONS, IN ONE LANGUAGE (11000-11060) ──
          ⚠ NO `kind === "artist"` GATE ANY MORE. The public page hid "Studios
          taught at" from anybody without a live plan while the Profile tab showed
          it, which is two answers to one question — and the rows are public
          either way (`person_teaches_at` counts confirmed claims on PUBLISHED
          classes of LISTED businesses). A studio's trainer who never took the
          Artist plan taught those classes, and the page says so on both screens
          or on neither. */}
      {/* ⚠⚠ TRAIN IS GONE (27 Sep 2026, the user: *"Train section to be removed
          from profiles"*). It listed where somebody had TAKEN classes, on their
          own tab alone, and it was the one group on this page that was not an
          association with anybody — a studio you bought a class from is a
          receipt, not a relationship, and it read as a fifth kind of team.
          ⚠ Nothing else changes with it: the read (`findStudiosAttended`) went
          from `OwnProfileScreen` in the same breath rather than being left
          making a query nobody draws, which is this repo's own recurring shape
          met from the other side. */}

      {/* ⚠⚠ STUDIOS ARE ONE GROUP WITH A TITLE ON EACH ROW (27 Sep 2026, the
          user: *"User and artist — Crew with Postion, Organization with team
          title, Studios with team Title, Artist with team Title"*, and *"on all
          profile pages should only show"* those).
          They were THREE — Teach · Assist · Manage (R43, 21 Sep) — which put one
          studio on the page up to three times over, once per fact, so a person
          who teaches and assists at the same studio read as two associations.
          ⚠ NOTHING IS LOST: the seat word is the title where there is a seat,
          and where there is none the row says what they actually do there — a
          visiting artist teaches a studio's class without being on its team, and
          dropping the classes entirely would have taken that off the page.
          ⚠ TRAIN keeps its own group above: it is not a team title, it is where
          somebody LEARNS, and it is their own profile's alone (21 Sep). */}
      {studios.length ? (
        <PeopleGroup title="Studios" n={studios.length}>
          {studios.map((s) => (
            <PersonChip key={s.id} href={`/studio/${s.id}`} name={s.name} role={s.title} roleColour={accent} photo={s.photo} />
          ))}
        </PeopleGroup>
      ) : null}

      {artistsWith.length ? (
        <PeopleGroup title="Artists" n={artistsWith.length}>
          {artistsWith.map((a) => (
            /* an artist page IS the person behind it (18 Sep 2026) — open them
               directly rather than the address that only redirects */
            <PersonChip
              key={a.tenantId}
              href={a.ownerId ? `/person/${a.ownerId}` : `/artist/${a.tenantId}`}
              name={a.tenantName}
              photo={a.photoPath ? photoUrl(a.photoPath) : null}
              role={a.ended ? `${MEMBER_ROLE_WORD[a.role]} · past` : MEMBER_ROLE_WORD[a.role]}
              roleColour={accent}
            />
          ))}
        </PeopleGroup>
      ) : null}

      {/* ⚠ THE ORGANIZATIONS THAT NAME THEM (27 Sep 2026) — the other end of the
          link an organization's Team desk makes. Its page has printed these
          people with a door to here since push 2; this is the door back. The
          label is the organization's own word for the seat, so the two screens
          cannot disagree about what somebody is. */}
      {organizations.length ? (
        <PeopleGroup title="Organizations" n={organizations.length}>
          {organizations.map((o) => (
            <PersonChip
              key={o.orgId}
              href={`/org/${o.orgId}`}
              name={o.name}
              photo={o.photoPath ? photoUrl(o.photoPath) : null}
              role={o.role === "owner" ? "Owner" : "Event team"}
              roleColour={accent}
            />
          ))}
        </PeopleGroup>
      ) : null}

      {/* ⚠ THE OTHER END OF "Artists associated with" (27 Sep 2026) — the people
          seated on this artist's own page, named the way a studio's page has
          named its faculty since 19 Sep. Same read, same words, same seats. */}
      {/* ⚠ THE PEOPLE ON THIS ARTIST'S OWN PAGE — one group with the position on
          the row (27 Sep 2026: *"Studio, Crew and Organization — simply should
          show the Team with position"*, and an artist page is a profile kind
          like the other three). It was Faculty and Assistants, two headings for
          what is one roster. */}
      {teamFaculty.length + teamAssistants.length ? (
        <PeopleGroup title="Team" n={teamFaculty.length + teamAssistants.length}>
          {[...teamFaculty, ...teamAssistants].map((m) => (
            <PersonChip
              key={m.userId}
              href={`/person/${m.userId}`}
              name={m.name}
              photo={m.photoPath ? photoUrl(m.photoPath) : null}
              role={m.role === "visiting_faculty" ? "Visiting faculty" : m.role === "assistant" ? "Assistant" : "Faculty"}
              roleColour={accent}
            />
          ))}
        </PeopleGroup>
      ) : null}

      {/* the crews they are IN — confirmed only (Step 22), in the user's own two
          columns (21 Sep 2026). A crew you LEAD and a crew you dance in are not
          the same object with a flag on it — the prototype says so at S_bizhub
          2596, and this is that distinction said on the profile too. */}
      {crews.length ? (
        <PeopleGroup title="Crew" n={crews.length}>
          {crews.map((c) => (
            <PersonChip
              key={c.crewId}
              href={`/crew/${c.crewId}`}
              name={c.name}
              photo={c.photo ? photoUrl(c.photo) : null}
              role={c.role === "leader" ? "Leader" : CREW_ROLE_WORD[c.role]}
              roleColour={accent}
            />
          ))}
        </PeopleGroup>
      ) : null}
    </>
  );
}

/* ⚠ `CrewRow` IS DELETED (27 Sep 2026). The crews are one group of chips with
   the position on each, so the full-width row — and the "{style} · {city} ·
   since {month}" sub-line it carried — has no caller. This repo has twice paid
   for a component nothing renders (`PencilIcon`, the `FollowToggle` pill), so
   it goes rather than standing; `sinceWords` went with it, its only reader. */
