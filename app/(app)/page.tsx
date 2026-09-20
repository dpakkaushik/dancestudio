import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findProfileById } from "@/repositories/profiles";
import { findMyDeck } from "@/repositories/home";
import { findMyPendingInvites } from "@/repositories/invites";
import { ensureArtistPage, findMyMemberships } from "@/repositories/tenants";
import { findMyArtistPlan } from "@/repositories/plans";
import { findMyOrgTenantId } from "@/repositories/orgStanding";
import { findMyFollowedCrews, findMyFollowedOrganizations, findMyFollowedPeople, findMyFollowing, findMyPersonFollowers } from "@/repositories/follows";
import { findPersonHeaderPhotos } from "@/repositories/headerPhotos";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { amIPlatformAdmin } from "@/repositories/admin";
import { headerMaxFor, photoUrl } from "@/lib/media/photo";
import { CARD, DOS_UI, GOLD, INK, LILAC, SUB } from "@/lib/design/tokens";
import { BizSection } from "@/features/home/components/home-kit";
import { PILL_DARK, PILL_LIGHT, TodayShelf } from "@/features/home/components/TodayShelf";
import { HomeBand } from "@/features/profiles/components/HomeBand";
import { HeaderEditButton, PicturesButton } from "@/features/profiles/components/PicturesSheet";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { EyeIcon, ROLE_RING, cornerChip } from "@/features/profiles/components/profile-kit";
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

  const isOrg = profile.role === "org";
  /* WHERE AN ORGANIZATION STANDS WITH DANCEOS BELONGS HERE (R13, 9 Sep 2026):
     the badge on its own name, the steps, and the door to a person — not two
     taps away behind "Studios". A person's Home asks for none of it.
     ⚠ FOUR READS LEFT THIS LIST ON 11 Sep 2026 — the verification request, the
     proof photos, the plan catalogue and the support threads all fed the
     six-step organization card, and that card became the GST card. They were
     four round-trips on every single Home load for a component that is not
     drawn any more; what is still asked for is what is still shown. */
  const [memberships, invites, plan, eventsHostId] = await Promise.all([
    /* WITH the role (18 Sep 2026): an artist's grid needs the page they OWN, not
       the first business they belong to — a studio they teach at is not theirs */
    findMyMemberships(supabase),
    // somebody asked you onto their team — matched on the address you sign in
    // with, so an invite arrives here without any link being passed around
    findMyPendingInvites(supabase),
    isOrg ? Promise.resolve(null) : findMyArtistPlan(supabase),
    /* R15: the organization's ONE events host, so Studio Tools can carry an
       Events tile (11 Sep 2026) — the desk existed, the door from Home did not */
    isOrg ? findMyOrgTenantId(supabase).catch(() => null) : Promise.resolve(null),
    /* ⚠ AND THE FIFTH READ WENT WITH ITS CARD (20 Sep 2026, the user: "remove
       your conversation with dance os and subscription from just the home tab
       for studio and organization profiles as already being handled from
       settings"). `findSupportThreads` existed on Home for one row — the door
       back to DanceOS's reply — and Settings' Help & support tile is that door
       for every kind of account, so Home was the second one. The read is gone
       too, not just the card: a round trip on every Home load for something
       nothing renders is the shape this list was already trimmed for on 11 Sep. */
  ]);
  const businesses = memberships.map((m) => m.tenant);
  /* what the sleeve calls you: an organization is one; a person is an artist while the plan is live */
  const isArtist = Boolean(plan?.active);
  const kind = kindOf(profile.role, isArtist);

  /* THE HEADER PICTURES (15 Sep 2026): what swipes across the top. THE KIND
     decides how many, here and in the database (19 Sep 2026, the user's limits):
     a user one, an artist five, an organization ten — and a plan that lapsed
     with five stored still draws one; the rest wait. */
  const headerMax = headerMaxFor(kind);
  /* the page a stranger reads — an organization's own since 18 Sep 2026 (R23),
     a person's whether or not they hold the plan (R24) */
  const publicHref = isOrg ? `/org/${profile.id}` : `/person/${profile.id}`;

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
     ⚠ AN ORGANIZATION FOLLOWS NOBODY (R11), so it asks for none of the four
     following reads; its own followers it does have. */
  const [header, deck, pageId, followers, followingPeople, followingTenants, followingOrgs, followingCrews] = await Promise.all([
    findPersonHeaderPhotos(supabase, user.id, headerMax),
    findMyDeck(supabase, user.id, nowIso, businesses),
    isOrg || !isArtist ? Promise.resolve(null) : ensureArtistPage(supabase, profile, memberships),
    findMyPersonFollowers(supabase).catch(() => []),
    isOrg ? Promise.resolve([]) : findMyFollowedPeople(supabase).catch(() => []),
    isOrg ? Promise.resolve([]) : findMyFollowing(supabase).catch(() => []),
    isOrg ? Promise.resolve([]) : findMyFollowedOrganizations(supabase).catch(() => []),
    isOrg ? Promise.resolve([]) : findMyFollowedCrews(supabase).catch(() => []),
  ]);

  /* the metal the KIND wears (DOS_RINGS 1462): gold for an organization, silver
     for an artist, bronze for a user — the same pair the Profile tab paints with */
  const ring = ROLE_RING[kind];
  const face = photoUrl(profile.avatarPath);
  /* "20 Yrs · Gurugram" — `heroMetaWords`, the ONE place this sentence is built,
     so Home and the Profile tab cannot word it differently (19 Sep 2026) */
  const place = profile.city ?? "";
  const metaLine = heroMetaWords(profile.age, place);
  /* Manage only appears if you actually run something (7135): the door to what you
     manage, and offering it to somebody who manages nothing is a door onto an empty room */
  const canManage = businesses.length > 0;
  /* THE GRID FOR THIS KIND OF ACCOUNT (18 Sep 2026, the user's list for all four
     — `tilesFor` in home-kit carries it). An artist's grid opens the desks of the
     page they OWN (Team, Students); a user's and an organization's carry no
     desk of a business at all — a studio's desks are on the studio's own home. */
  const homeKind = isOrg ? "org" : isArtist ? "artist" : "user";
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
              <Link href="/profile" aria-label="Open your profile" style={{ textDecoration: "none" }}>
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
          /* ⚠ NO PENCIL (19 Sep 2026, the user: "Editing profile should be
             shifted to settings and should be the top option, all edit profile
             options to be removed from home and profile pages") — the corner is
             the eye alone, and Edit profile is Settings' first tile */
          corner={
            <Link href={publicHref} aria-label="Public view" style={cornerChip}>
              <EyeIcon />
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
                <ProfileShare path={publicHref} name={profile.fullName} />
                <StatsChip href={isOrg ? "/business/stats" : "/stats"} />
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
        {orgAwaitingApproval ? null : (
          <TodayShelf
            deck={deck}
            emptyTitle="Nothing on today"
            emptyBody={
              isOrg
                ? "Events you host today appear here. What runs in each studio’s rooms is on that studio’s own home."
                : "Classes and events you book, assist on or run today all appear here."
            }
            /* both doors, when both apply (7176-7181) — the Manage TILE left the
               grid on 19 Sep 2026 ("just need to remove manage as the tile in
               tools, nothing else changes"), so this pill is Home's one door to
               /managed again */
            emptyActions={
              <>
                {canManage ? (
                  <Link href="/managed" style={PILL_LIGHT}>
                    See everything you manage
                  </Link>
                ) : null}
                {isOrg ? (
                  eventsHostId ? (
                    <Link href={`/business/${eventsHostId}/events`} aria-label="Open the events desk" style={PILL_DARK}>
                      Open events
                    </Link>
                  ) : (
                    <Link href="/business" style={PILL_DARK}>
                      Open your studios
                    </Link>
                  )
                ) : (
                  <Link href="/my-classes" style={PILL_DARK}>
                    See all bookings
                  </Link>
                )}
              </>
            }
          />
        )}

        {/* ── run your business — the prototype's BizSection (7342-7344, 2497-2583). It is the
            sheet that covers the deck, so it is opaque and it is above. ── */}
        {orgAwaitingApproval ? null : (
          <div style={{ position: "relative", zIndex: 1, background: LILAC }}>
            <BizSection kind={homeKind} pageId={pageId} eventsHostId={isOrg ? eventsHostId : null} plan={isOrg ? null : isArtist ? "active" : "locked"}>
              {/* THE PAGE COULD NOT BE MADE (18 Sep 2026): the plan is live and Home just
                  tried to provision the page the artist tools run through, and the
                  database said no — a refusal Home swallows so it never fails on it.
                  Said in one sentence rather than left as tiles that open the hub. */}
              {isArtist && !pageId ? (
                <div role="status" style={{ background: CARD, border: `1px solid ${GOLD}66`, borderLeft: `3px solid ${GOLD}`, borderRadius: 16, padding: "12px 14px", marginBottom: 10 }}>
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
                    border: `1px solid ${GOLD}66`,
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
