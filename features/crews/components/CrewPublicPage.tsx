import Link from "next/link";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { ActionRow, CallButton, MailButton, MessageButton, whatsappHrefOf } from "@/features/profiles/components/ContactButtons";
import { EntityBand } from "@/features/profiles/components/profile-band";
import { TopPanel } from "@/components/ui/TopPanel";
import { InvertedPanel } from "@/components/ui/InvertedPanel";
import { FollowerFigure } from "@/features/profiles/components/FollowerFigure";
import { FollowingFigure } from "@/features/profiles/components/FollowingFigure";
import { crewTeamRows } from "@/features/profiles/teamFollowing";
import { FollowToggle } from "@/features/profiles/components/FollowToggle";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { ProfileLink, ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { HeroDot, HeroId, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { PeopleGroup, PersonChip, smallBox } from "@/features/profiles/components/profile-kit";
import { DOS_UI, GOLD, INK, LILAC, MUTED } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import { CREW_GRAD, type Crew, type CrewMember } from "@/types/crew";

/** A CREW'S PUBLIC PAGE — prototype S_profiletab with `publicEntity="crew"`
 *  (10565-11060, the crew branch at 11044). SINCE 19 Sep 2026 IT STANDS ON THE
 *  ONE HERO EVERY PROFILE PAGE WEARS — `IdentityHero`: the header swiping
 *  through up to five pictures, the crew's photo on the disc, CREW over the
 *  name, the QR and the crew board's Stats chip stacked on the right, Since ·
 *  the city, the style as the app's one tile. It drew its own 206 square until
 *  today, the last page that did.
 *
 *  Under the hero, in the order every public page now shares (the user's list):
 *  **Follow · Following** — a crew can be followed now (`follows.crew_id`) —
 *  the **buttons** a crew's page carries — Enquiry · Mail — then the
 *  **associations**: Crew leader and Crew members (the battle record was the
 *  third and went with events, 29 Sep 2026). NO
 *  FIGURES: the Members · Events pair under the name is gone. Only CONFIRMED
 *  members are printed (an unanswered ask never puts a name on a public page).
 *
 *  Who sees what: the LEADER gets the door to the crew's home; a MEMBER is told
 *  they are in it; anybody else gets Follow and Enquiry (the leader and the
 *  members ARE the crew, so neither is offered to them). */

const joinedYear = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(iso));
/* ⚠ `monthDay` dated the battle record's rows and went with it (29 Sep 2026) */

/** ⚠⚠ THE APP'S OWN `Row`, NOT A FOURTH ONE (27 Sep 2026, the user: *"fix team
 *  layout for all types of profiles should be clean. and the same should
 *  reflect in profile pages for all profiles"*).
 *
 *  This was the fourth roster row in the app — its own `<Link>`, its own
 *  spacing, its own chevron, and the role INSIDE the sub line beside the city
 *  ("Member · Pune") where every other public page puts it in the gold `right`
 *  slot. So a person read one way on a crew's page and another on their own,
 *  which is exactly the gap. It is `Row` now: same face, same title, the CITY
 *  in `sub` and the ROLE in `right`, like a studio's team and an
 *  organization's. */
/** ⚠ A CHIP, NOT A ROW (27 Sep 2026) — `PersonChip`'s note has the reason, and
 *  a crew's roster is the clearest case for it: nine dancers were nine
 *  full-width rows whose only distinguishing mark, the position, sat in a
 *  sub-line under a city. */
function Person({ m, role, tint }: { m: CrewMember; role: string; tint: string }) {
  return <PersonChip key={m.id} href={`/person/${m.userId}`} name={m.name} role={role} roleColour={tint} photo={photoUrl(m.avatarPath)} />;
}

export function CrewPublicPage({
  crew,
  members,
  header = [],
  viewer,
  following = false,
  followers = null,
  signedIn,
}: {
  crew: Crew;
  members: CrewMember[];
  /** THE HEADER PICTURES (19 Sep 2026): up to five, the leader's to add */
  header?: HeaderPhoto[];
  viewer: "leader" | "member" | "other";
  following?: boolean;
  /** the live follower count, printed on the Follow button (19 Sep 2026, later) */
  followers?: number | null;
  /** a stranger who is signed out is offered Follow and Enquiry as doors to sign in */
  signedIn: boolean;
  /* ⚠ `todayKey` went with the battle record on 29 Sep 2026 — it split the
     crew's entries into what was still to come and what was over */
}) {
  const RG = CREW_GRAD;
  const RC = RG[1];
  const lead = members.filter((m) => m.role === "leader");
  const rest = members.filter((m) => m.role !== "leader");
  const path = `/crew/${crew.id}`;
  const shots: HeroShot[] = header.filter((h) => h.url).map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${crew.name}`, signed: h.signed }));

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <div style={{ padding: "0 16px" }}>
        {/* ⚠ TWO SHAPES, AS HOME IS (3 Oct 2026, the user: "dual tone, rounded
            squircles … on public view for all profiles similar to home tab") — the
            hero and buttons up here, the roster in the InvertedPanel below */}
        <TopPanel style={{ marginTop: 12 }}>
        <IdentityHero
          bare
          testId="crew-public-hero"
          name={crew.name}
          grad={RG}
          eyebrow="Crew"
          eyebrowSub={crew.memberNo ? <HeroId>{memberNoWords(crew.memberNo)}</HeroId> : null}
          verified={false}
          meta={
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800, color: INK }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                  <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
                </svg>
                Since {joinedYear(crew.createdAt)}
              </span>
              <HeroDot />
              <span>{crew.city}</span>
            </>
          }
          /* ⚠ the BAND draws the style (20 Sep 2026) — the hero renders its own
             `styles` prop before `children`, and the order is figures → styles */
          styles={[]}
          avatar={photoUrl(crew.photo)}
          avatarAlt={crew.name}
          shots={shots}
          /* ⚠ NO CORNER ON A PROFILE PAGE (21 Sep 2026) — see `PublicPersonPage`.
             ⚠ The leader keeps their door: "You lead this crew · Manage ›" is
             drawn under the hero and names what it opens. */
        >
          {/* ── THE SAME BAND HOME WEARS (20 Sep 2026). A crew follows nobody, so
              followers alone; `crews` has no `socials` column, so no links row —
              an empty rail is not a row. ── */}
          <EntityBand
            figures={
              <>
                <FollowerFigure n={followers} kind="crew" id={crew.id} name={crew.name} testId="crew-public-followers" />
                {/* ⚠ A CREW'S FOLLOWING IS ITS TEAM (2 Oct 2026, the user's
                    later word) — the confirmed roster, opening as a list */}
                <FollowingFigure n={null} rows={crewTeamRows(members)} always testId="crew-public-following" />
              </>
            }
            /* the three chips at the row's right edge (20 Sep 2026) — the QR, the
               crew board this crew is ranked on, and the Follow bell, drawn for
               every viewer and saying why when a press would be refused */
            /* FOLLOW · STATS · QR · SHARE (21 Sep 2026, the user's own order) */
            chips={
              <>
                {/* ⚠ FOR THE CREW'S OWN PEOPLE TOO since 2 Oct 2026 (the user: "can
                    remove the rule for not following your own crew") —
                    `20261002120000` took "you are in this crew" out of
                    `set_crew_follow` */}
                <FollowToggle
                  target={{ kind: "crew", id: crew.id }}
                  initialFollowing={following}
                  initialFollowers={followers}
                  accent={RC}
                  signedIn={signedIn}
                />
                <StatsChip href={`${path}/stats`} />
                <ProfileShare path={path} name={crew.name} />
                <ProfileLink path={path} name={crew.name} />
              </>
            }
            /* the LIST of styles and the links since 26 Sep 2026 — WhatsApp is the
               Message button below rather than a chip, as on a person's page */
            styles={crew.styles.length ? crew.styles : [crew.style]}
            styleAria={(s) => `${s} — the crew's style`}
            socials={crew.socials.filter((l) => l.platform !== "WhatsApp")}
          />
        </IdentityHero>

        {/* ── what the crew's own people get here. ⚠ FOLLOW LEFT THIS BLOCK (20 Sep
            2026) for the bell in the figures row, so a visitor sees nothing here
            and goes straight to the buttons. ── */}
        {viewer === "other" ? null : (
          <div style={{ marginTop: 12 }}>
            {viewer === "leader" ? (
              <Link href={`/crews/${crew.id}/manage`} style={smallBox(false, RC)}>
                You lead this crew · Manage ›
              </Link>
            ) : (
              <div style={{ ...smallBox(false, RC), cursor: "default" }}>You are in this crew</div>
            )}
          </div>
        )}

        {/* ── THE BUTTONS A CREW'S PAGE CARRIES (19 Sep 2026): Enquiry · Mail — the
            enquiry a celebration, a corporate show or a collaboration, answered by
            the leader from the crew's Inbox ── */}
        {/* ⚠ THE DEFAULT for a visitor, whose row follows the hero directly —
            and the default is −6 since 27 Sep 2026, which lands it 8px under the
            links, the same step the band's own rows take (`ActionRow` carries
            the measurement). 6 for the crew's own people, whose row follows the
            strip above instead, and a strip pads nothing. */}
        <ActionRow marginTop={viewer === "other" ? 12 : 6}>
          {viewer === "other" ? <EnquiryButton businessId={crew.id} crewId={crew.id} businessName={crew.name} businessType="artist_page" signedIn={signedIn} accent={RC} /> : null}
          {/* CALL IS A SWITCH (push 2): the number reaches this page only while the leader's switch is on — the policy on crew_contacts is the switch */}
          {crew.phone && crew.phonePublic ? <CallButton phone={crew.phone} /> : null}
          {crew.contactEmail ? <MailButton email={crew.contactEmail} /> : null}
          {whatsappHrefOf(crew.socials) ? <MessageButton href={whatsappHrefOf(crew.socials) as string} /> : null}
        </ActionRow>
        </TopPanel>

        <InvertedPanel style={{ paddingTop: 0 }}>
        {/* ── THE ASSOCIATIONS, in one language: a row per person, the group headed with a count ── */}
        {lead.length ? (
          <PeopleGroup title="Crew leader" n={lead.length}>
            {lead.map((m) => (
              <Person key={m.id} m={m} role="Crew leader" tint={RC} />
            ))}
          </PeopleGroup>
        ) : null}
        <PeopleGroup title="Crew members" n={rest.length}>
          {rest.length ? rest.map((m) => <Person key={m.id} m={m} role={m.role === "trainee" ? "Trainee" : "Member"} tint={RC} />) : <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: MUTED, padding: "10px 0" }}>Nobody else in the crew yet.</div>}
        </PeopleGroup>

        {/* ⚠ THE BATTLE RECORD WENT WITH EVENTS (29 Sep 2026) — the events this
            crew had entered, each a door to its page, read off
            `event_bookings.crew_id`. It was the one group on this page that was
            not the roster, and there is nothing left that could fill it. */}
        </InvertedPanel>
      </div>
    </div>
  );
}
