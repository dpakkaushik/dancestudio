import Link from "next/link";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { ReportButton } from "@/features/reports/components/ReportButton";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { PublicPerson } from "@/repositories/publicPerson";
import { KIND_WORD, heroMetaWords, kindOf, memberNoWords } from "@/types/profile";
import { EntityBand, Figure } from "./profile-band";
import { ActionRow, CallButton, MailButton } from "./ContactButtons";
import type { MembershipOnSale as MembershipOnSaleRow } from "@/repositories/memberships";
import { FollowToggle } from "./FollowToggle";
import type { HeroShot } from "./HeroRail";
import { PersonBody } from "./PersonBody";
import { ProfileLink, ProfileShare } from "./ProfileShare";
import { StatsChip } from "./StatsChip";
import { HeroId, HeroPlace, IdentityHero } from "./hero-kit";
import { Group, PersonIcon, ROLE_RING, Row, cornerChip } from "./profile-kit";

/* one Group and one Row for both profile screens (they are the same rows) */
export { Group, Row };

/** A PERSON'S PAGE — prototype S_profiletab with `publicEntity="trainer"`, which
 *  in the prototype IS a person (PUB 8643). The same skeleton the studio, the
 *  organization and the crew pages wear, because it is the same screen. Since
 *  18 Sep 2026 this is also an ARTIST'S public face (R24): the artist page is
 *  only the business behind it.
 *
 *  RE-CUT 19 Sep 2026 TO THE USER'S LIST. Under the hero, in the order every
 *  public page now shares: **Follow · Following**, the **Bio**, the **buttons**
 *  — an artist's are Enquiry · Mail, a user's page carries none ("Send Enquiry
 *  for all except users … Mail for all except users … Call for studios and
 *  organizations") — then **Schedule** when they run a business, then the
 *  **associations**: an artist's Studios taught at and Crews, a user's Crews.
 *  GONE: the four figures (Followers · Following · Sessions · On the floor), the
 *  three-side record grid and its "No sessions on the record yet" card, and the
 *  owner's "This is you · Your record ›" — Stats is the chip beside the QR now,
 *  opening your own record, or the board somebody else is ranked on.
 *
 *  CALL IS A SWITCH HERE (push 2, 19 Sep 2026). The user's list gave Call to
 *  studios and organizations, then: "Call is off for artist page by default but
 *  should have option to make it available on profile" — so an artist's page
 *  dials their number only while `phone_public` is on (the Edit sheet's switch);
 *  a stranger's read (`public_artist`) hands the number only then. A plain
 *  user's page still carries no buttons.
 *
 *  Who reads it: a signed-in person reads anybody's; a stranger reads an
 *  ARTIST's public face (`public_artist`, the public columns only) and is sent
 *  to sign in for a stranger reading a plain user's.
 *
 *  ⚠ WHAT IS BELOW THE BUTTONS IS `PersonBody`, SHARED WITH THE PROFILE TAB
 *  (20 Sep 2026) — Schedule, then what is on sale, then the associations. The
 *  two screens draw the same person from the same read and had drifted five
 *  ways; that file says which five and why one component is the only fix that
 *  holds. */

export function PublicPersonPage({
  person,
  header = [],
  isMe,
  following,
  signedIn,
  memberships = [],
}: {
  person: PublicPerson;
  /** THE HEADER PICTURES — this person's own, as many as their kind shows */
  header?: HeaderPhoto[];
  isMe: boolean;
  following: boolean;
  signedIn: boolean;
  /** what this artist has ON SALE through their own page (19 Sep 2026) */
  memberships?: MembershipOnSaleRow[];
}) {
  const { profile } = person;
  /* the word over the name is the KIND's: an organization, an artist while the plan is live, a user */
  const kind = kindOf(profile.role, person.isArtist);
  const ring = ROLE_RING[kind];
  /* the one sentence every profile prints under the name (19 Sep 2026) */
  const metaLine = heroMetaWords(profile.age, profile.city);
  const RC = ring[1];
  const path = `/person/${profile.id}`;
  const face = photoUrl(profile.avatarPath);
  const shots: HeroShot[] = header
    .filter((h) => h.url)
    .map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${profile.fullName}`, signed: h.signed }));
  /* an artist is asked through the page behind them; a user is not asked at all.
     ⚠ ON YOUR OWN PAGE IT IS DRAWN AND DISABLED, NOT DROPPED (20 Sep 2026, the
     user: "Viewing your own profile should show same buttons which you see on
     discover"). `ActionRow` is a grid sized by how many cells it is given, so a
     missing button did not just go missing — it resized the ones left, and the
     page you reach from Home's eye laid out differently from the same page
     reached from Discover. */
  const asksGoHere = kind === "artist" && Boolean(person.artistPageId);
  const canAsk = !isMe && asksGoHere;

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        {/* ── the profile, lit like a player — the one hero every profile page wears ── */}
        <IdentityHero
          testId="person-hero"
          name={profile.fullName}
          grad={ring}
          tint={RC}
          /* ⚠ `KIND_WORD`, THE MAP THE OTHER FOUR SCREENS READ (20 Sep 2026, the
             user: "when looking at your own profile from somewhere should also
             look same as profile page"). This page read `KIND_BADGE` ("ARTIST")
             where Home and the Profile tab read `KIND_WORD` ("Artist") —
             `HERO_EYEBROW` uppercases in CSS, so the two LOOKED identical and a
             screen reader said two different things. That unification was made on
             19 Sep and this screen was the one it missed. */
          eyebrow={KIND_WORD[kind]}
          /* ⚠ `HeroId`, LIKE EVERY OTHER PROFILE (20 Sep 2026, the user: "id one to
             be implemented for kinds of profiles"). This page had been setting the
             number its own way — 10.5/700/.3 in MUTED against the hero's own
             10.5/800/1.1 — which is the same drift `HeroId` was extracted to end
             on 19 Sep, and the one screen that never moved onto it.
             ⚠ A STRANGER READING AN ARTIST SEES NO NUMBER, and that is the data's
             doing rather than this line's: `public_artist` hands back no
             `member_no` (20260919090000 took a person's account number out of
             their public face on purpose), so `memberNo` is null and nothing is
             drawn. A signed-in reader gets the row, and the number with it. */
          eyebrowSub={profile.memberNo ? <HeroId>{memberNoWords(profile.memberNo)}</HeroId> : null}
          verified={Boolean(profile.verifiedAt)}
          meta={
            metaLine ? (
              /* "24 Yrs · Pune" — ONE introduction, not two facts (10664), and the
                  place opens Maps (10694-10698). A person has an age where a business
                  has a founding year — never both (10594).
                  ⚠ `heroMetaWords` since 19 Sep 2026 (the user: "age with Yrs and
                  City Name without comma in between", for ALL profiles) — this page
                  built the same sentence its own way, with a `prefix` of "24, ",
                  which is the third screen to have done so. */
              profile.city ? (
                <HeroPlace text={metaLine} query={profile.city} />
              ) : (
                <span style={{ fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>{metaLine}</span>
              )
            ) : null
          }
          /* ⚠ the BAND draws the styles (20 Sep 2026) — see the note below */
          styles={[]}
          avatar={face}
          avatarAlt={profile.fullName}
          shots={shots}
          /* ⚠ ONE PRESS BACK FROM YOUR OWN PAGE (20 Sep 2026, the user: "when
             looking at your own profile from somewhere should also look same as
             profile page. that breaks a lot of times"). The Profile tab's corner
             has carried the eye to HERE since 15 Sep and there was nothing in the
             other direction, so landing on your own page from a row somewhere in
             the app left the back chip as the only way out — and after two or
             three hops that is not where you came from. The same corner, the
             other way round, named for the thing it opens. */
          corner={
            isMe ? (
              <Link href="/profile" aria-label="Your profile" style={cornerChip}>
                <PersonIcon />
              </Link>
            ) : null
          }
        >
          {/* ── THE SAME BAND HOME WEARS (20 Sep 2026, the user: "Upper layer of
              Home tab to exactly the same used for profile pages for all kinds of
              profiles"): figures → styles → links, inside the hero.
              ⚠ NO BIO — "Remove bio from all profiles" — and a person's WhatsApp
              stays off the links, because a number is not a public handle (10778). ── */}
          <EntityBand
            figures={
              <>
                <Figure n={person.followers} label={person.followers === 1 ? "Follower" : "Followers"} />
                <Figure n={person.following} label="Following" />
              </>
            }
            /* the three chips (20 Sep 2026). ⚠ An ORGANIZATION read through this
               page has no QR: the page to share is `/org/{id}`, and this one is
               the admin's view of it — sharing a link that 404s for the reader is
               worse than offering no share at all. */
            /* ⚠ FOLLOW · STATS · QR · SHARE, IN THAT ORDER (21 Sep 2026, the
                user's own list). It is the order of how often a visitor reaches
                for them, and it is the SAME on all five kinds and on both a
                person's screens — which is the whole of "should look same as
                profile page".
                ⚠ NO BELL ON YOUR OWN PAGE — you do not follow yourself, and a
                control drawn only to be disabled is worse than none.
                ⚠ AND NEITHER QR NOR SHARE ON AN ORGANIZATION READ THROUGH THIS
                PAGE: this is the admin's view of it and its public face is
                /org/{id}, so a link shared from here 404s for the reader. */
            chips={
              <>
                {isMe || kind === "org" ? null : (
                  <FollowToggle
                    target={{ kind: "person", id: profile.id }}
                    initialFollowing={following}
                    initialFollowers={person.followers}
                    accent={RC}
                    signedIn={signedIn}
                    variant="chip"
                  />
                )}
                <StatsChip href={isMe ? "/stats" : `${path}/stats`} />
                {kind === "org" ? null : <ProfileShare path={path} name={profile.fullName} />}
                {kind === "org" ? null : <ProfileLink path={path} name={profile.fullName} />}
              </>
            }
            styles={profile.styles}
            styleAria={(s) => `${s} — a style ${profile.fullName} dances`}
            socials={profile.socials.filter((l) => l.platform !== "WhatsApp")}
          />
        </IdentityHero>

        {/* ── THE BUTTONS AN ARTIST'S PAGE CARRIES (19 Sep 2026): Enquiry · Call ·
            Mail — Call only while the artist's own switch is on (push 2: "Call is
            off for artist page by default but should have option to make it
            available"). A user's page carries none — the row is simply not drawn.
            One block; Follow is the bell in the figures row above. ── */}
        <ActionRow marginTop={12}>
          {asksGoHere ? (
            <EnquiryButton
              tenantId={person.artistPageId as string}
              tenantName={profile.fullName}
              tenantType="artist_page"
              signedIn={signedIn}
              accent={RC}
              cannotAsk={canAsk ? null : "This is your own page — enquiries come to you here"}
            />
          ) : null}
          {kind === "artist" && profile.phone && profile.phonePublic ? <CallButton phone={profile.phone} /> : null}
          {kind !== "user" && profile.contactEmail ? <MailButton email={profile.contactEmail} /> : null}
        </ActionRow>

        {/* ── EVERYTHING FROM HERE DOWN IS `PersonBody`, THE ONE THE PROFILE TAB
            ALSO DRAWS (20 Sep 2026): **Schedule**, then what is on sale, then the
            associations. ⚠ Schedule and Memberships were the other way round on
            this screen and the right way round on a studio's — which is the
            difference the user caught on their own page: "SCHEDULE WILL ALWAYS BE
            ABOVE MEMBERSHIPS IN PROFILE PAGE". One component now, so the two
            cannot disagree again. ── */}
        <PersonBody
          person={person}
          isMe={isMe}
          signedIn={signedIn}
          memberships={memberships}
          /* ⚠ AND A STRANGER GETS THE SCHEDULE TOO (20 Sep 2026, found by reading
             this very page on the live site after the push). `runs` comes from
             `business_members`, which RLS admits to a business's OWN MEMBERS —
             so for anybody else it is empty and the white Schedule bar was never
             drawn at all. On an ARTIST that is a real loss: `artist_page_of` is
             a definer read that answers anybody and returns only a LISTED page,
             and `/artist/{id}/schedule` is public, so the bar can be offered to
             the person it is FOR. Without this, "Schedule is above Memberships"
             was true and invisible to every visitor. */
          scheduleHref={
            person.runs.length
              ? `/${person.runs[0].tenantType === "studio" ? "studio" : "artist"}/${person.runs[0].tenantId}/schedule`
              : person.artistPageId
                ? `/artist/${person.artistPageId}/schedule`
                : null
          }
          accent={RC}
        />
      </div>
      {/* you cannot report yourself, and the RPC refuses it too (10 Sep 2026) */}
      {isMe ? null : <ReportButton subjectKind="profile" subjectId={profile.id} subjectName={profile.fullName} signedIn={signedIn} />}
    </div>
  );
}
