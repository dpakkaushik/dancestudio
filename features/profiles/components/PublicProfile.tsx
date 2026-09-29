import Link from "next/link";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { ReportButton } from "@/features/reports/components/ReportButton";
import { DOS_UI, GOLD, INK, LILAC, MUTED } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import { enquiryTypesFor } from "@/types/enquiry";
import type { BusinessFollower } from "@/types/follow";
import type { PublicTeamMember, PublicBusinessProfile } from "@/types/publicProfile";
import { ActionRow, CallButton, LocationButton, MailButton, MessageButton, mapsPinHref, whatsappHrefOf } from "./ContactButtons";
import { MembershipsOnSale } from "@/features/memberships/components/MembershipsOnSale";
import type { MembershipOnSale as MembershipOnSaleRow } from "@/repositories/memberships";
import { FollowToggle } from "./FollowToggle";
import { EntityBand, Figure } from "./profile-band";
import { FollowerFigure } from "./FollowerFigure";
import type { HeroShot } from "./HeroRail";
import { ProfileLink, ProfileShare } from "./ProfileShare";
import { StatsChip } from "./StatsChip";
import { memberNoWords } from "@/types/profile";
import { HeroDot, HeroId, HeroPlace, IdentityHero } from "./hero-kit";
import { PROFILE_RING, PeopleGroup, PersonChip, SchedIcon, bigWhite, smallBox } from "./profile-kit";

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
  followingN = null,
  isMember,
  scheduleHref,
  manageHref,
  memberships = [],
}: {
  profile: PublicBusinessProfile;
  /** THE HEADER PICTURES (15 Sep 2026): a studio's photos of its space —
   *  whatever `business_header_photos` let this viewer see */
  header?: HeaderPhoto[];
  /** this page's own path — what the QR shares */
  path: string;
  following: boolean;
  signedIn: boolean;
  /** WHAT THIS STUDIO FOLLOWS — which is what the ACCOUNT THAT OWNS IT follows
   *  (20 Sep 2026). A studio is a `businesses` row and `follows.follower_id`
   *  references `profiles`, so a studio has nothing to follow with; null when
   *  the owner's counts are not this viewer's to read, and the figure is then
   *  not drawn at all rather than printed as a zero. */
  followingN?: number | null;
  /** the viewer belongs to this business: no Follow, a Manage door instead */
  isMember: boolean;
  /** ⚠ `canEditPhoto` and `ownerId` are GONE (20 Sep 2026). A studio's pictures
   *  are changed on the studio's OWN HOME now — the ⊕ on the disc and the ⊕ on
   *  the posters rail, where a person's have been since 19 Sep — so this page
   *  neither offers them nor needs to know who may write them. */
  /** ⚠ `canEdit` AND `followers` ARE GONE (27 Sep 2026). They existed only for
   *  the owner-only "Followers ›" button in the member row, which the figure
   *  above now replaces for everybody — so the page no longer asks who is
   *  looking, and the route no longer reads a list on every visit to hand it
   *  one control. The sheet reads its own rows on the press. */
  canEdit?: boolean;
  followers?: BusinessFollower[] | null;
  scheduleHref: string;
  manageHref: string;
  /** what this business has ON SALE (19 Sep 2026) — live ones of a listed business */
  memberships?: MembershipOnSaleRow[];
}) {
  const { business } = profile;
  /* ⚠ THE KIND'S OWN COLOUR, NOT A HASH OF THE NAME (20 Sep 2026, the user:
     "Profile Type Colors … Studio: Gold"). This was `gradientOf(business.name)`,
     so two studios of one organization came out two unrelated colours. A studio
     is gold; an artist page read through this component is silver, like the
     person whose face it is. */
  const RG = PROFILE_RING[business.type === "studio" ? "studio" : "artist"];
  const RC = RG[1];
  const place = [business.area, business.city].filter(Boolean).join(", ");
  const face = photoUrl(business.photoPath);
  const shots: HeroShot[] = header
    .filter((h) => h.url)
    .map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${business.name}`, signed: h.signed }));
  /* the seats a studio's page names (19 Sep 2026: "Owner, Faculty, Visiting
     Faculty"), and since 20 Sep the ASSISTANTS — the user's list E. A `staff`
     seat is still never named: a front-desk job is not a public association. */
  const owners = profile.team.filter((m) => m.role === "owner");
  const faculty = profile.team.filter((m) => m.role === "trainer");
  const visiting = profile.team.filter((m) => m.role === "visiting_faculty");
  const assistants = profile.team.filter((m) => m.role === "assistant");
  /** ⚠⚠ EVERY TEAM ROW OPENS A PERSON (27 Sep 2026, the user: *"all profiles
   *  should only showcase according to how the team sections are managed … and
   *  their associations linked properly"*).
   *
   *  This read `m.isOrg ? \`/org/${m.userId}\` : …`, and that link was BROKEN in
   *  two ways at once. `m.userId` is a `profiles` id, while `/org/{id}` has
   *  taken a BUSINESS id since 26 Sep — so the href pointed at a page that
   *  resolves by a different key and answered `notFound()`. And `isOrg` is
   *  computed as `profiles.role = 'org'`, a role the same migration RETIRED, so
   *  the branch is false for everything created since and true only for a
   *  surviving legacy row — which is exactly the row it 404s on.
   *
   *  A studio's owner is a PERSON now, always, so there is one destination. */
  /* ⚠ THE ROLE IS THE `right` WORD, NOT THE `sub` (27 Sep 2026) — the slot a
     person's own page and an organization's have always used for it. `sub` is
     where somebody IS, so it carries the business's own place here, the way a
     city does on every other Row in the app. */
  /** ⚠ A CHIP, NOT A ROW (27 Sep 2026) — `PersonChip`'s own note has the whole
   *  reason. The `sub` this used to carry was the STUDIO's place repeated under
   *  every name, which said nothing about the person; the role takes that slot
   *  now, which is what the user asked to see beside a name. */
  const teamChip = (m: PublicTeamMember, word: string) => (
    <PersonChip key={m.userId} href={`/person/${m.userId}`} name={m.name} role={word} roleColour={RC} photo={photoUrl(m.photoPath)} />
  );
  /* ⚠ DRAWN FOR THE TEAM TOO, AND DISABLED (20 Sep 2026, the user: "Viewing your
     own profile should show same buttons which you see on discover it should
     look the same way"). `ActionRow` is a grid sized by its cell count, so
     dropping this button for a member did not merely hide it — it re-laid out
     Call, Mail and Location beside it, and the studio page a team member opened
     from their own home was a different shape from the one a visitor opened
     from Discover. Same treatment the Follow bell already gets. */
  const asksGoHere = enquiryTypesFor(business.type).length > 0;
  const canAsk = !isMember && asksGoHere;
  /* the Location button is the studio's own pin once the owner has placed it
     (19 Sep 2026); until then the centroid is nobody's address, so Maps is asked
     by name and place */
  const pinHref = business.locationSetAt && business.lat != null && business.lng != null ? mapsPinHref(business.lat, business.lng) : null;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        {/* ── the profile, lit like a player — the one hero every profile page wears ── */}
        <IdentityHero
          testId="public-hero"
          name={business.name}
          grad={RG}
          eyebrow={business.type === "studio" ? "Studio" : "Artist"}
          eyebrowSub={business.memberNo ? <HeroId>{memberNoWords(business.memberNo)}</HeroId> : null}
          /* the tick is DanceOS's to give — set when a verification actually clears (DosVerified 10592) */
          verified={Boolean(business.verifiedAt)}
          meta={
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: INK }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                </svg>
                {business.foundedYear ? `Since ${business.foundedYear}` : `On DanceOS since ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(business.createdAt))}`}
              </span>
              {place ? (
                <>
                  <HeroDot />
                  <HeroPlace text={place} query={`${business.name} ${place}`} />
                </>
              ) : null}
            </>
          }
          /* ⚠ THE BAND DRAWS THE STYLES, so the hero is passed none (20 Sep 2026).
             `IdentityHero` renders its own `styles` prop BEFORE `children`, and
             the order every profile screen keeps is figures → styles → links. */
          styles={[]}
          avatar={face}
          avatarAlt={business.name}
          shots={shots}
          /* ⚠ NO CORNER ON A PROFILE PAGE (21 Sep 2026) — see `PublicPersonPage`
             for the loop this cuts; a studio's ran home → eye → here → "Manage
             this studio" → home. ⚠ Nothing is lost: the member's own door to the
             desk is the "You are on this team · Manage ›" box further down, which
             says what it is instead of being a glyph in a corner. */
        >
          {/* ── THE SAME BAND HOME WEARS (20 Sep 2026, the user: "Upper layer of
              Home tab to exactly the same used for profile pages for all kinds of
              profiles"). Figures, then styles, then links — inside the hero, so it
              sits on the hero's own wash rather than the plain page under it,
              which is what made Home and the Profile tab read as one screen. ── */}
          <EntityBand
            figures={
              <>
                <FollowerFigure n={profile.followers} kind="business" id={business.id} name={business.name} testId="business-followers" />
                {/* ⚠ THE SECOND FIGURE IS THE OWNER'S (20 Sep 2026, the user:
                    "Organization and Studio still dont have Following section in
                    profile and home"). A studio cannot follow — see the prop's
                    own note — so what is counted here is what the account that
                    RUNS it follows, and the Owner group further down the page is
                    who that is. Null reads as no figure, never as 0. */}
                <Figure n={followingN} label="Following" testId="business-following" />
              </>
            }
            /* ⚠ THE THREE CHIPS (20 Sep 2026, the user: "Follow button to be a
               bell with qr code and stats … in same row as follower following
               numbers on its right side"). The QR shares the page; Stats opens
               the studios' board this one is ranked on (19 Sep); the BELL is the
               Follow that used to be a pill under the hero — and it is drawn for
               EVERY viewer now ("should be available to all"), saying why when
               the database would refuse the press rather than vanishing. */
            /* FOLLOW · STATS · QR · SHARE (21 Sep 2026, the user's own order) */
            chips={
              <>
                {/* ⚠ NOT DRAWN FOR THE TEAM — this is their own studio, and a
                    control that exists only to be disabled is noise. Every other
                    visitor gets a live bell: an organization account may follow
                    since `20260920180000_an_organization_follows`, so the one
                    reason it used to be drawn DISABLED has gone. */}
                {isMember ? null : (
                  <FollowToggle
                    target={{ kind: "business", id: business.id }}
                    initialFollowing={following}
                    initialFollowers={profile.followers}
                    accent={RC}
                    signedIn={signedIn}
                  />
                )}
                <StatsChip href={`/studio/${business.id}/stats`} />
                <ProfileShare path={path} name={business.name} />
                <ProfileLink path={path} name={business.name} />
              </>
            }
            styles={profile.styles}
            styleAria={(s) => `${s} — a style this business teaches`}
            socials={business.socials}
          />
        </IdentityHero>

        {/* ── a business with nothing published yet says so where the styles would be ── */}
        {profile.styles.length === 0 ? <div style={{ fontSize: 12, color: MUTED, padding: "12px 0 0" }}>No published classes yet.</div> : null}

        {/* ⚠ NO BIO (20 Sep 2026, the user: "Remove bio from all profiles"). The
            About paragraph is off every profile in the app; the links it used to
            carry are the band's links row, inside the hero above. */}

        {/* ── THE TEAM'S OWN ROW — the door to the desk, the owner's Followers and
            Edit beside it. ⚠ FOLLOW IS NOT HERE ANY MORE (20 Sep 2026): it is the
            bell in the figures row above, so this block draws only for the team
            and a visitor goes straight to the buttons. ── */}
        {/* ⚠⚠ NO EDIT CELL IN THIS ROW ANY MORE (22 Sep 2026, the user: "studio
            edit profile should be in settings"). A studio had TWO doors to its
            own form — this one and the pencil on its home's corner — while a
            person has had exactly one since C22, whose words were "all edit
            profile options to be removed from home AND PROFILE PAGES". Both are
            gone; Settings' THIS STUDIO block is the door. */}
        {/* ⚠ THE OWNER'S "Followers ›" BUTTON IS GONE (27 Sep 2026, the user:
            *"fix follow following for all profiles. list should open when
            clicked from anywhere"*). It was a second control for the one list,
            visible to the owner alone, in a row about something else — while
            the FIGURE two lines above it, which everybody sees, was a dead
            number. The figure is the door now, on this page and on the six
            others that had neither. `BusinessFollowersButton` is deleted rather
            than left standing: this repo has paid twice for a component
            nothing renders. */}
        {isMember ? (
          <div style={{ marginTop: 12 }}>
            <Link href={manageHref} style={smallBox(false, RC)}>
              You are on this team · Manage ›
            </Link>
          </div>
        ) : null}

        {/* ── THE BUTTONS A STUDIO'S PAGE CARRIES (19 Sep 2026): Enquiry · Call · Mail ·
            Location — ONE BLOCK with Follow above them (the user, later that day:
            "all buttons placed together properly"); the Bio follows the block ── */}
        {/* ⚠ THE DEFAULT for a visitor, whose row follows the hero directly —
            −6 since 27 Sep 2026, landing it 8px under the links, which is the
            band's own step (`ActionRow` carries the measurement). 6 for the
            team, whose row follows the strip above instead. */}
        <ActionRow marginTop={isMember ? 6 : undefined}>
          {asksGoHere ? (
            <EnquiryButton
              businessId={business.id}
              businessName={business.name}
              businessType={business.type}
              signedIn={signedIn}
              accent={RC}
              enquiryTypes={business.enquiryTypes}
              cannotAsk={canAsk ? null : "You are on this team — enquiries come to you here"}
            />
          ) : null}
          {business.phone ? <CallButton phone={business.phone} /> : null}
          {business.contactEmail ? <MailButton email={business.contactEmail} /> : null}
          {whatsappHrefOf(business.socials) ? <MessageButton href={whatsappHrefOf(business.socials) as string} /> : null}
          {pinHref ? <LocationButton href={pinHref} /> : place ? <LocationButton query={`${business.name} ${place}`} /> : null}
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
        <MembershipsOnSale memberships={memberships} businessName={business.name} accent={RC} signedIn={signedIn} canBuy={!isMember} />

        {/* ── THE TEAM, A SECTION PER ROLE (11000-11060; re-cut 27 Sep 2026 to
            the user's *"Studio, Crew and Organization — simply should show the
            Team with position … all roles should have a seprate section
            according to profile"*). The grouping is what it always was; what
            changed is the row: a person is a CHIP with their position beside
            them, two to a line, so a studio with nine people is a block you can
            read rather than nine full-width rows. ── */}
        {owners.length ? <PeopleGroup title="Owner" n={owners.length}>{owners.map((m) => teamChip(m, m.isOrg ? "Organization" : "Owner"))}</PeopleGroup> : null}
        {faculty.length ? <PeopleGroup title="Faculty" n={faculty.length}>{faculty.map((m) => teamChip(m, "Faculty"))}</PeopleGroup> : null}
        {visiting.length ? <PeopleGroup title="Visiting faculty" n={visiting.length}>{visiting.map((m) => teamChip(m, "Visiting faculty"))}</PeopleGroup> : null}
        {assistants.length ? <PeopleGroup title="Assistants" n={assistants.length}>{assistants.map((m) => teamChip(m, "Assistant"))}</PeopleGroup> : null}
      </div>
      {/* the quiet control at the foot of a public page (10 Sep 2026) — not for
          its own members, who have the hub for anything that is wrong */}
      {isMember ? null : <ReportButton subjectKind="business" subjectId={business.id} subjectName={business.name} signedIn={signedIn} />}
    </div>
  );
}
