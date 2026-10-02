import Link from "next/link";
import { WelcomeFromUrl } from "@/components/ui/WelcomeBow";
import { ArrangeTools } from "@/features/home/components/ArrangeTools";
import type { Tile } from "@/features/home/components/home-kit";
import { arrangeTiles, orderOf, toolsLayoutKey } from "@/features/home/toolOrder";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroDot, HeroId, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { EntityBand } from "@/features/profiles/components/profile-band";
import { FollowerFigure } from "@/features/profiles/components/FollowerFigure";
import { FollowingFigure } from "@/features/profiles/components/FollowingFigure";
import { crewTeamRows } from "@/features/profiles/teamFollowing";
import { ProfileLink, ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { EyeIcon, cornerChip } from "@/features/profiles/components/profile-kit";
import { ActionRow, CallButton, MailButton, MessageButton, whatsappHrefOf } from "@/features/profiles/components/ContactButtons";
import { ContactEditButton } from "@/features/profiles/components/ContactEditor";
import { EditDetailsChip, EditModeButton, EditModeProvider } from "@/features/profiles/components/EditMode";
import { RecordListsProvider } from "@/features/profiles/components/RecordLists";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { CrewLinksRow, CrewStylesRow } from "./CrewBand";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import { CREW_GRAD, type Crew, type CrewMember } from "@/types/crew";
import { CrewEditFromUrl } from "./CrewEditSheet";
import { CrewPicturesButton, CrewPostersButton } from "./CrewPictures";

/** A CREW'S OWN HOME (18 Sep 2026, the user: "crews managed by you should take to
 *  Crew home tab with Teams and events to manage the section"). What a crew you
 *  lead opens now — the same shape as a studio's own home: the identity hero
 *  every profile page wears (the crew's photo on the disc, its style as a tile,
 *  the QR to its public page and the crew board's Stats chip stacked on the
 *  right), then the crew's tools as tiles. ⚠ The prototype's S_crewmanage kept
 *  TWO desks behind a segment switch — Members | Battle record — which became
 *  two tiles here, **Team** and **Events**; the second went with events on
 *  29 Sep 2026, so Team is the whole of that desk again. The bottom bar on this
 *  page is the crew's own — Home · Inbox — drawn by the chrome.
 *
 *  THE CORNER IS A PENCIL OVER AN EYE (19 Sep 2026), like every other home's:
 *  the pencil opens Edit crew — the name, the photo, the header pictures (up to
 *  five, new today), the city, the style, the email — and the eye opens the
 *  crew's page as a stranger sees it. The picker that sat under the hero moved
 *  into the sheet, where every other picture in the app is changed. */
export function CrewHome({ crew, members, header = [], followers = 0, order = null, editOpen = false }: { crew: Crew; members: CrewMember[]; header?: HeaderPhoto[]; /** how many follow this crew — `crew_follower_counts`, aggregate-only (20 Sep 2026) */ followers?: number; /** this leader's own arrangement of THIS crew's tools (22 Sep 2026) */ order?: string[] | null; /** `?edit=1`, which Settings' "Edit crew" navigates here with (22 Sep 2026) — the leader's alone, and `requireLedCrew` is what has already said so */ editOpen?: boolean }) {
  const confirmed = members.filter((m) => m.status === "confirmed").length;
  const asked = members.filter((m) => m.status === "asked").length;
  const tiles: Tile[] = [
    { name: DOS_TOOLS.team.name, href: `/crews/${crew.id}/manage/team`, k: "team", c: DOS_TOOLS.team.c },
    /* ⚠ THE EVENTS TILE WENT WITH EVENTS (29 Sep 2026) — it opened the battle
       record, the second half of the prototype's S_crewmanage switch */
    /* ⚠ NO ENQUIRIES TILE (2 Oct 2026): a crew's enquiries are its INBOX tab's
       third desk again (the user: "shift back enquiries to inbox from home tools
       for all profiles") */
    /* ⚠ PRACTICE AND CALENDAR (27 Sep 2026, the user: "crew should also get an
       option on home tab called Practice … practice also get added to calendar.
       crews should also have a calendar tab"). Both are the LEADER's desks —
       `requireLedCrew` fronts every route under `/crews/{id}/manage`, and the
       database asks again on every write. ⚠ A crew's calendar IS its practices:
       it teaches no class, so it is never offered the Classes · Practice
       switch — which read Classes · Events · Practice until 29 Sep 2026. */
    { name: DOS_TOOLS.practice.name, href: `/crews/${crew.id}/manage/practice`, k: "practice", c: DOS_TOOLS.practice.c },
    { name: DOS_TOOLS.calendar.name, href: `/crews/${crew.id}/manage/calendar`, k: "calendar", c: DOS_TOOLS.calendar.c },
    /* ⚠ EARNINGS (2 Oct 2026, the user: "earnings for crews is missing") — what
       the crew's enquiries brought in; green clears every other tile on a
       crew's grid (orange, violet, indigo, cyan) */
    { name: DOS_TOOLS.earn.name, href: `/crews/${crew.id}/manage/earnings`, k: "earn", c: DOS_TOOLS.earn.c },
  ];
  const shots: HeroShot[] = header.filter((h) => h.url).map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${crew.name}`, signed: h.signed }));
  const whatsapp = whatsappHrefOf(crew.socials);
  return (
    /* EDIT MODE (26 Sep 2026): the pencil toggles it and every editor on this
       home appears with it — see `EditMode.tsx`. `requireLedCrew` has already
       said this is the leader, so the pencil is always drawn here. */
    <EditModeProvider>
    <RecordListsProvider styles={crew.styles.length ? crew.styles : crew.style ? [crew.style] : []} socials={crew.socials}>
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, boxSizing: "border-box", paddingBottom: "var(--dos-foot)" }}>
      <div style={{ padding: "0 16px" }}>
        <IdentityHero
          testId="crew-hero"
          name={crew.name}
          grad={CREW_GRAD}
          eyebrow="Crew"
          /* the crew's own number beside the word (20 Sep 2026) */
          eyebrowSub={crew.memberNo ? <HeroId>{memberNoWords(crew.memberNo)}</HeroId> : null}
          verified={false}
          meta={
            <>
              <span>{crew.city}</span>
              <HeroDot />
              <span data-testid="crew-home-members">
                {confirmed} member{confirmed === 1 ? "" : "s"}
              </span>
              {asked > 0 ? (
                <>
                  <HeroDot />
                  <span style={{ color: "#F59E0B" }}>{asked} asked</span>
                </>
              ) : null}
              {/* ⚠ "N events coming" was the third fact on this line and went
                  with events (29 Sep 2026) */}
            </>
          }
          /* ⚠ EMPTY ON PURPOSE — the band draws them, so the order matches every
             other profile: figures → styles → links (the hero's own styles row
             renders BEFORE its children) */
          styles={[]}
          /* ⚠ THE DISC AND THE POSTERS ARE CONTROLS HERE NOW (21 Sep 2026, the
             user: "make sure all profile types have similar ways to edit the
             profile, the segments like social media, dance styles, pictures and
             posters"). A crew was the last kind still editing both inside its
             Edit sheet — the shape the same user had removed from a STUDIO on
             20 Sep. The disc opens the picture and its ⊕ changes it; the rail's
             ⊕ opens the posters. ⚠ The disc STOPPED opening the crew's public
             page: that page is the eye in the corner and the Share chip in the
             band, and a disc that navigates is not a disc you can edit from. */
          avatar={photoUrl(crew.photo)}
          avatarSlot={<CrewPicturesButton crewId={crew.id} crewName={crew.name} grad={CREW_GRAD} avatar={photoUrl(crew.photo)} canEdit />}
          avatarAlt={crew.name}
          shots={shots}
          headerEdit={<CrewPostersButton crewId={crew.id} crewName={crew.name} photos={header} />}
          /* ⚠⚠ THE EYE IS BACK, ONTO THIS CREW'S OWN PAGE (21 Sep 2026, the user:
             "studio and crew pages on home tab should have option to view their
             profile pages currently taking to organizations page and user/artist
             page"). Cutting the C37 loop this morning pointed this corner at the
             Profile tab, which on a crew's home is the PERSON who leads it —
             true, and nothing to do with the crew. A corner goes to the public
             face of the thing you are standing on; a profile page has no corner,
             so nothing cycles, and the switcher beside the gear is the way back
             to you from anywhere. */
          /* one control, like every other profile (22 Sep 2026) — the pencil is
             Settings' "Edit crew" now, for the studio's reason */
          corner={
            <>
              <EditModeButton />
              <Link href={`/crew/${crew.id}`} aria-label="Public view" style={cornerChip}>
                <EyeIcon />
              </Link>
            </>
          }
          detailsEdit={<EditDetailsChip href={`/crews/${crew.id}/manage?edit=1`} />}
        >
          {/* ── THE SAME BAND AS EVERY OTHER PROFILE (20 Sep 2026) — figures under
              the styles, in the one spec `profile-band.tsx` holds. A crew leads
              with Followers like every other kind; its members, its open asks and
              its coming events stay in `meta` above, where they already were, so
              nothing is said twice. NO LINKS ROW: `crews` has no `socials`
              column — a crew publishes an email and a number, not handles — so
              the row is not drawn rather than drawn empty. ── */}
          <EntityBand
            figures={
              <>
                <FollowerFigure n={followers} kind="crew" id={crew.id} name={crew.name} testId="crew-followers" />
                {/* ⚠ THE SECOND FIGURE IS THE LEADER'S (27 Sep 2026, the user:
                    "following section for organization and crews is missing on
                    home"). A crew follows nothing of its own — `follows`
                    references `profiles`, so there is nothing to follow WITH —
                    and the honest answer to the question is what the account
                    that leads it follows, which is exactly what a studio's home
                    has printed since 20 Sep. Null draws nothing, never 0. */}
                {/* ⚠ AND IT OPENS ITS LIST (27 Sep 2026, the user: "following
                    list not opening properly crew and organization"). It was a
                    plain `Figure` — a dead number — while Followers beside it
                    had been a door since that morning. The list is the LEADER's
                    own, which is whose count this is; `FollowingFigure` says
                    why it takes no argument. */}
                {/* ⚠⚠ AND SINCE 2 Oct 2026 IT IS THE CREW'S TEAM (the user: "following
                    for crew and studio should by default show list of team
                    members") — not the leader's follows any more */}
                <FollowingFigure n={null} rows={crewTeamRows(members)} always testId="crew-following" />
              </>
            }
            /* the chips at the row's right edge (20 Sep 2026). No Follow bell:
               this is the crew's own home, and its own people cannot follow it. */
            chips={
              <>
                {/* FOLLOW · STATS · QR · SHARE (21 Sep 2026) — no bell on your
                    own crew's home.
                    ⚠ THE CHIP OPENS THIS CREW'S OWN STATS (29 Sep 2026). It
                    pointed at `/stats?tab=charts&seg=crew` — the crew BOARD,
                    on the person's stats screen — which is the same shape as
                    the studio chip's bug of 21 Sep: a chip on a crew's home
                    opening a page about everybody. `/crew/{id}/stats` is the
                    page built for exactly this and shows this crew's own place
                    nationally and in its city; the board went the same day
                    (see `EntityStatsPage`). */}
                <StatsChip href={`/crew/${crew.id}/stats`} />
                <ProfileShare path={`/crew/${crew.id}`} name={crew.name} />
                <ProfileLink path={`/crew/${crew.id}`} name={crew.name} />
              </>
            }
            /* ⚠ BOTH ROWS ARE THE EDITABLE ONES (26 Sep 2026, the user: "all
               profiles should have both dance style edits and social media edit
               options and option to add multiple") — a list of styles and the
               links every other profile carries, each with its ＋ while the
               pencil is pressed. Passed as children with the band's own left
               empty, so they land where they always did. */
            styles={[]}
            socials={[]}
          >
            <CrewStylesRow crew={crew} canEdit />
            <CrewLinksRow crew={crew} canEdit />
          </EntityBand>
        </IdentityHero>

        {/* ── THE BUTTONS THE CREW'S PAGE CARRIES (21 Sep 2026): Enquiry · Call ·
            Mail, in that order, from the crew's own fields. A crew has no
            schedule bar, so they sit where the page puts them — directly under
            the band. ⚠ Enquiry is drawn and DISABLED: you are in this crew, and
            `send_enquiry` refuses the leader and every confirmed member in those
            words (#0u). ⚠ Call is the LEADER'S SWITCH, exactly as on the page —
            `crew_contacts`' own SELECT policy IS the switch, so a number that
            reaches nobody is not drawn here either. ── */}
        {/* no gap of its own — the hero's own bottom padding is it (21 Sep 2026) */}
        <ActionRow>
          <EnquiryButton
            businessId={crew.id}
            crewId={crew.id}
            businessName={crew.name}
            businessType="artist_page"
            signedIn
            accent={CREW_GRAD[1]}
            cannotAsk="You are in this crew — enquiries come to you here"
          />
          {crew.phone && crew.phonePublic ? <CallButton phone={crew.phone} /> : null}
          {crew.contactEmail ? <MailButton email={crew.contactEmail} /> : null}
          {whatsapp ? <MessageButton href={whatsapp} /> : null}
        </ActionRow>
        {/* the ⊕ that makes and unmakes those buttons, while the pencil is pressed (26 Sep 2026) */}
        <ContactEditButton target={{ kind: "crew", crew, socials: crew.socials }} />

        <div style={{ position: "relative", zIndex: 1, background: LILAC }}>
          {/* arranged on the server, so the first paint is already in this
              leader's own order (22 Sep 2026). ⚠ The key carries the CREW's id,
              so two people who lead crews each arrange their own — and a crew's
              two tiles are the smallest grid in the app, which is exactly why
              the control is offered rather than assumed unnecessary. */}
          <ArrangeTools kind="crew" tiles={arrangeTiles(tiles, order)} defaultOrder={orderOf(tiles)} layoutKey={toolsLayoutKey("crew", crew.id)} arranged={Boolean(order && order.length > 0)} />
        </div>
      </div>
      {/* the form Settings sends you to, over the home it belongs to */}
      {editOpen ? <CrewEditFromUrl crew={crew} /> : null}
      {/* THE BOW ON CREATION (2 Oct 2026, the user: "on creation similar welcome
          message for studio and crew profiles as we get on sign up for users").
          Opened by `?welcome=crew`, which Create crew adds and nothing else does;
          presentation only — `requireLedCrew` has already said this is the leader. */}
      <WelcomeFromUrl
        kind="crew"
        label={`${crew.name} is ready`}
        emoji="🔥"
        title={`${crew.name} is ready!`}
        subtitle="Your crew is on DanceOS — and you lead it."
        pills={(crew.styles.length ? crew.styles : crew.style ? [crew.style] : []).slice(0, 5).map((label) => ({ label }))}
        pillsCaption="what it dances"
        note={
          <>
            {asked > 0 ? `${asked} ${asked === 1 ? "person has" : "people have"} been asked to join — they confirm from their Inbox. ` : null}
            Bring your dancers in from <b style={{ color: "#F5F2FA" }}>Team</b>, then arrange a <b style={{ color: "#F5F2FA" }}>Practice</b>.
          </>
        }
        secondary={{ label: "Invite members ›", href: `/crews/${crew.id}/manage/team` }}
      />
    </div>
    </RecordListsProvider>
    </EditModeProvider>
  );
}
