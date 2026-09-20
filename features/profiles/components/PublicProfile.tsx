import Link from "next/link";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { ReportButton } from "@/features/reports/components/ReportButton";
import { DOS_UI, GOLD, INK, LILAC, MUTED } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import { enquiryTypesFor } from "@/types/enquiry";
import type { TenantFollower } from "@/types/follow";
import type { PublicTeamMember, PublicTenantProfile } from "@/types/publicProfile";
import { BusinessEditButton } from "./BusinessEditSheet";
import { ActionRow, CallButton, LocationButton, MailButton, mapsPinHref } from "./ContactButtons";
import { MembershipsOnSale } from "@/features/memberships/components/MembershipsOnSale";
import type { MembershipOnSale as MembershipOnSaleRow } from "@/repositories/memberships";
import { FollowToggle } from "./FollowToggle";
import { EntityBand, Figure } from "./profile-band";
import type { HeroShot } from "./HeroRail";
import { ProfileShare } from "./ProfileShare";
import { StatsChip } from "./StatsChip";
import { TenantFollowersButton } from "./TenantFollowersButton";
import { memberNoWords } from "@/types/profile";
import { HeroDot, HeroId, HeroPlace, IdentityHero } from "./hero-kit";
import { Group, Row, SchedIcon, bigWhite, gradientOf, smallBox } from "./profile-kit";

/** A STUDIO'S PUBLIC PAGE, lifted from prototype S_profiletab with
 *  `publicEntity="studio"` (10565-11060): THE PROFILE, LIT LIKE A PLAYER — the
 *  entity's colour bleeding off the top and dying into the page, the role over
 *  the name, the QR beside it, the place under it; then what a visitor came for.
 *
 *  RE-CUT 19 Sep 2026 TO THE USER'S LIST, page by page. The order under the hero
 *  is the same on every public page now — an organization's, a studio's, an
 *  artist's, a crew's, a user's — and it is this: **Follow · Following** (one
 *  toggle, no count), the **Bio** (About and the links), the **buttons** this
 *  kind of page carries — a studio's are Enquiry · Call · Mail · Location —
 *  then **Schedule**, then the **associations** — a studio's are its Owner, its
 *  Faculty and its Visiting Faculty. And NO FIGURES ANYWHERE ("remove all kinds
 *  of stats from profile page"): the Followers count that used to sit under the
 *  name is gone, and Stats is the chip beside the QR, opening the studios'
 *  board. The owner's "who follows you" (B6) is a small button in the member
 *  row, not a figure made pressable.
 *
 *  THE HERO IS THE ONE EVERY PROFILE PAGE WEARS (15 Sep 2026): `IdentityHero`
 *  draws the HEADER — a studio's photos of its space, up to ten — and the round
 *  DISC with the studio's picture.
 *
 *  ⚠ This component serves a STUDIO. An artist page's public face has been the
 *  artist's own profile since 18 Sep 2026 (/artist/{id} redirects there), so
 *  the `type` fork below only decides a word. */

export function PublicProfile({
  profile,
  header = [],
  path,
  following,
  signedIn,
  canFollow = true,
  isMember,
  canEditPhoto = false,
  canEdit = false,
  ownerId = null,
  followers = null,
  scheduleHref,
  manageHref,
  memberships = [],
}: {
  profile: PublicTenantProfile;
  /** THE HEADER PICTURES (15 Sep 2026): a studio's photos of its space —
   *  whatever `business_header_photos` let this viewer see */
  header?: HeaderPhoto[];
  /** this page's own path — what the QR shares */
  path: string;
  following: boolean;
  signedIn: boolean;
  /** false for an organization viewer — one follows nothing (8 Sep 2026) */
  canFollow?: boolean;
  /** the viewer belongs to this business: no Follow, a Manage door instead */
  isMember: boolean;
  /** an owner or trainer — the pair that may change the business's photo. The
   *  control is inside the Edit sheet since 16 Sep 2026, never on the hero */
  canEditPhoto?: boolean;
  /** the owner — the one who edits the pictures, About, Since, the number, the
   *  email and the links (10613) */
  canEdit?: boolean;
  /** the owner's own id when the VIEWER is the owner — the folder in the
   *  private bucket a new header picture goes into; null for everybody else */
  ownerId?: string | null;
  /** the owner's list — null for everybody else, and nothing is drawn (B6) */
  followers?: TenantFollower[] | null;
  scheduleHref: string;
  manageHref: string;
  /** what this business has ON SALE (19 Sep 2026) — live ones of a listed business */
  memberships?: MembershipOnSaleRow[];
}) {
  const { tenant } = profile;
  const RG = gradientOf(tenant.name);
  const RC = RG[1];
  const place = [tenant.area, tenant.city].filter(Boolean).join(", ");
  const face = photoUrl(tenant.photoPath);
  const shots: HeroShot[] = header
    .filter((h) => h.url)
    .map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${tenant.name}`, signed: h.signed }));
  /* the seats a studio's page names (19 Sep 2026: "Owner, Faculty, Visiting
     Faculty"), and since 20 Sep the ASSISTANTS — the user's list E. A `staff`
     seat is still never named: a front-desk job is not a public association. */
  const owners = profile.team.filter((m) => m.role === "owner");
  const faculty = profile.team.filter((m) => m.role === "trainer");
  const visiting = profile.team.filter((m) => m.role === "visiting_faculty");
  const assistants = profile.team.filter((m) => m.role === "assistant");
  /* the owner is an organization more often than not — its row opens the organization's page */
  const teamRow = (m: PublicTeamMember, sub: string) => <Row key={m.userId} href={m.isOrg ? `/org/${m.userId}` : `/person/${m.userId}`} title={m.name} sub={sub} photo={photoUrl(m.photoPath)} />;
  const canAsk = !isMember && enquiryTypesFor(tenant.type).length > 0;
  /* the Location button is the studio's own pin once the owner has placed it
     (19 Sep 2026); until then the centroid is nobody's address, so Maps is asked
     by name and place */
  const pinHref = tenant.locationSetAt && tenant.lat != null && tenant.lng != null ? mapsPinHref(tenant.lat, tenant.lng) : null;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        {/* ── the profile, lit like a player — the one hero every profile page wears ── */}
        <IdentityHero
          testId="public-hero"
          name={tenant.name}
          grad={RG}
          tint={RC}
          eyebrow={tenant.type === "studio" ? "Studio" : "Artist"}
          eyebrowSub={tenant.memberNo ? <HeroId>{memberNoWords(tenant.memberNo)}</HeroId> : null}
          /* the tick is DanceOS's to give — set when a verification actually clears (DosVerified 10592) */
          verified={Boolean(tenant.verifiedAt)}
          share={<ProfileShare path={path} name={tenant.name} />}
          /* STATS IS THE CHIP UNDER THE QR (19 Sep 2026, the user: "give Stats
             button same as home page on profile") — a studio's is the studios'
             board, where this one is ranked */
          /* since push 2 (19 Sep 2026): THIS studio's figures and its place on the studio board */
          stats={<StatsChip href={`/studio/${tenant.id}/stats`} />}
          meta={
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: INK }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                </svg>
                {tenant.foundedYear ? `Since ${tenant.foundedYear}` : `On DanceOS since ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(tenant.createdAt))}`}
              </span>
              {place ? (
                <>
                  <HeroDot />
                  <HeroPlace text={place} query={`${tenant.name} ${place}`} />
                </>
              ) : null}
            </>
          }
          /* ⚠ THE BAND DRAWS THE STYLES, so the hero is passed none (20 Sep 2026).
             `IdentityHero` renders its own `styles` prop BEFORE `children`, and
             the order every profile screen keeps is figures → styles → links. */
          styles={[]}
          avatar={face}
          avatarAlt={tenant.name}
          shots={shots}
        >
          {/* ── THE SAME BAND HOME WEARS (20 Sep 2026, the user: "Upper layer of
              Home tab to exactly the same used for profile pages for all kinds of
              profiles"). Figures, then styles, then links — inside the hero, so it
              sits on the hero's own wash rather than the plain page under it,
              which is what made Home and the Profile tab read as one screen. ── */}
          <EntityBand
            figures={<Figure n={profile.followers} label={profile.followers === 1 ? "Follower" : "Followers"} testId="tenant-followers" />}
            styles={profile.styles}
            styleAria={(s) => `${s} — a style this business teaches`}
            socials={tenant.socials}
          />
        </IdentityHero>

        {/* ── a business with nothing published yet says so where the styles would be ── */}
        {profile.styles.length === 0 ? <div style={{ fontSize: 12, color: MUTED, padding: "12px 0 0" }}>No published classes yet.</div> : null}

        {/* ⚠ NO BIO (20 Sep 2026, the user: "Remove bio from all profiles"). The
            About paragraph is off every profile in the app; the links it used to
            carry are the band's links row, inside the hero above. */}

        {/* ── FOLLOW · FOLLOWING, first under the hero (19 Sep 2026) — or, for the
            team, the door to the desk; the owner's Followers and Edit beside it ── */}
        <div style={{ marginTop: 12 }}>
          {isMember ? (
            <div style={{ display: "grid", gridTemplateColumns: canEdit ? "2fr 1fr 1fr" : "1fr", gap: 6 }}>
              <Link href={manageHref} style={smallBox(false, RC)}>
                You are on this team · Manage ›
              </Link>
              {canEdit && followers ? <TenantFollowersButton followers={followers} accent={RC} /> : null}
              {canEdit ? <BusinessEditButton tenant={tenant} photos={header} ownerId={ownerId} canEditPhoto={canEditPhoto} /> : null}
            </div>
          ) : canFollow ? (
            <FollowToggle target={{ kind: "business", id: tenant.id }} initialFollowing={following} initialFollowers={profile.followers} accent={RC} signedIn={signedIn} />
          ) : null}
        </div>

        {/* ── THE BUTTONS A STUDIO'S PAGE CARRIES (19 Sep 2026): Enquiry · Call · Mail ·
            Location — ONE BLOCK with Follow above them (the user, later that day:
            "all buttons placed together properly"); the Bio follows the block ── */}
        <ActionRow marginTop={6}>
          {canAsk ? <EnquiryButton tenantId={tenant.id} tenantName={tenant.name} tenantType={tenant.type} signedIn={signedIn} accent={RC} enquiryTypes={tenant.enquiryTypes} /> : null}
          {tenant.phone ? <CallButton phone={tenant.phone} /> : null}
          {tenant.contactEmail ? <MailButton email={tenant.contactEmail} /> : null}
          {pinHref ? <LocationButton href={pinHref} /> : place ? <LocationButton query={`${tenant.name} ${place}`} /> : null}
        </ActionRow>

        {/* ── THE ONE WHITE BAR THE PAGE IS FOR (10919): the schedule ── */}
        <div style={{ marginTop: 8 }}>
          <Link href={scheduleHref} aria-label="Schedule" style={bigWhite}>
            <SchedIcon />
            Schedule
          </Link>
        </div>

        {/* ── WHAT IT SELLS (19 Sep 2026, the user: "Users should be able to buy
            from Studio and Artist Profile Pages") — a price on a public page is
            public; who holds one never is ── */}
        <MembershipsOnSale memberships={memberships} businessName={tenant.name} accent={RC} signedIn={signedIn} canBuy={!isMember} />

        {/* ── THE ASSOCIATIONS, in one language (11000-11060): a row per person,
            each group headed with a count — Owner · Faculty · Visiting faculty ── */}
        {owners.length ? <Group title="Owner" n={owners.length}>{owners.map((m) => teamRow(m, m.isOrg ? "Organization" : "Owner"))}</Group> : null}
        {faculty.length ? <Group title="Faculty" n={faculty.length}>{faculty.map((m) => teamRow(m, "Faculty"))}</Group> : null}
        {visiting.length ? <Group title="Visiting faculty" n={visiting.length}>{visiting.map((m) => teamRow(m, "Visiting faculty"))}</Group> : null}
        {assistants.length ? <Group title="Assistants" n={assistants.length}>{assistants.map((m) => teamRow(m, "Assistant"))}</Group> : null}
      </div>
      {/* the quiet control at the foot of a public page (10 Sep 2026) — not for
          its own members, who have the hub for anything that is wrong */}
      {isMember ? null : <ReportButton subjectKind="business" subjectId={tenant.id} subjectName={tenant.name} signedIn={signedIn} />}
    </div>
  );
}
