import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { EventCard, type EventCardHost } from "@/features/events/components/EventCard";
import { EntityBand, Figure } from "@/features/profiles/components/profile-band";
import { ActionRow, CallButton, LocationButton, MailButton, mapsPinHref } from "@/features/profiles/components/ContactButtons";
import { FollowToggle } from "@/features/profiles/components/FollowToggle";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { ProfileLink, ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { HeroDot, HeroId, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { Group, PROFILE_RING, Row, TYPE } from "@/features/profiles/components/profile-kit";
import { DOS_UI, INK, LILAC, MUTED } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { PublicOrganization, PublicOrganizationStudio, PublicOrganizationTeamMember } from "@/repositories/publicOrganization";
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
 *  Not in search's People (R9, R11 stand); its `profiles` row stays private
 *  (R12). Readable signed out. */

const monthYear = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

export function OrganizationPublicPage({
  org,
  studios,
  events,
  team = [],
  header = [],
  isMe = false,
  following = false,
  followers = null,
  followingN = null,
  signedIn = false,
}: {
  org: PublicOrganization;
  studios: PublicOrganizationStudio[];
  events: DanceEvent[];
  /** THE TEAM (push 2): the confirmed people it named — owners first */
  team?: PublicOrganizationTeamMember[];
  /** THE HEADER PICTURES (19 Sep 2026): up to ten, the organization's own */
  header?: HeaderPhoto[];
  /** the organization looking at its own page: no Follow, no Enquiry */
  isMe?: boolean;
  following?: boolean;
  /** the live follower count, printed on the Follow button (19 Sep 2026, later) */
  followers?: number | null;
  /** and how many it follows (20 Sep 2026) — the second figure every other
   *  profile has had, and the one the user asked for by name */
  followingN?: number | null;
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
  const asksGoHere = Boolean(org.hostBusinessId) && enquiryTypesFor("org").length > 0;
  const canAsk = !isMe && asksGoHere;
  /* ⚠ THREE PUBLISHED LABELS SINCE 20 Sep 2026 (the user's list A): Owner,
     Studio owner — which names the studio it owns — and Event team. The definer
     read leaves a plain `member` out, so there is no fourth group to draw. */
  const owners = team.filter((m) => m.role === "owner");
  const studioOwners = team.filter((m) => m.role === "studio_owner");
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
              <HeroDot />
              <span>
                {studios.length} studio{studios.length === 1 ? "" : "s"}
              </span>
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
                {/* ⚠ AND WHAT IT FOLLOWS (20 Sep 2026, the user: "Organization and
                    Studio still dont have Following section in profile and home").
                    An organization follows since
                    `20260920180000_an_organization_follows`, so this is a real
                    count rather than a zero that could never move. */}
                <Figure n={followingN} label="Following" />
              </>
            }
            /* the three chips (20 Sep 2026) — the QR, the organization's own
               combined board (or, for a visitor, where each of its studios ranks),
               and the Follow bell, drawn for every viewer */
            /* FOLLOW · STATS · QR · SHARE (21 Sep 2026, the user's own order) */
            chips={
              <>
                {/* not drawn on your own page — you do not follow yourself */}
                {isMe ? null : (
                  <FollowToggle
                    target={{ kind: "person", id: org.id }}
                    initialFollowing={following}
                    initialFollowers={followers}
                    accent={tint}
                    signedIn={signedIn}
                    variant="chip"
                  />
                )}
                <StatsChip href={isMe ? "/business/stats" : `/org/${org.id}/stats`} />
                <ProfileShare path={`/org/${org.id}`} name={org.name} />
                <ProfileLink path={`/org/${org.id}`} name={org.name} />
              </>
            }
            socials={org.socials}
          />
        </IdentityHero>

        {/* ── THE BUTTONS AN ORGANIZATION'S PAGE CARRIES (19 Sep 2026): Enquiry · Call ·
            Mail · Location — one block; Follow is the bell in the row above ── */}
        <ActionRow marginTop={12}>
          {asksGoHere ? (
            <EnquiryButton
              tenantId={org.hostBusinessId as string}
              tenantName={org.name}
              tenantType="org"
              signedIn={signedIn}
              accent={tint}
              cannotAsk={canAsk ? null : "This is your own page — enquiries come to you here"}
            />
          ) : null}
          {org.phone ? <CallButton phone={org.phone} /> : null}
          {org.contactEmail ? <MailButton email={org.contactEmail} /> : null}
          {pinHref ? <LocationButton href={pinHref} /> : org.city ? <LocationButton query={`${org.name} ${org.city}`} /> : null}
        </ActionRow>

        {/* ── THE ASSOCIATIONS (push 2: "Organization: Owner (one of the users added
            from team), list of studios they run"): Owner · Team · Studios · Events ── */}
        {owners.length ? (
          <Group title="Owner" n={owners.length}>
            {owners.map((m) => (
              <Row key={m.memberId} href={`/person/${m.userId}`} title={m.name} sub={[m.isArtist ? "Artist" : "User", m.city].filter(Boolean).join(" · ")} photo={photoUrl(m.photoPath)} right="Owner" />
            ))}
          </Group>
        ) : null}
        {studioOwners.length ? (
          <Group title="Studio owners" n={studioOwners.length}>
            {studioOwners.map((m) => (
              /* the studio is the fact here, so it is the sub-line — and it is a
                 real seat on that studio, not a word (20 Sep 2026) */
              <Row key={m.memberId} href={`/person/${m.userId}`} title={m.name} sub={[m.businessName, m.city].filter(Boolean).join(" · ")} photo={photoUrl(m.photoPath)} right="Studio owner" />
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
        <Group title="Studios" n={studios.length}>
          {studios.length ? (
            studios.map((s) => <Row key={s.id} href={`/studio/${s.id}`} title={s.name} sub={[s.area, s.city].filter(Boolean).join(", ") || "Studio"} photo={photoUrl(s.photoPath)} right={s.verifiedAt ? "Verified" : undefined} />)
          ) : (
            <div style={{ fontSize: 11.5, color: MUTED, padding: "10px 0" }}>No studio on Discover yet.</div>
          )}
        </Group>

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
