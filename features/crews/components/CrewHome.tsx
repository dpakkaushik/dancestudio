import Link from "next/link";
import { ToolGrid, ToolsHead, type Tile } from "@/features/home/components/home-kit";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { HeroDot, IdentityHero } from "@/features/profiles/components/hero-kit";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { StatsChip } from "@/features/profiles/components/StatsChip";
import { EyeIcon, cornerChip } from "@/features/profiles/components/profile-kit";
import { DOS_TOOLS } from "@/features/tenants/components/biz-kit";
import { DOS_UI, INK, LILAC } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { CREW_GRAD, type Crew, type CrewEntry, type CrewMember } from "@/types/crew";

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
 *  A crew has a photo and no header pictures, so the rail above the disc is the
 *  quiet gradient square; the leader changes the photo from here (the desk used
 *  to carry the picker — the identity belongs on the home). */
export function CrewHome({ crew, members, entries, todayKey }: { crew: Crew; members: CrewMember[]; entries: CrewEntry[]; todayKey: string }) {
  const confirmed = members.filter((m) => m.status === "confirmed").length;
  const asked = members.filter((m) => m.status === "asked").length;
  const upcoming = entries.filter((e) => e.endDate >= todayKey && e.eventStatus !== "completed").length;
  const tiles: Tile[] = [
    { name: DOS_TOOLS.team.name, href: `/crews/${crew.id}/manage/team`, k: "team", c: DOS_TOOLS.team.c },
    { name: DOS_TOOLS.events.name, href: `/crews/${crew.id}/manage/events`, k: "events", c: DOS_TOOLS.events.c },
  ];
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, boxSizing: "border-box", paddingBottom: "var(--dos-foot)" }}>
      <div style={{ padding: "0 16px" }}>
        <IdentityHero
          testId="crew-hero"
          name={crew.name}
          grad={CREW_GRAD}
          tint={CREW_GRAD[1]}
          eyebrow="Crew"
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
          styles={[crew.style]}
          styleAria={(s) => `${s} — the crew's style`}
          avatar={photoUrl(crew.photo)}
          avatarAlt={crew.name}
          shots={[]}
          corner={
            <Link href={`/crew/${crew.id}`} aria-label="Public view" style={cornerChip}>
              <EyeIcon />
            </Link>
          }
        >
          {/* the leader is the only person who may change the crew, so the picker is theirs */}
          <div style={{ marginTop: 12 }}>
            <PhotoPicker owner={{ kind: "crew", id: crew.id }} hasPhoto={Boolean(crew.photo)} label="Change the crew photo" />
          </div>
        </IdentityHero>

        <div style={{ position: "relative", zIndex: 1, background: LILAC, margin: "12px 0" }}>
          <ToolsHead kind="crew" />
          <ToolGrid tiles={tiles} />
        </div>
      </div>
    </div>
  );
}
