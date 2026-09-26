import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { EventCard, type EventCardHost } from "@/features/events/components/EventCard";
import { EntityBand, Figure } from "@/features/profiles/components/profile-band";
import { ActionRow, CallButton, LocationButton, MailButton, mapsPinHref } from "@/features/profiles/components/ContactButtons";
import { FollowToggle } from "@/features/profiles/components/FollowToggle";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { ProfileLink, ProfileShare } from "@/features/profiles/components/ProfileShare";
import { HeroDot, HeroId, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { Group, PROFILE_RING, Row, TYPE } from "@/features/profiles/components/profile-kit";
import { DOS_UI, INK, LILAC, MUTED } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { PublicOrganization, PublicOrganizationTeamMember } from "@/repositories/publicOrganization";
import { enquiryTypesFor } from "@/types/enquiry";
import type { DanceEvent } from "@/types/event";

/** AN ORGANIZATION'S PUBLIC PAGE (18 Sep 2026, the user: "[the eye] should show
 *  organization profile page, and the same should reflect inside the event cards
 *  with photo"). It amends R9 this far: the same identity hero every profile
 *  page wears — ORGANIZATION over the name, the logo on the disc, the city, the
 *  GST tick when it is verified — and what a stranger came for.
 *
 *  RE-CUT 19 Sep 2026 TO THE USER'S LIST, and R9 amended a second time: an
 *  organization CAN BE FOLLOWED now ("Follow with Following toggle for all") —
 *  a public one, through `set_person_follow` — though it still follows nobody.
 *  Under the hero, in the order every public page shares: **Follow ·
 *  Following**, the **Bio** (About and the links), the **buttons** an
 *  organization's page carries — Enquiry · Call · Mail · Location — then the
 *  **associations**: THE STUDIOS IT RUNS (the listed ones, each a door to its
 *  own page) and THE EVENTS IT HOSTS. The header swipes through up to ten
 *  pictures, added from Edit profile like a person's.
 *
 *  PUSH 2 (19 Sep 2026), three of the user's answers land here: **OWNER and
 *  TEAM** — the people the organization named from its Team desk and who said
 *  yes (`organization_members`, through the definer read `public_organization_team`);
 *  an organization is still ONE LOGIN, these are LABELS on its page, not powers.
 *  **Location opens the organization's own PIN** once it has placed itself from
 *  Edit profile (`set_my_place`), Maps by name and city until then. **Stats**
 *  opens THIS organization's standing — its studios' rows — for a visitor.
 *
 *  ⚠ AN ORGANIZATION IS A BUSINESS A PERSON OPENS SINCE 26 Sep 2026: `org.id` is
 *  its `businesses` row, following it is following the BUSINESS (kind
 *  "business" on the bell), an enquiry lands on the row itself, and there is
 *  NO Studios group — it runs none — and no "N studios" in the meta line. The
 *  owner reads this page exactly as a visitor does (a studio's owner reads
 *  `/studio/{id}` the same way); their own screen is `/business/{id}`, so
 *  `isMe` is gone. A studio follows nobody, so Following is not a figure here. */

const monthYear = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

export function OrganizationPublicPage({
  org,
  events,
  team = [],
  header = [],
  following = false,
  followers = null,
  signedIn = false,
}: {
  org: PublicOrganization;
  events: DanceEvent[];
  /** THE TEAM (push 2): the confirmed people it named — owners first */
  team?: PublicOrganizationTeamMember[];
  /** THE HEADER PICTURES: up to ten, the organization's own `studio_photos` (26 Sep 2026) */
  header?: HeaderPhoto[];
  following?: boolean;
  /** the live follower count, printed on the Follow bell (19 Sep 2026, later) */
  followers?: number | null;
  signedIn?: boolean;
}) {
  /* ⚠ BLUE, BECAUSE IT IS AN ORGANIZATION (20 Sep 2026, the user's colour list).
     The hero was `gradientOf(org.name)` — a hash — while its accent was already
     `DOS_TINT.org`, so the wash and the ink on one screen came from two
     different ideas. One registry; the organization moved off the gold a studio
     now wears. */
  const grad = PROFILE_RING.org;
  const tint = grad[1];
  const host: EventCardHost = { name: org.name, photo: photoUrl(org.photoPath), href: null };
  const shots: HeroShot[] = header.filter((h) => h.url).map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${org.name}`, signed: h.signed }));
  /* an organization is asked through its hosting row (R15) — a celebration, a
     corporate show, a collaboration.
     ⚠ DRAWN ON ITS OWN PAGE TOO, AND DISABLED (20 Sep 2026, the user: "Viewing
     your own profile should show same buttons which you see on discover") —
     `ActionRow` sizes its grid by how many cells it gets, so dropping this one
     re-laid out the three beside it. */
  const asksGoHere = enquiryTypesFor("org").length > 0;
  /* ⚠ TWO PUBLISHED LABELS SINCE 26 Sep 2026: Owner and Event team. The definer
     read leaves a plain `member` out, so there is no third group to draw. */
  const owners = team.filter((m) => m.role === "owner");
  const eventTeam = team.filter((m) => m.role === "event_team");
  /* the Location button opens the organization's own pin once it has placed itself (push 2) */
  const pinHref = org.lat != null && org.lng != null ? mapsPinHref(org.lat, org.lng) : null;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        <IdentityHero
          testId="org-hero"
          name={org.name}
          grad={grad}
          tint={tint}
          eyebrow="Organization"
          eyebrowSub={org.memberNo ? <HeroId>{memberNoWords(org.memberNo)}</HeroId> : null}
          verified={org.verified}
          meta={
            <>
              {org.city ? <span>{org.city}</span> : null}
              {org.city ? <HeroDot /> : null}
              <span>Since {monthYear(org.since)}</span>
            </>
          }
          styles={[]}
          avatar={photoUrl(org.photoPath)}
          avatarAlt={`${org.name} — logo`}
          shots={shots}
          /* ⚠ NO CORNER ON A PROFILE PAGE (21 Sep 2026) — the same loop, and the
             plainest case of it: this corner and the Profile tab's eye pointed
             at each other. See `PublicPersonPage`. */
        >
          {/* ── THE SAME BAND HOME WEARS (20 Sep 2026). An organization dances no
              style of its own — what it runs does — so it draws figures and links
              and no styles row. ⚠ NO BIO ("Remove bio from all profiles"). ── */}
          <EntityBand
            figures={
              <>
                <Figure n={followers} label={followers === 1 ? "Follower" : "Followers"} />
                {/* ⚠ NO FOLLOWING FIGURE (26 Sep 2026): a business follows nothing —
                    `follows.follower_id` references `profiles` — and the login that
                    used to follow on the organization's behalf is retired */}
              </>
            }
            /* FOLLOW · QR · SHARE (21 Sep 2026, the user's own order). ⚠ NO STATS
               CHIP (26 Sep 2026): the board it opened ranked the organization's
               STUDIOS, and it runs none now — `/org/{id}/stats` redirects here. */
            chips={
              <>
                {/* a BUSINESS follow — the bell says why when the database would
                    refuse (the organization's own team cannot follow it) */}
                <FollowToggle
                  target={{ kind: "business", id: org.id }}
                  initialFollowing={following}
                  initialFollowers={followers}
                  accent={tint}
                  signedIn={signedIn}
                  variant="chip"
                />
                <ProfileShare path={`/org/${org.id}`} name={org.name} />
                <ProfileLink path={`/org/${org.id}`} name={org.name} />
              </>
            }
            socials={org.socials}
          />
        </IdentityHero>

        {/* ── THE BUTTONS AN ORGANIZATION'S PAGE CARRIES (19 Sep 2026): Enquiry · Call ·
            Mail · Location — one block; Follow is the bell in the row above ── */}
        {/* no gap of its own — the hero's own bottom padding is it (21 Sep 2026) */}
        <ActionRow>
          {asksGoHere ? (
            /* the organization's own row is what an enquiry lands on (26 Sep 2026) —
               `send_enquiry` refuses the organization's own team, in its own words */
            <EnquiryButton tenantId={org.id} tenantName={org.name} tenantType="org" signedIn={signedIn} accent={tint} />
          ) : null}
          {org.phone ? <CallButton phone={org.phone} /> : null}
          {org.contactEmail ? <MailButton email={org.contactEmail} /> : null}
          {pinHref ? <LocationButton href={pinHref} /> : org.city ? <LocationButton query={`${org.name} ${org.city}`} /> : null}
        </ActionRow>

        {/* ── THE ASSOCIATIONS (push 2: "Organization: Owner (one of the users added
            from team)"): Owner · Event team · Events. ⚠ NO STUDIOS GROUP since
            26 Sep 2026 — an organization runs none. ── */}
        {owners.length ? (
          <Group title="Owner" n={owners.length}>
            {owners.map((m) => (
              <Row key={m.memberId} href={`/person/${m.userId}`} title={m.name} sub={[m.isArtist ? "Artist" : "User", m.city].filter(Boolean).join(" · ")} photo={photoUrl(m.photoPath)} right="Owner" />
            ))}
          </Group>
        ) : null}
        {eventTeam.length ? (
          <Group title="Event team" n={eventTeam.length}>
            {eventTeam.map((m) => (
              <Row key={m.memberId} href={`/person/${m.userId}`} title={m.name} sub={[m.isArtist ? "Artist" : "User", m.city].filter(Boolean).join(" · ")} photo={photoUrl(m.photoPath)} />
            ))}
          </Group>
        ) : null}

        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span style={{ ...TYPE.shelf, color: INK }}>Events</span>
            <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{events.length}</span>
          </div>
          {events.length ? events.map((e) => <EventCard key={e.id} event={e} href={`/e/${e.shareSlug}`} host={host} />) : <div style={{ fontSize: 11.5, color: MUTED, padding: "6px 2px" }}>Nothing coming up.</div>}
        </div>
      </div>
    </div>
  );
}
