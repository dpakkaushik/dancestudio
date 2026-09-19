import Link from "next/link";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { ReportButton } from "@/features/reports/components/ReportButton";
import { DOS_UI, INK, LILAC, MUTED } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { PublicPerson } from "@/repositories/publicPerson";
import { CREW_ROLE_WORD } from "@/types/crew";
import { KIND_BADGE, kindOf, memberNoWords } from "@/types/profile";
import { BioBlock } from "./BioBlock";
import { ActionRow, CallButton, MailButton } from "./ContactButtons";
import { FollowFigures } from "./FollowFigures";
import { FollowToggle } from "./FollowToggle";
import type { HeroShot } from "./HeroRail";
import { ProfileShare } from "./ProfileShare";
import { StatsChip } from "./StatsChip";
import { IdentityHero } from "./hero-kit";
import { Group, PlaceLink, ROLE_RING, Row, SchedIcon, bigWhite } from "./profile-kit";

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
 *  to sign in for a plain user's. */

const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

export function PublicPersonPage({
  person,
  header = [],
  isMe,
  following,
  signedIn,
  canFollow = true,
}: {
  person: PublicPerson;
  /** THE HEADER PICTURES — this person's own, as many as their kind shows */
  header?: HeaderPhoto[];
  isMe: boolean;
  following: boolean;
  signedIn: boolean;
  /** false when either side is an organization viewer, or this is you */
  canFollow?: boolean;
}) {
  const { profile } = person;
  /* the word over the name is the KIND's: an organization, an artist while the plan is live, a user */
  const kind = kindOf(profile.role, person.isArtist);
  const ring = ROLE_RING[kind];
  const RC = ring[1];
  const path = `/person/${profile.id}`;
  const face = photoUrl(profile.avatarPath);
  const shots: HeroShot[] = header
    .filter((h) => h.url)
    .map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${profile.fullName}`, signed: h.signed }));
  /* an artist is asked through the page behind them; a user is not asked at all */
  const canAsk = !isMe && kind === "artist" && Boolean(person.artistPageId);
  /* "Studios taught at" — the studios, never the artist's own page listed as a place they teach */
  const studiosTaughtAt = person.teachesAt.filter((t) => t.tenantType === "studio");

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        {/* ── the profile, lit like a player — the one hero every profile page wears ── */}
        <IdentityHero
          testId="person-hero"
          name={profile.fullName}
          grad={ring}
          tint={RC}
          eyebrow={KIND_BADGE[kind]}
          /* the account number reads under the word that names the account (18 Sep 2026) */
          eyebrowSub={
            profile.memberNo ? (
              <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums", letterSpacing: 0.3 }}>{memberNoWords(profile.memberNo)}</div>
            ) : null
          }
          verified={Boolean(profile.verifiedAt)}
          /* an organization's page to share is /org/{id}; this one is the admin's view of it */
          share={kind === "org" ? null : <ProfileShare path={path} name={profile.fullName} />}
          /* STATS IS THE CHIP UNDER THE QR (19 Sep 2026): your own record, or — since
             push 2 — THIS person's record and rank (the user: "stats page on any
             profile should show all stats for that particular profile and rankings") */
          stats={<StatsChip href={isMe ? "/stats" : `${path}/stats`} />}
          meta={
            profile.city || profile.age ? (
              /* "24, New Delhi" — one introduction, not two facts (10664), and the
                  place opens Maps (10694-10698). A person has an age where a business
                  has a founding year — never both (10594). */
              profile.city ? (
                <PlaceLink prefix={profile.age ? `${profile.age}, ` : ""} place={profile.city} />
              ) : (
                <span style={{ fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>{profile.age}</span>
              )
            ) : null
          }
          /* the styles they dance (DosStyleRow 1767) */
          styles={profile.styles}
          styleAria={(s) => `${s} — a style ${profile.fullName} dances`}
          avatar={face}
          avatarAlt={profile.fullName}
          shots={shots}
        />

        {/* ── THE FIGURES, THEN THE BIO (19 Sep 2026): one order on every public page.
            A number is not a public handle, so WhatsApp stays off the links (10778) ── */}
        <FollowFigures followers={person.followers} following={person.following} />
        <BioBlock about={profile.about} links={profile.socials} hideWhatsApp accent={RC} />

        {/* ── FOLLOW · FOLLOWING — never on your own page ── */}
        {!isMe && canFollow ? (
          <div style={{ marginTop: 12 }}>
            <FollowToggle target={{ kind: "person", id: profile.id }} initialFollowing={following} initialFollowers={person.followers} accent={RC} signedIn={signedIn} />
          </div>
        ) : null}

        {/* ── THE BUTTONS AN ARTIST'S PAGE CARRIES (19 Sep 2026): Enquiry · Call ·
            Mail — Call only while the artist's own switch is on (push 2: "Call is
            off for artist page by default but should have option to make it
            available"). A user's page carries none — the row is simply not drawn.
            One block under Follow; the Bio follows (the user, later: "all buttons
            placed together properly"). ── */}
        <ActionRow marginTop={6}>
          {canAsk ? <EnquiryButton tenantId={person.artistPageId as string} tenantName={profile.fullName} tenantType="artist_page" signedIn={signedIn} accent={RC} /> : null}
          {kind === "artist" && profile.phone && profile.phonePublic ? <CallButton phone={profile.phone} /> : null}
          {kind !== "user" && profile.contactEmail ? <MailButton email={profile.contactEmail} /> : null}
        </ActionRow>

        {/* THE PLACE THIS PROFILE GOES (10905-10940): a business's schedule is a
            list of sessions you can still book */}
        {person.runs.length ? (
          <div style={{ marginTop: 8 }}>
            <Link href={`/${person.runs[0].tenantType === "studio" ? "studio" : "artist"}/${person.runs[0].tenantId}/schedule`} aria-label="Schedule" style={bigWhite}>
              <SchedIcon />
              Schedule
            </Link>
          </div>
        ) : null}

        {/* ── THE ASSOCIATIONS (19 Sep 2026): an artist's studios, and everyone's crews ── */}
        {kind === "artist" && studiosTaughtAt.length ? (
          <Group title="Studios taught at" n={studiosTaughtAt.length}>
            {studiosTaughtAt.map((t) => (
              <Row key={t.tenantId} href={`/studio/${t.tenantId}`} markName={t.tenantName} title={t.tenantName} sub={[t.kinds, `${t.classes} class${t.classes === 1 ? "" : "es"}`, t.city].filter(Boolean).join(" · ")} />
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
      </div>
      {/* you cannot report yourself, and the RPC refuses it too (10 Sep 2026) */}
      {isMe ? null : <ReportButton subjectKind="profile" subjectId={profile.id} subjectName={profile.fullName} signedIn={signedIn} />}
    </div>
  );
}
