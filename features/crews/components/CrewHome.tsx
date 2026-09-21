import Link from "next/link";
import { ToolGrid, ToolsPanel, type Tile } from "@/features/home/components/home-kit";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroDot, HeroId, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { EntityBand, Figure } from "@/features/profiles/components/profile-band";
import { ProfileLink, ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { EyeIcon, cornerChip } from "@/features/profiles/components/profile-kit";
import { ActionRow, CallButton, MailButton } from "@/features/profiles/components/ContactButtons";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import { CREW_GRAD, type Crew, type CrewEntry, type CrewMember } from "@/types/crew";
import { CrewEditButton } from "./CrewEditSheet";
import { CrewPicturesButton, CrewPostersButton } from "./CrewPictures";

/** A CREW'S OWN HOME (18 Sep 2026, the user: "crews managed by you should take to
 *  Crew home tab with Teams and events to manage the section"). What a crew you
 *  lead opens now — the same shape as a studio's own home: the identity hero
 *  every profile page wears (the crew's photo on the disc, its style as a tile,
 *  the QR to its public page and the crew board's Stats chip stacked on the
 *  right), then the crew's tools as tiles. The two desks the prototype's
 *  S_crewmanage kept behind a segment switch — Members | Battle record — are the
 *  two tiles: **Team** (the roster, asks, promotions, order) and **Events** (the
 *  battle record and the crew ranking). The bottom bar on this page is the
 *  crew's own — Home · Inbox — drawn by the chrome.
 *
 *  THE CORNER IS A PENCIL OVER AN EYE (19 Sep 2026), like every other home's:
 *  the pencil opens Edit crew — the name, the photo, the header pictures (up to
 *  five, new today), the city, the style, the email — and the eye opens the
 *  crew's page as a stranger sees it. The picker that sat under the hero moved
 *  into the sheet, where every other picture in the app is changed. */
export function CrewHome({ crew, members, entries, header = [], followers = 0, todayKey }: { crew: Crew; members: CrewMember[]; entries: CrewEntry[]; header?: HeaderPhoto[]; /** how many follow this crew — `crew_follower_counts`, aggregate-only (20 Sep 2026) */ followers?: number; todayKey: string }) {
  const confirmed = members.filter((m) => m.status === "confirmed").length;
  const asked = members.filter((m) => m.status === "asked").length;
  const upcoming = entries.filter((e) => e.endDate >= todayKey && e.eventStatus !== "completed").length;
  const tiles: Tile[] = [
    { name: DOS_TOOLS.team.name, href: `/crews/${crew.id}/manage/team`, k: "team", c: DOS_TOOLS.team.c },
    { name: DOS_TOOLS.events.name, href: `/crews/${crew.id}/manage/events`, k: "events", c: DOS_TOOLS.events.c },
  ];
  const shots: HeroShot[] = header.filter((h) => h.url).map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${crew.name}`, signed: h.signed }));
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, boxSizing: "border-box", paddingBottom: "var(--dos-foot)" }}>
      <div style={{ padding: "0 16px" }}>
        <IdentityHero
          testId="crew-hero"
          name={crew.name}
          grad={CREW_GRAD}
          tint={CREW_GRAD[1]}
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
              {upcoming > 0 ? (
                <>
                  <HeroDot />
                  <span>
                    {upcoming} event{upcoming === 1 ? "" : "s"} coming
                  </span>
                </>
              ) : null}
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
          corner={
            <>
              <CrewEditButton crew={crew} />
              <Link href={`/crew/${crew.id}`} aria-label="Public view" style={cornerChip}>
                <EyeIcon />
              </Link>
            </>
          }
        >
          {/* ── THE SAME BAND AS EVERY OTHER PROFILE (20 Sep 2026) — figures under
              the styles, in the one spec `profile-band.tsx` holds. A crew leads
              with Followers like every other kind; its members, its open asks and
              its coming events stay in `meta` above, where they already were, so
              nothing is said twice. NO LINKS ROW: `crews` has no `socials`
              column — a crew publishes an email and a number, not handles — so
              the row is not drawn rather than drawn empty. ── */}
          <EntityBand
            figures={<Figure n={followers} label="Followers" testId="crew-followers" />}
            /* the chips at the row's right edge (20 Sep 2026). No Follow bell:
               this is the crew's own home, and its own people cannot follow it. */
            chips={
              <>
                {/* FOLLOW · STATS · QR · SHARE (21 Sep 2026) — no bell on your
                    own crew's home */}
                <StatsChip href="/stats?tab=charts&seg=crew" />
                <ProfileShare path={`/crew/${crew.id}`} name={crew.name} />
                <ProfileLink path={`/crew/${crew.id}`} name={crew.name} />
              </>
            }
            styles={[crew.style]}
            styleAria={(s) => `${s} — the crew's style`}
          />
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
            tenantId={crew.id}
            crewId={crew.id}
            tenantName={crew.name}
            tenantType="artist_page"
            signedIn
            accent={CREW_GRAD[1]}
            cannotAsk="You are in this crew — enquiries come to you here"
          />
          {crew.phone && crew.phonePublic ? <CallButton phone={crew.phone} /> : null}
          {crew.contactEmail ? <MailButton email={crew.contactEmail} /> : null}
        </ActionRow>

        <div style={{ position: "relative", zIndex: 1, background: LILAC }}>
          <ToolsPanel kind="crew">
            <ToolGrid tiles={tiles} />
          </ToolsPanel>
        </div>
      </div>
    </div>
  );
}
