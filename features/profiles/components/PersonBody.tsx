import Link from "next/link";
import { MembershipsOnSale } from "@/features/memberships/components/MembershipsOnSale";
import type { MembershipOnSale } from "@/repositories/memberships";
import type { PublicPerson } from "@/repositories/publicPerson";
import type { Tenant } from "@/types/tenant";
import { photoUrl } from "@/lib/media/photo";
import { CREW_ROLE_WORD } from "@/types/crew";
import { MEMBER_ROLE_WORD } from "@/types/staff";
import { Group, Row, SchedIcon, bigWhite } from "./profile-kit";
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
  trainsAt = [],
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
  /** ⚠ TRAIN IS YOUR OWN PROFILE'S ALONE (21 Sep 2026, the user's answer when
   *  asked how far to take it: "Own profile only"). Where somebody has TAKEN
   *  classes comes off their own bookings (`findStudiosAttended`), and a
   *  booking is private — RLS admits it to the learner and to the studio, and
   *  nobody else — so publishing it on `/person/{id}` would hand a stranger a
   *  list of the places somebody dances. The tab passes it; the public page
   *  never does, and the group is simply not drawn there. */
  trainsAt?: Tenant[];
  /** ⚠ AN ORGANIZATION'S SEATS ARE ITS OWN STUDIOS (20 Sep 2026, and the e2e
   *  caught it in one line). "Studios associated with" is a person's SEATS on
   *  somebody else's studios; an organization's only seats are the owner rows on
   *  the studios it runs — which `beforeGroups` has already listed as "Your
   *  studios", and listed more completely, because that list carries the
   *  unlisted ones too. Drawn both ways, the same studio appeared twice on one
   *  screen, which is the very duplication this file exists to end. */
  omitStudioSeats?: boolean;
}) {
  const { profile } = person;
  /* "Studios taught at" — the studios, never their own artist page listed as a
     place they teach (R24) */
  const studiosTaughtAt = person.teachesAt.filter((t) => t.tenantType === "studio");
  /* ⚠ WHERE THEY ARE SEATED (20 Sep 2026, the user's list E) — a different fact
     from the one above, which counts PUBLISHED CLASSES: somebody asked onto a
     team who has not taught yet is associated and teaches at nothing. Their own
     page is not an association with themselves, so it is left out. */
  const studiosWith = omitStudioSeats ? [] : person.associations.filter((a) => a.tenantType === "studio");
  const artistsWith = person.associations.filter((a) => a.tenantType === "artist_page" && a.role !== "owner");

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
  const teachesAt = studiosTaughtAt.filter((t) => t.kinds.includes("Artist"));
  const assistsAt = studiosTaughtAt.filter((t) => t.kinds.includes("Assistant"));

  /* the crews, split by whether they are yours to run (21 Sep 2026, the user:
     "Crews - should have 2 columns Leader & Member") */
  const crewsLed = person.crews.filter((c) => c.role === "leader");
  const crewsIn = person.crews.filter((c) => c.role !== "leader");

  return (
    <>
      {/* ── THE ONE WHITE BAR THE PAGE IS FOR (10919), AND IT IS ALWAYS FIRST ── */}
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
      {/* TRAIN — where they have taken classes. Their own profile only; the
          comment on `trainsAt` says why. */}
      {trainsAt.length ? (
        <Group title="Train" n={trainsAt.length}>
          {trainsAt.map((t) => (
            <Row key={t.id} href={`/studio/${t.id}`} markName={t.name} photo={t.photoPath ? photoUrl(t.photoPath) : null} title={t.name} sub={[t.area, t.city].filter(Boolean).join(", ")} />
          ))}
        </Group>
      ) : null}

      {/* TEACH — published classes where they are the artist */}
      {teachesAt.length ? (
        <Group title="Teach" n={teachesAt.length}>
          {teachesAt.map((t) => (
            <Row key={t.tenantId} href={`/studio/${t.tenantId}`} markName={t.tenantName} title={t.tenantName} sub={[`${t.classes} class${t.classes === 1 ? "" : "es"}`, t.city].filter(Boolean).join(" · ")} />
          ))}
        </Group>
      ) : null}

      {/* ASSIST — published classes where they are on the floor with somebody */}
      {assistsAt.length ? (
        <Group title="Assist" n={assistsAt.length}>
          {assistsAt.map((t) => (
            <Row key={t.tenantId} href={`/studio/${t.tenantId}`} markName={t.tenantName} title={t.tenantName} sub={[`${t.classes} class${t.classes === 1 ? "" : "es"}`, t.city].filter(Boolean).join(" · ")} />
          ))}
        </Group>
      ) : null}

      {/* MANAGE — the SEATS they hold, which is a different fact from the
          classes above: somebody asked onto a team who has not taught yet
          manages a studio and teaches at nothing. */}
      {studiosWith.length ? (
        <Group title="Manage" n={studiosWith.length}>
          {studiosWith.map((a) => (
            <Row
              key={a.tenantId}
              href={`/studio/${a.tenantId}`}
              markName={a.tenantName}
              photo={a.photoPath ? photoUrl(a.photoPath) : null}
              title={a.tenantName}
              sub={a.city ?? ""}
              /* ⚠ a seat they have LEFT says so rather than disappearing
                 (20 Sep 2026) — the years somebody taught somewhere are part of
                 who they are, and a page that forgets them the day they leave is
                 not a record */
              right={a.ended ? `${MEMBER_ROLE_WORD[a.role]} · past` : MEMBER_ROLE_WORD[a.role]}
            />
          ))}
        </Group>
      ) : null}

      {artistsWith.length ? (
        <Group title="Artists associated with" n={artistsWith.length}>
          {artistsWith.map((a) => (
            /* an artist page IS the person behind it (18 Sep 2026) — open them
               directly rather than the address that only redirects */
            <Row
              key={a.tenantId}
              href={a.ownerId ? `/person/${a.ownerId}` : `/artist/${a.tenantId}`}
              markName={a.tenantName}
              photo={a.photoPath ? photoUrl(a.photoPath) : null}
              title={a.tenantName}
              sub={a.city ?? ""}
              right={a.ended ? `${MEMBER_ROLE_WORD[a.role]} · past` : MEMBER_ROLE_WORD[a.role]}
            />
          ))}
        </Group>
      ) : null}

      {/* the crews they are IN — confirmed only (Step 22), in the user's own two
          columns (21 Sep 2026). A crew you LEAD and a crew you dance in are not
          the same object with a flag on it — the prototype says so at S_bizhub
          2596, and this is that distinction said on the profile too. */}
      {crewsLed.length ? (
        <Group title="Leader" n={crewsLed.length}>
          {crewsLed.map((c) => (
            <CrewRow key={c.crewId} c={c} right="Leads this crew" />
          ))}
        </Group>
      ) : null}

      {crewsIn.length ? (
        <Group title="Member" n={crewsIn.length}>
          {crewsIn.map((c) => (
            <CrewRow key={c.crewId} c={c} right={CREW_ROLE_WORD[c.role]} />
          ))}
        </Group>
      ) : null}
    </>
  );
}

/** One crew row, drawn identically in Leader and in Member — the two groups say
 *  WHICH they are, so the row must not differ beyond the word on its right. */
function CrewRow({ c, right }: { c: PublicPerson["crews"][number]; right: string }) {
  return <Row href={`/crew/${c.crewId}`} markName={c.name} photo={c.photo ? photoUrl(c.photo) : null} title={c.name} sub={`${c.style} · ${c.city} · since ${sinceWords(c.since)}`} right={right} />;
}

const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));
