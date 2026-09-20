import Link from "next/link";
import { ToolGrid, ToolsHead, type Tile } from "@/features/home/components/home-kit";
import type { HeroShot } from "@/features/profiles/components/HeroRail";
import { HeroDot, HeroId, IdentityHero } from "@/features/profiles/components/hero-kit";
import { memberNoWords } from "@/types/profile";
import { EntityBand, Figure } from "@/features/profiles/components/profile-band";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { EyeIcon, cornerChip } from "@/features/profiles/components/profile-kit";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import { CREW_GRAD, type Crew, type CrewEntry, type CrewMember } from "@/types/crew";
import { CrewEditButton } from "./CrewEditSheet";

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
          share={<ProfileShare path={`/crew/${crew.id}`} name={crew.name} />}
          stats={<StatsChip href="/stats?tab=charts&seg=crew" />}
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
          avatar={photoUrl(crew.photo)}
          avatarAlt={crew.name}
          /* the disc opens the crew's own public page (19 Sep 2026) */
          avatarHref={`/crew/${crew.id}`}
          avatarLabel="Open the crew's public page"
          shots={shots}
          corner={
            <>
              <CrewEditButton crew={crew} header={header} />
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
          <EntityBand figures={<Figure n={followers} label="Followers" testId="crew-followers" />} styles={[crew.style]} styleAria={(s) => `${s} — the crew's style`} />
        </IdentityHero>

        <div style={{ position: "relative", zIndex: 1, background: LILAC, margin: "12px 0" }}>
          <ToolsHead kind="crew" />
          <ToolGrid tiles={tiles} />
        </div>
      </div>
    </div>
  );
}
