import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { findMyDeck } from "@/repositories/home";
import { findMyPendingInvites } from "@/repositories/invites";
import { ensureArtistPage, findMyMemberships } from "@/repositories/tenants";
import { findMyArtistPlan } from "@/repositories/plans";
import { findMyFollowedCrews, findMyFollowedOrganizations, findMyFollowedPeople, findMyFollowing, findMyPersonFollowers } from "@/repositories/follows";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { ProfileLink, ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { amIPlatformAdmin } from "@/repositories/admin";
import { headerMaxFor, photoUrl } from "@/lib/media/photo";
import { CARD, DOS_UI, GOLD, INK, LILAC, SUB } from "@/lib/design/tokens";
import { BizSection } from "@/features/home/components/home-kit";
import { toolsLayoutKey } from "@/features/home/toolOrder";
import { findMyToolOrder } from "@/repositories/layout";
import { TodayShelf } from "@/features/home/components/TodayShelf";
import { HomeBand } from "@/features/profiles/components/HomeBand";
import { HeaderEditButton, PicturesButton } from "@/features/profiles/components/PicturesSheet";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { PersonIcon, ROLE_RING, cornerChip } from "@/features/profiles/components/profile-kit";
import { ActionRow, CallButton, MailButton } from "@/features/profiles/components/ContactButtons";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { HeroId, HeroPlace, IdentityHero } from "@/features/profiles/components/hero-kit";
import { KIND_WORD, heroMetaWords, kindOf, memberNoWords } from "@/types/profile";
import { MEMBER_ROLE_WORD } from "@/types/staff";

/** Home — the dancer dashboard lifted from prototype S_homedancer (DanceOSApp.jsx:7206-7352):
 *  the identity sleeve, the PassDeck of today under
 *  "Today's schedule" (6863-7204 — one swiped rail of the app's own cards, the role chip,
 *  one Live badge, the QR and the invoice on a booked card), and the Artist Tools grid
 *  (BizSection). A studio's Home asks the deck the studio's question — what is running
 *  in its rooms — with its own doors (7022-7060, 7139-7150).
 *
 *  THE SLEEVE IS THE IDENTITY HERO NOW (14 Sep 2026, the user: "make sure all 4
 *  profile pages share common looking user interface and common code base").
 *  The prototype's Home wore an 86px square of initials beside the greeting; the
 *  app's Home wears the profile hero — the same object a studio's own home
 *  stands on. SINCE 15 SEP 2026 THAT IS TWO PICTURES: the HEADER across the
 *  top (a user's one picture, an artist's up to ten with the Add tile at the
 *  end, nothing for an organization) and the round PROFILE DISC over its
 *  bottom-left edge — the face, or the logo.
 *
 *  ⚠ THE EYEBROW SAYS WHAT THIS ACCOUNT IS, NOT WHAT TIME IT IS (18 Sep 2026,
 *  the user: "Good morning to be removed and replaced with User, Artist, Studio,
 *  Organization and should not be repeated below"). It read GOOD MORNING /
 *  AFTERNOON / EVENING off the IST clock, and the word USER · ARTIST ·
 *  ORGANIZATION was then printed AGAIN in display type under the styles — the
 *  greeting said nothing a person needs and the word was said twice. Now the
 *  eyebrow is the word, said once, and the line that repeated it carries only
 *  what it alone had: the account number. (A studio's own home has always said
 *  STUDIO there, which is the fourth word on the user's list.) */
export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }
  const profile = await findProfileById(supabase, user.id);
  if (!profile) {
    /* a platform admin is ADMIN ONLY (9 Sep 2026): no profile, no Home — the queue is its place */
    redirect((await amIPlatformAdmin(supabase)) ? "/admin/verifications" : "/onboarding");
  }

  const now = new Date();
  const nowIso = now.toISOString();

  /* ⚠ `isOrg` IS GONE (26 Sep 2026): the organization LOGIN is retired — every
     profile here is a person's, and an organization is a business they open
     from the Organizations tile, with a Home of its own (`OrgHome`). The reads
     that were the login's alone (`findMyOrgTenantId`, the GST card, the
     standing card) went with it. What is still asked for is what is still
     shown. */
  const [memberships, invites, plan] = await Promise.all([
    /* WITH the role (18 Sep 2026): an artist's grid needs the page they OWN, not
       the first business they belong to — a studio they teach at is not theirs */
    findMyMemberships(supabase),
    // somebody asked you onto their team — matched on the address you sign in
    // with, so an invite arrives here without any link being passed around
    findMyPendingInvites(supabase),
    findMyArtistPlan(supabase),
    /* ⚠ THE SUPPORT-THREADS READ WENT WITH ITS CARD (20 Sep 2026): Settings'
       Help & support tile is that door for every kind of account */
  ]);
  const businesses = memberships.map((m) => m.tenant);
  /* what the sleeve calls you: a person is an artist while the plan is live */
  const isArtist = Boolean(plan?.active);
  const kind = kindOf(profile.role, isArtist);

  /* THE HEADER PICTURES (15 Sep 2026): what swipes across the top. THE KIND
     decides how many, here and in the database (19 Sep 2026, the user's limits):
     a user one, an artist five, an organization ten — and a plan that lapsed
     with five stored still draws one; the rest wait. */
  const headerMax = headerMaxFor(kind);
  /* the page a stranger reads — a person's whether or not they hold the plan (R24) */
  const publicHref = `/person/${profile.id}`;

  /* ⚠ NO RANK ON HOME (19 Sep 2026, the user: "Remove rank from home"). Where
     you stand is the Stats chip's own screen, which prints the place WITH its
     population — the Profile tab lost the same figure earlier the same day
     (row C20), and `findMyPlace` is no longer read for either. */

  /* AN ORGANIZATION'S HOME ASKS NO STUDIO'S QUESTION (17 Sep 2026, the user:
     "organization home tab should not have classes options. classes can only be
     created by users with artist subscription and studios"). Until today an
     organization's deck was its FIRST studio's rooms, with Classes and Calendar
     doors into that studio's register — one studio chosen by accident, and a
     door to creating classes on a screen that is not a studio's. A studio's day
     is asked on the studio's own home (7022-7060, `StudioHome`); here the deck
     is what `findMyDeck` gives an organization — the events it hosts today, and
     nothing a person would have, since an organization books, teaches and
     assists nothing (`guard_person_only`). */
  /* AN UNVERIFIED ORGANIZATION'S HOME IS THE STANDING CARD AND NOTHING ELSE
     (10 Sep 2026, the user's ask). Until DanceOS has said yes it owns no studio
     and cannot make one, so "Today's schedule" is always empty and every Studio
     Tools tile is a door to an empty room — the prototype's own objection to
     offering Manage to somebody who manages nothing (7135). The tab bar is the
     chrome's, so Discover, Inbox and Profile are all still a tap away. */
  /* ⚠ NOTHING IS WITHHELD FROM AN ORGANIZATION ANY MORE (11 Sep 2026). This
     was `isOrg && !profile.verifiedAt`, and it hid the deck and Studio Tools
     from every organization until an admin had looked at it — which was the
     right shape when the ORGANIZATION was what got reviewed. Now a studio is
     reviewed, after it exists, so an organization that has just signed up has
     work to do from its first minute: open a studio, put it on the map, add
     its photos, ask for the badge. It stays a constant so the two folds below
     keep reading as a decision rather than as dead code. */
  const orgAwaitingApproval = false;
  /* EVERY INDEPENDENT READ IN ONE ROUND TRIP (19 Sep 2026, "make app snappier"):
     the header pictures, today's deck, the page provisioned on first render for
     an artist (see below), and — since the figures came to Home the same day —
     the five follow lists behind them. They used to run in sequence, and the
     rank that was here is gone.
     ⚠ AN ORGANIZATION ASKS FOR ALL FOUR NOW (20 Sep 2026, the user:
     "Organization and Studio still dont have Following section in profile and
     home"). They were skipped because R11 made an organization follow nothing;
     `20260920180000_an_organization_follows` lifts that refusal in the three
     doors, so these reads answer with real rows and the figure means something. */
  /* THE GRID FOR THIS KIND OF ACCOUNT (18 Sep 2026, the user's list for all four
     — `tilesFor` in home-kit carries it). An artist's grid opens the desks of the
     page they OWN (Team, Students); a user's and an organization's carry no
     desk of a business at all — a studio's desks are on the studio's own home.
     ⚠ It is worked out HERE rather than beside the grid since 22 Sep 2026,
     because the batch below needs it: the arrangement is keyed by kind. */
  const homeKind = isArtist ? "artist" : "user";
  const [header, deck, pageId, followers, followingPeople, followingTenants, followingOrgs, followingCrews, toolOrder] = await Promise.all([
    findPersonHeaderPhotos(supabase, user.id, headerMax),
    findMyDeck(supabase, user.id, nowIso, businesses),
    !isArtist ? Promise.resolve(null) : ensureArtistPage(supabase, profile, memberships),
    findMyPersonFollowers(supabase).catch(() => []),
    findMyFollowedPeople(supabase).catch(() => []),
    findMyFollowing(supabase).catch(() => []),
    findMyFollowedOrganizations(supabase).catch(() => []),
    findMyFollowedCrews(supabase).catch(() => []),
    /* ⚠ THIS PERSON'S OWN ARRANGEMENT OF THE TOOL GRID (22 Sep 2026). It rides
       the batch that is already being awaited, so Home costs no extra round
       trip for it, and it answers null rather than throwing — a preference must
       never be the reason a Home does not render. */
    findMyToolOrder(supabase, user.id, toolsLayoutKey(homeKind)),
  ]);

  /* the metal the KIND wears (DOS_RINGS 1462): gold for an organization, silver
     for an artist, bronze for a user — the same pair the Profile tab paints with */
  const ring = ROLE_RING[kind];
  const face = photoUrl(profile.avatarPath);
  /* "20 Yrs · Gurugram" — `heroMetaWords`, the ONE place this sentence is built,
     so Home and the Profile tab cannot word it differently (19 Sep 2026) */
  const place = profile.city ?? "";
  const metaLine = heroMetaWords(profile.age, place);
  /* ⚠ `canManage` IS GONE (21 Sep 2026) — it decided whether the empty day
     offered "See everything you manage" (7135: "offering it to somebody who
     manages nothing is a door onto an empty room"), and the empty day offers
     nothing at all now. Deleted rather than left computed and unread. */
  /* ⚠ WHERE AN ENQUIRY WOULD LAND, AND WHY IT IS NOT THE PROFILE (21 Sep 2026).
     `send_enquiry` names a BUSINESS or a crew, never a person — so an artist's
     asks go to the `artist_page` row behind them (R24). A plain user has none,
     which is why their row carries no Enquiry at all rather than a dead one:
     the public page draws none for a user either ("user — nothing", the 19 Sep
     list), and Home matching it is the whole point of this row. */
  const asksGoHere = isArtist ? pageId : null;
  const isPlainUser = !isArtist;
  /* THE ARTIST PAGE IS PROVISIONED HERE, NOT SET UP IN A SHEET (18 Sep 2026, the
     user: "no need for a separate artist page to be created … you just subscribe
     from a user to artist to get the additional tools"). A live plan and no page
     yet → the page is made now, named after the person; the Team and Students
     tiles below open it from the first render. */
  /* the header, shown and nothing else: adding and removing moved into the
     Edit-profile sheet on 16 Sep 2026, at the user's instruction */
  const shots: HeroShot[] = header
    .filter((g) => g.url)
    .map((g, i) => ({ key: g.id, src: g.url as string, alt: `Header picture ${i + 1} of ${profile.fullName}` }));

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        boxSizing: "border-box",
      }}
    >
      <div style={{ padding: "0 16px" }}>
        {/* identity hero — the same object the profile and a studio's home wear (prototype 7248-7339, 10575) */}
        <IdentityHero
          name={profile.fullName}
          grad={ring}
          tint={ring[1]}
          /* ⚠ ONE MAP FOR BOTH SCREENS, AND IT IS THE TITLE-CASED ONE (19 Sep
             2026). Home read `KIND_WORD` ("Artist") and the Profile tab
             `KIND_BADGE` ("ARTIST"); `HERO_EYEBROW` uppercases either, so the
             two LOOKED alike and were not. The Profile tab moved onto this one
             rather than the reverse, because the shouting was only ever CSS:
             "ORGANIZATION" in the DOM is what a screen reader reads out, and
             the capitals belong to the style sheet, not to the text. */
          eyebrow={KIND_WORD[kind]}
          /* the account number belongs under the word that names the account
             (18 Sep 2026) — it used to sit under the styles, a block away */
          eyebrowSub={
            profile.memberNo != null ? (
              /* ⚠ `publicHref`, NOT `/profile` (22 Sep 2026). `/profile` is a
                 server REDIRECT to exactly this address (C40) and it exists for
                 the callers that cannot compute it — the chrome's gear, a
                 studio's corner, a crew's — because none of them knows the
                 VIEWER's id. Home does: `publicHref` is built at the top of this
                 file. Linking the redirect from here spent a round trip to reach
                 a string the page had already made. */
              <Link href={publicHref} aria-label="Open your profile" style={{ textDecoration: "none" }}>
                <HeroId>{memberNoWords(profile.memberNo)}</HeroId>
              </Link>
            ) : null
          }
          /* the tick is DanceOS's to give (7292) — set when a verification actually clears.
             ⚠ NO CHIP ON AN ORGANIZATION'S NAME ANY MORE (11 Sep 2026): nobody
             looks at an organization now, the badge moved to the studio. An
             organization verified under the old model keeps its tick. */
          verified={Boolean(profile.verifiedAt)}
          meta={metaLine ? place ? <HeroPlace text={metaLine} query={place} /> : <span style={{ fontVariantNumeric: "tabular-nums" }}>{metaLine}</span> : null}
          /* ⚠ THE STYLES ARE IN THE BAND BELOW, NOT HERE (19 Sep 2026, the user:
             "Dance style for the page should also be editable only from the home
             tab"): drawing them read-only here AND editable below would be the
             same row twice, so the hero's own styles row is left empty on Home */
          avatar={face}
          avatarAlt={profile.fullName}
          /* THE PICTURE OPENS BOTH PICTURE SECTIONS (19 Sep 2026, the user:
             "should be able to click and view both pictures sections when
             clicking on that photo"). Home is where the profile picture and the
             header are changed, so the disc is that door; the eye in the corner
             is the public page, which is what the disc opened for a few hours
             the same day. */
          avatarSlot={<PicturesButton profile={profile} grad={ring} avatar={face} />}
          shots={shots}
          /* the posters' own pencil, at the rail's corner (20 Sep 2026) — a
             press on a poster opens the poster; this is how the set changes */
          headerEdit={headerMax > 0 ? <HeaderEditButton profile={profile} header={header} headerMax={headerMax} /> : null}
          /* ⚠ NO PENCIL (19 Sep 2026) — Edit profile is Settings' first tile.
             ⚠⚠ AND THE CORNER OPENS YOUR PROFILE, NOT YOUR PUBLIC PAGE (21 Sep
             2026, the user: "the top right button on all home tabs should just
             take to the user profile right now its looping between student
             record and profile from that top right section"). THE LOOP WAS REAL
             AND IT WAS TWO OF MY OWN CONTROLS FACING EACH OTHER: this eye opened
             `/person/{me}`, and C29 (20 Sep) put a corner THERE opening
             `/profile`, whose own eye opened `/person/{me}` again — press the
             corner four times and you are back where you started, having seen
             two screens. The same loop existed on a studio's home and a crew's,
             through "Manage this studio" / "Manage this crew".
             The corner is ONE door now, the same on every home: the Profile tab,
             which lost its slot in the tab bar on 19 Sep (C16) and has needed a
             door ever since. The public page is reached from there, or from the
             Share chip in the figures row. */
          corner={
            /* ⚠ `publicHref` rather than `/profile`, for the reason above: the
               same destination, one hop fewer. The DOOR is unchanged — C37's
               "one corner, the same on every home" still holds, because what
               `/profile` resolves to IS this address. */
            <Link href={publicHref} aria-label="Your profile" style={cornerChip}>
              <PersonIcon />
            </Link>
          }
        >
          {/* ⚠ WHAT WAS HERE HAS GONE UP INTO THE HERO (18 Sep 2026): the role
              word moved to the eyebrow and the account number under it. What
              stands here now is THE BAND (19 Sep 2026) — the two follow figures
              with their list, the styles with their ＋, and the links right under
              them with theirs. The RANK that lived here is gone with the same
              message; it is the Stats chip's own screen. */}
          <HomeBand
            profile={profile}
            /* ⚠ THE CHIPS RIDE THE FIGURES ROW NOW (20 Sep 2026, the user: "should
               be placed in same row as follower following numbers on its right
               side") — the QR that shares this account's page (7288), and the
               Stats chip beside it (18 Sep). There is no Follow bell on your own
               Home: you do not follow yourself. */
            chips={
              <>
                {/* FOLLOW · STATS · QR · SHARE (21 Sep 2026, the user's own order) */}
                {/* `publicHref` is already this subject's address, so its stats are
                  one segment on (22 Sep 2026) — `/stats` and `/business/stats`
                  are redirects to exactly this, for the callers that cannot
                  compute it */}
              <StatsChip href={`${publicHref}/stats`} />
                <ProfileShare path={publicHref} name={profile.fullName} />
                <ProfileLink path={publicHref} name={profile.fullName} />
              </>
            }
            followers={followers}
            followingPeople={followingPeople}
            followingTenants={followingTenants}
            followingOrgs={followingOrgs}
            followingCrews={followingCrews}
          />
        </IdentityHero>

        {/* ── WHERE YOU STAND WITH DANCEOS (R13, 9 Sep 2026) — an organization only,
            and on the outside screen rather than inside Studios, because it carries
            the badge and the only door to a person about the decision.

            UNTIL THE DECISION, AND NOT AFTER IT (11 Sep 2026, the user: "after
            verification I don't need this verified organization box — the user
            will create the studio and to make it discoverable he will subscribe,
            then only the studio will be visible"). Once the tick is on the name
            the card has nothing left to say that the studios hub does not say
            better, beside each studio, with its own Subscribe button. The tick
            on the sleeve is the whole verified state; the hub is the next step. ── */}
        {/* ⚠ NO GST CARD ON HOME (11 Sep 2026 — the user: "GST verification step
            is showing here at the org main screen and that['s] stupid; better
            make it one of the options in settings"). It is a ONE-TIME errand,
            and a permanent card for a one-time errand is clutter on the screen
            an organization opens most. It lives at /gst now, reached from
            Settings' own row and from the events desk, which is the only place
            it actually stands in anybody's way. */}
        {/* ⚠ AND THE CONVERSATION WITH DANCEOS IS GONE FROM HERE (20 Sep 2026,
            the user: "remove your conversation with dance os … from just the home
            tab for studio and organization profiles as already being handled from
            settings"). It is Settings → Help & support, which every account has
            and which is where the 10 Sep merge already put this one conversation.
            A permanent card on the screen an organization opens most, for a door
            that exists one tap away, is the same clutter the GST card was. */}

        {/* ── THE DECK JUST SCROLLS (prototype 7106-7204): today, whole — one list, every side,
            live first — under the one shelf head, with both doors named. An organization
            still waiting on approval sees neither this nor the tools. ── */}
        {/* ── THE BUTTONS ABOVE THE SCHEDULE, THE SAME ROW THE PROFILE PAGE
            CARRIES (21 Sep 2026, the user: "buttons above schedule should also
            be visible on the home tab in the same way as profile"). On the
            public page they sit between the band and Schedule; Home's schedule
            is "Today's schedule", so they sit here, in the same order, from the
            same fields — `profile` already carries the number, the address, the
            Call switch and the pin, so this costs no read.
            ⚠ ENQUIRY IS DRAWN AND DISABLED WITH ITS REASON, which is the user's
            own precedent from 20 Sep ("Viewing your own profile should show same
            buttons which you see on discover"): `ActionRow` is a grid sized by
            how many cells it is GIVEN, so dropping a button does not merely drop
            it — it re-lays out the ones beside it, and the row would be a
            different shape here from the page it is meant to match. Its
            accessible NAME becomes the reason, so a locator asking for the live
            button cannot match the dead one.
            ⚠ An organization still waiting on approval sees none of this, for
            the same reason it sees no deck and no tools. ── */}
        {orgAwaitingApproval ? null : (
          <>
            {/* no gap of its own — the hero's own bottom padding is it (21 Sep 2026) */}
            <ActionRow>
              {asksGoHere ? (
                <EnquiryButton
                  tenantId={asksGoHere}
                  tenantName={profile.fullName}
                  tenantType="artist_page"
                  signedIn
                  accent={ring[1]}
                  cannotAsk="This is your own page — enquiries come to you here"
                />
              ) : null}
              {/* an ARTIST's Call only while their own switch is on (push 2, 19 Sep 2026) */}
              {profile.phone && isArtist && profile.phonePublic ? <CallButton phone={profile.phone} /> : null}
              {!isPlainUser && profile.contactEmail ? <MailButton email={profile.contactEmail} /> : null}
              {/* ⚠ a person's row never carries a pin — the Location button was the
                  retired organization login's (26 Sep 2026); an organization's pin
                  is its business row's, on its own home */}
            </ActionRow>
            <TodayShelf deck={deck} />
          </>
        )}

        {/* ── run your business — the prototype's BizSection (7342-7344, 2497-2583). It is the
            sheet that covers the deck, so it is opaque and it is above. ── */}
        {orgAwaitingApproval ? null : (
          <div style={{ position: "relative", zIndex: 1, background: LILAC }}>
            <BizSection kind={homeKind} pageId={pageId} order={toolOrder}>
              {/* THE PAGE COULD NOT BE MADE (18 Sep 2026): the plan is live and Home just
                  tried to provision the page the artist tools run through, and the
                  database said no — a refusal Home swallows so it never fails on it.
                  Said in one sentence rather than left as tiles that open the hub. */}
              {isArtist && !pageId ? (
                <div role="status" style={{ background: CARD, border: `1.5px solid ${GOLD}66`, borderLeft: `3px solid ${GOLD}`, borderRadius: 16, padding: "12px 14px", marginBottom: 10 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 900, color: INK }}>Your artist page is still being set up</span>
                  <span style={{ display: "block", fontSize: 11, color: SUB, marginTop: 3, lineHeight: 1.5 }}>
                    Team, Students and Earnings run through it. It could not be made just now — open Home again in a moment, and if this stays, message DanceOS from Settings.
                  </span>
                </div>
              ) : null}
              {/* somebody has asked you onto their team, and only you can answer —
                  the same gold ask the class page wears when a class is handed over */}
              {invites.map((inv) => (
                <Link
                  key={inv.inviteId}
                  href={`/join/${inv.code}`}
                  style={{
                    display: "block",
                    background: CARD,
                    border: `1.5px solid ${GOLD}66`,
                    borderLeft: `3px solid ${GOLD}`,
                    borderRadius: 16,
                    padding: "13px 14px",
                    marginBottom: 10,
                    color: INK,
                    textDecoration: "none",
                  }}
                >
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 900 }}>
                    {inv.tenantName} wants you on the team
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 3 }}>
                    As {MEMBER_ROLE_WORD[inv.memberRole].toLowerCase()} · you decide
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, color: GOLD, marginTop: 7 }}>
                    Answer this ›
                  </span>
                </Link>
              ))}
            </BizSection>
          </div>
        )}
      </div>
    </div>
  );
}
