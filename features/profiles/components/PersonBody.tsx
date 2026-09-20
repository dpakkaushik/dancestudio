import Link from "next/link";
import { MembershipsOnSale } from "@/features/memberships/components/MembershipsOnSale";
import type { MembershipOnSale } from "@/repositories/memberships";
import type { PublicPerson } from "@/repositories/publicPerson";
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
      {studiosTaughtAt.length ? (
        <Group title="Studios taught at" n={studiosTaughtAt.length}>
          {studiosTaughtAt.map((t) => (
            <Row key={t.tenantId} href={`/studio/${t.tenantId}`} markName={t.tenantName} title={t.tenantName} sub={[t.kinds, `${t.classes} class${t.classes === 1 ? "" : "es"}`, t.city].filter(Boolean).join(" · ")} />
          ))}
        </Group>
      ) : null}

      {studiosWith.length ? (
        <Group title="Studios associated with" n={studiosWith.length}>
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

      {/* the crews they are IN — confirmed only (Step 22) */}
      {person.crews.length ? (
        <Group title="Crews" n={person.crews.length}>
          {person.crews.map((c) => (
            <Row
              key={c.crewId}
              href={`/crew/${c.crewId}`}
              markName={c.name}
              photo={c.photo ? photoUrl(c.photo) : null}
              title={c.name}
              sub={`${c.style} · ${c.city} · since ${sinceWords(c.since)}`}
              right={c.role === "leader" ? "Leads this crew" : CREW_ROLE_WORD[c.role]}
            />
          ))}
        </Group>
      ) : null}
    </>
  );
}

const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));
