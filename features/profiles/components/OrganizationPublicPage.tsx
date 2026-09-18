import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { EventCard, type EventCardHost } from "@/features/events/components/EventCard";
import { BioBlock } from "@/features/profiles/components/BioBlock";
import { ActionRow, CallButton, LocationButton, MailButton } from "@/features/profiles/components/ContactButtons";
import { FollowToggle } from "@/features/profiles/components/FollowToggle";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { HeroDot, IdentityHero } from "@/features/profiles/components/hero-kit";
import { Group, Row, TYPE, gradientOf } from "@/features/profiles/components/profile-kit";
import { DOS_TINT, DOS_UI, INK, LILAC, MUTED } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { PublicOrganization, PublicOrganizationStudio } from "@/repositories/publicOrganization";
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
 *  ⚠ THE USER ASKED FOR "OWNER — one of the users added from team in
 *  organizations" here, and it is NOT built: an organization is ONE LOGIN
 *  (8 Sep 2026) with no team table behind it, so there is no user to name.
 *  Backlog row; the Studios group stands where the Owner would.
 *
 *  Not in search's People (R9, R11 stand); its `profiles` row stays private
 *  (R12). Readable signed out. */

const monthYear = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

export function OrganizationPublicPage({
  org,
  studios,
  events,
  header = [],
  isMe = false,
  following = false,
  canFollow = true,
  signedIn = false,
}: {
  org: PublicOrganization;
  studios: PublicOrganizationStudio[];
  events: DanceEvent[];
  /** THE HEADER PICTURES (19 Sep 2026): up to ten, the organization's own */
  header?: HeaderPhoto[];
  /** the organization looking at its own page: no Follow, no Enquiry */
  isMe?: boolean;
  following?: boolean;
  /** false for an organization viewer — one follows nothing */
  canFollow?: boolean;
  signedIn?: boolean;
}) {
  const grad = gradientOf(org.name);
  const tint = DOS_TINT.org;
  const host: EventCardHost = { name: org.name, photo: photoUrl(org.photoPath), href: null };
  const shots: HeroShot[] = header.filter((h) => h.url).map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${org.name}`, signed: h.signed }));
  /* an organization is asked through its hosting row (R15) — a celebration, a corporate show, a collaboration */
  const canAsk = !isMe && Boolean(org.hostBusinessId) && enquiryTypesFor("org").length > 0;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        <IdentityHero
          testId="org-hero"
          name={org.name}
          grad={grad}
          tint={tint}
          eyebrow="Organization"
          verified={org.verified}
          share={<ProfileShare path={`/org/${org.id}`} name={org.name} />}
          /* STATS IS THE CHIP UNDER THE QR (19 Sep 2026): the organization's own
             combined board, or — for a visitor — the studios' board its studios stand on */
          stats={<StatsChip href={isMe ? "/business/stats" : "/stats?tab=charts&seg=studio"} />}
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
          styleAria={(s) => s}
          avatar={photoUrl(org.photoPath)}
          avatarAlt={`${org.name} — logo`}
          shots={shots}
        />

        {/* ── FOLLOW · FOLLOWING, first under the hero (19 Sep 2026) ── */}
        {!isMe && canFollow ? (
          <div style={{ marginTop: 12 }}>
            <FollowToggle target={{ kind: "person", id: org.id }} initialFollowing={following} accent={tint} signedIn={signedIn} />
          </div>
        ) : null}

        {/* ── THE BIO: About as prose, then the links ── */}
        <BioBlock about={org.about} links={org.socials} accent={tint} />

        {/* ── THE BUTTONS AN ORGANIZATION'S PAGE CARRIES (19 Sep 2026): Enquiry · Call · Mail · Location ── */}
        <ActionRow>
          {canAsk ? <EnquiryButton tenantId={org.hostBusinessId as string} tenantName={org.name} tenantType="org" signedIn={signedIn} accent={tint} /> : null}
          {org.phone ? <CallButton phone={org.phone} /> : null}
          {org.contactEmail ? <MailButton email={org.contactEmail} /> : null}
          {org.city ? <LocationButton query={`${org.name} ${org.city}`} /> : null}
        </ActionRow>

        {/* ── THE ASSOCIATIONS: the studios it runs, then the events it hosts ── */}
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
