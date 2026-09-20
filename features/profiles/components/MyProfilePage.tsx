"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { dosStyleColor } from "@/lib/constants/styles";
import { handleOf, isPlatform, safeHref } from "@/lib/constants/socials";
import { CARD, DOS_UI, INK, LILAC, MUTED, PINK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { PublicPerson } from "@/repositories/publicPerson";
import type { FollowedCrew, FollowedOrganization, PersonFollowRow } from "@/repositories/follows";
import { CREW_ROLE_WORD } from "@/types/crew";
import type { FollowedTenant } from "@/types/follow";
import { KIND_WORD, heroMetaWords, kindOf, memberNoWords } from "@/types/profile";
import { ProfileShare } from "./ProfileShare";
import { StatsChip } from "./StatsChip";
import { SettingsSheet } from "@/features/settings/components/SettingsSheet";
import type { ArtistPlan } from "@/repositories/plans";
import type { Tenant } from "@/types/tenant";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { HeroShot } from "./HeroRail";
import { HeroId, HeroPlace, IdentityHero } from "./hero-kit";
import { CHIP_ROW, FIGURE_ROW, LINKS_ROW, STYLES_ROW, figureLabel, figureNum, linkChip } from "./profile-band";
import { EyeIcon, Group, PlatformIcon, ROLE_RING, RoleBadge, Row, Sheet, cornerChip, followTint, initialsOf, type FollowGlyph } from "./profile-kit";

/** THE PROFILE TAB — prototype S_profiletab's OWN render (10565-11400), lifted
 *  whole: the profile lit like a player (the role's colour bleeding off the top;
 *  since 15 Sep 2026 the HEADER PICTURES across the top and the round DISC with
 *  the ＋ on its rim — `IdentityHero`, the one every profile page wears), the
 *  three controls top right (Edit, Public view — Share is the QR beside the
 *  name), WHO in the order you read a person (the role and
 *  the account number, the name, "24, New Delhi", then the figures — Followers,
 *  Following, and where you stand in the metal it earned), THE BAND UNDER THE
 *  NAME in three parts (the styles with ＋, the links rail with ＋ Add link, About
 *  as prose), the two big white buttons (Stats · Schedule), and the people
 *  groups each headed with a count (Crews · Teaches at · Runs). The sheets are
 *  the prototype's: Edit profile, Add a dance style, Add a social link, one
 *  platform's editor, and the Followers / Following list with its segments.
 *
 *  What is real: every figure is a row this app keeps. Deliberately absent,
 *  each with a backlog row: the verified tick (nobody performs a verification),
 *  the albums grid and its tab strip (an albums slice), Call (a person holds no
 *  number), and the long-press-for-QR gesture (the QR is a button). */

const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

/* the Following sheet's segments (11336), in the words for the kinds we have —
   Organizations and Crews joined on 19 Sep 2026, when both became followable */
const FOLLOW_SEGS = ["All", "Users", "Artists", "Organizations", "Studios", "Crews"] as const;
type FollowSeg = (typeof FOLLOW_SEGS)[number];


export function MyProfilePage({
  person,
  header = [],
  followers,
  followingPeople,
  followingTenants,
  followingOrgs = [],
  followingCrews = [],
  scheduleHref,
  business,
  businesses = [],
  plan,
  isAdmin = false,
  gstVerified = false,
}: {
  person: PublicPerson;
  /** THE HEADER PICTURES (15 Sep 2026): the person's own, in their order */
  header?: HeaderPhoto[];
  /** how many the kind allows. ⚠ NOT READ HERE since 19 Sep 2026 — the pictures
   *  are added and removed behind the disc on HOME, and this page only shows
   *  them; the prop stays so the route can keep handing one number to both. */
  headerMax?: number;
  followers: PersonFollowRow[];
  followingPeople: PersonFollowRow[];
  followingTenants: FollowedTenant[];
  /** the organizations and the crews this person follows (19 Sep 2026) — two more segments of the Following sheet */
  followingOrgs?: FollowedOrganization[];
  followingCrews?: FollowedCrew[];
  scheduleHref: string | null;
  /** the first business this person runs, for the rows that live on its desk */
  business: Tenant | null;
  /** every business this account runs — an ORGANIZATION's studios, under one hood (8 Sep 2026) */
  businesses?: Tenant[];
  /** the Artist plan, for the settings sheet's switch */
  plan: ArtistPlan | null;
  /** a platform admin gets the verification queue as a row in the settings sheet */
  isAdmin?: boolean;
  /** an organization's GST number — the settings sheet's GST row says whether
   *  it is verified (11 Sep 2026); false for anybody who is not one */
  gstVerified?: boolean;
}) {
  const router = useRouter();
  const { profile } = person;
  /* the KIND is the plan's answer as much as the role's: an artist while the plan is live */
  const kind = kindOf(profile.role, Boolean(plan?.active));
  const ring = ROLE_RING[kind];
  const RC = ring[1];
  /* the one sentence both screens print under the name (19 Sep 2026) */
  const metaLine = heroMetaWords(profile.age, profile.city);
  const face = photoUrl(profile.avatarPath);
  /* the header, shown and nothing else: adding and removing moved into the
     Edit-profile sheet on 16 Sep 2026, at the user's instruction */
  const shots: HeroShot[] = header
    .filter((h) => h.url)
    .map((h, i) => ({ key: h.id, src: h.url as string, alt: `Header picture ${i + 1} of ${profile.fullName}` }));
  const followingN = followingPeople.length + followingTenants.length + followingOrgs.length + followingCrews.length;
  /* an organization has a page of its own since 18 Sep 2026 (/org/{id}, R23) and
     CAN be followed since 19 Sep 2026 — it still follows nobody and dances
     nothing, so its figures are its studios and its followers */
  const isOrg = profile.role === "org";

  const [followList, setFollowList] = useState<"followers" | "following" | null>(null);
  /* the gear arrives as ?settings=1 (prototype 19263). The sheet is a PLACE, so
      the address is its open state — a state seeded at mount would never see the
      gear, because the gear links to the page it is already on. */
  const settingsOpen = useSearchParams().get("settings") === "1";
  const [followSeg, setFollowSeg] = useState<FollowSeg>("All");
  /* ⚠ NO TOAST ON THIS PAGE ANY MORE (19 Sep 2026): every sheet that had
     something to say moved to Home, and the Settings sheet carries its own */

  const styleList = profile.styles;
  const socials = profile.socials;
  /* the two association groups are STUDIOS — an artist page is not a page (R24) */
  const studiosTaughtAt = person.teachesAt.filter((t) => t.tenantType === "studio");
  const studiosRun = person.runs.filter((t) => t.tenantType === "studio");
  /* ⚠ NO RANK ON THE PROFILE TAB (19 Sep 2026, the user: "remove rank from
     profile tab"). Where you stand is the Stats chip's own screen, which prints
     the place WITH its population — a bare "#4" beside two follower counts said
     less than it implied. `my_chart_place` is no longer read for this page. */

  const bigWhite: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 12, fontWeight: 900, fontSize: 12.5, boxSizing: "border-box", padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden", background: "var(--text)", color: "var(--solid)", border: "1.5px solid var(--text)", textDecoration: "none" };
  /* one declaration, in profile-band.tsx (20 Sep 2026) */
  const chip = linkChip;

  const followRows: Array<{ key: string; href: string; name: string; kind: string; glyph: FollowGlyph; tint: string; face: string | null; initials: string }> =
    followList === "followers"
      ? followers.map((f) => ({ key: f.followId, href: `/person/${f.userId}`, name: f.name, kind: kindOf(f.role, f.isArtist), glyph: kindOf(f.role, f.isArtist) as FollowGlyph, tint: followTint(kindOf(f.role, f.isArtist)), face: photoUrl(f.avatarPath), initials: initialsOf(f.name) }))
      : [
          ...followingPeople.map((f) => ({ key: f.followId, href: `/person/${f.userId}`, name: f.name, kind: kindOf(f.role, f.isArtist), glyph: kindOf(f.role, f.isArtist) as FollowGlyph, tint: followTint(kindOf(f.role, f.isArtist)), face: photoUrl(f.avatarPath), initials: initialsOf(f.name) })),
          ...followingTenants.map((t) => ({ key: t.followId, href: `/${t.tenantType === "studio" ? "studio" : "artist"}/${t.tenantId}`, name: t.tenantName, kind: t.tenantType === "studio" ? "studio" : "artist", glyph: (t.tenantType === "studio" ? "org" : "artist") as FollowGlyph, tint: followTint(t.tenantType === "studio" ? "studio-biz" : "artist-biz"), face: null, initials: initialsOf(t.tenantName) })),
          /* the organizations and the crews (19 Sep 2026) — each row opens its own page */
          ...followingOrgs.map((o) => ({ key: o.followId, href: `/org/${o.orgId}`, name: o.name, kind: "organization", glyph: "org" as FollowGlyph, tint: followTint("org"), face: photoUrl(o.photoPath), initials: initialsOf(o.name) })),
          ...followingCrews.map((c) => ({ key: c.followId, href: `/crew/${c.crewId}`, name: c.name, kind: "crew", glyph: "crew" as FollowGlyph, tint: followTint("crew"), face: photoUrl(c.photo), initials: initialsOf(c.name) })),
        ];
  const segOf = (kind: string): FollowSeg => (kind === "user" ? "Users" : kind === "artist" ? "Artists" : kind === "organization" ? "Organizations" : kind === "crew" ? "Crews" : "Studios");
  const shownFollowRows = followRows.filter((r) => followSeg === "All" || segOf(r.kind) === followSeg);

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <style>{`@keyframes dosSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div style={{ padding: "0 16px" }}>
        {/* ── THE PROFILE, LIT LIKE A PLAYER (10574) — the one hero every profile page wears ── */}
        <IdentityHero
          testId="my-hero"
          name={profile.fullName}
          grad={ring}
          tint={RC}
          eyebrow={KIND_WORD[kind]}
          /* the account number reads under the word that names the account
             (18 Sep 2026) — it sat under the styles until today */
          eyebrowSub={<HeroId>{memberNoWords(profile.memberNo)}</HeroId>}
          verified={Boolean(profile.verifiedAt)}
          /* ⚠ THE SAME SENTENCE HOME PRINTS — "20 Yrs · Gurugram", built by
             `heroMetaWords` (19 Sep 2026). This screen used to hand `PlaceLink`
             a `prefix` of "20, " while Home joined its own string with a comma,
             so the two wrote the same fact two ways. */
          meta={
            metaLine ? (
              profile.city ? <HeroPlace text={metaLine} query={profile.city} /> : <span style={{ fontVariantNumeric: "tabular-nums" }}>{metaLine}</span>
            ) : null
          }
          avatar={face}
          avatarAlt={profile.fullName}
          /* ── THE DISC IS THE DOOR TO THE PAGE (19 Sep 2026, the user: "clicking
             on profile photo on any home tab should take to the profile page for
             that user"). One address per kind, the same one the eye and the QR
             carry — so every way into a profile lands on the same page. ── */
          avatarHref={isOrg ? `/org/${profile.id}` : `/person/${profile.id}`}
          /* the corner's eye is "Public view"; the disc names the page it opens */
          avatarLabel="Open your public page"
          /* both pictures are changed in Edit profile (16 Sep 2026) — the
             pencil below, not a ＋ on the disc and a ✕ on each header square */
          shots={shots}
          /* ── THE THREE CONTROLS, TOP RIGHT (10613) — Share is the QR beside the name ── */
          /* ⚠ NO PENCIL HERE ANY MORE (19 Sep 2026, the user: "all edit profile
             options to be removed from home and profile pages") — Edit profile
             is Settings' first option, behind the gear in the top bar. What is
             left in the corner is the eye: "Public view" — the page as a
             stranger reads it (/org/{id} for an organization, /person/{id} for
             anybody else). */
          corner={
            <Link href={isOrg ? `/org/${profile.id}` : `/person/${profile.id}`} aria-label="Public view" style={cornerChip}>
              <EyeIcon />
            </Link>
          }
        >
          {/* ── THE THREE FIGURES, AT THE SIZE OF FIGURES (10683) ── */}
          <div style={FIGURE_ROW}>
              {isOrg ? (
                /* an organization's figures are its studios and — since it can be
                   followed (19 Sep 2026) — its followers; it follows nobody and stands on no board */
                <>
                  <Link href="/business" aria-label={`${businesses.length} ${businesses.length === 1 ? "studio" : "studios"} — open the hub`} style={{ textDecoration: "none", textAlign: "left" }}>
                    <span style={figureNum}>{businesses.length}</span>
                    <span style={figureLabel}>{businesses.length === 1 ? "Studio" : "Studios"}</span>
                  </Link>
                  <button type="button" aria-label={`${followers.length} followers`} onClick={() => { setFollowSeg("All"); setFollowList("followers"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    <span data-testid="my-followers" style={figureNum}>{followers.length}</span>
                    <span style={figureLabel}>Followers</span>
                  </button>
                </>
              ) : (
                <>
              <button type="button" aria-label={`${followers.length} followers`} onClick={() => { setFollowSeg("All"); setFollowList("followers"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <span data-testid="my-followers" style={figureNum}>{followers.length}</span>
                <span style={figureLabel}>Followers</span>
              </button>
              <button type="button" aria-label={`${followingN} following`} onClick={() => { setFollowSeg("All"); setFollowList("following"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <span style={figureNum}>{followingN}</span>
                <span style={figureLabel}>Following</span>
              </button>
                </>
              )}
            {/* the chips at the row's right edge (20 Sep 2026) — the QR that
                shares the page a stranger reads (an organization's own since
                18 Sep) and the Stats chip beside it. No Follow bell: this is
                your own profile, and you do not follow yourself. */}
            <div style={CHIP_ROW}>
              <ProfileShare path={isOrg ? `/org/${profile.id}` : `/person/${profile.id}`} name={profile.fullName} />
              <StatsChip href={isOrg ? "/business/stats" : "/stats"} />
            </div>
          </div>

          {/* ⚠ THE STYLES AND THE LINKS ARE INSIDE THE HERO, EXACTLY AS THEY ARE
              ON HOME (19 Sep 2026, the user: "Hometab from Top to Social media
              links should look same on profile").
              They sat OUTSIDE it until today — on the plain page background,
              below the hero's wash — while Home draws the same two rows inside
              it as part of `HomeBand`. That one difference is what made the two
              screens read as different profiles: same content, a different
              surface under it, and the eye reads the surface first. Now both
              run from the top of the wash down to the last link.
              They are still SHOWN here and CHANGED on Home (the user's earlier
              rule), so these two rows carry no ＋ — a style edited in two places
              is a style that disagrees with itself. */}
          {isOrg ? null : styleList.length ? (
            <div style={STYLES_ROW}>
              {styleList.map((s) => (
                <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={`${s} — one of your styles`} small />
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 11.5, color: SUB, fontWeight: 700 }}>The styles you dance are added on Home.</div>
          )}

          {/* THE LINKS, DIRECTLY UNDER THE STYLES (10760) — the user's own order */}
          {isOrg && !socials.length ? null : socials.length ? (
            <div style={LINKS_ROW}>
              {socials.map((l) => (
                <a key={l.platform} href={safeHref(l.url) ?? undefined} target="_blank" rel="noreferrer" aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`} style={{ ...chip, textDecoration: "none" }}>
                  <span style={{ flexShrink: 0, lineHeight: 0 }}><PlatformIcon label={l.platform} size={15} /></span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: PINK }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
                </a>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 11.5, color: SUB, fontWeight: 700 }}>Your links are added on Home.</div>
          )}
        </IdentityHero>

        <div style={{ textAlign: "left" }}>
          {/* ⚠ THE ABOUT BLOCK IS GONE (20 Sep 2026, the user: "about and bio for
              profiles need to go away"). The field left both Edit sheets the day
              before, which left this screen printing a heading over a prompt to
              go and fill a box that no longer exists — and then the column went
              too (`20260920160000_the_bio_is_gone`), so there is nothing to read.
              `events.about` is a different column and is untouched. */}

          {/* THE PLACE THIS PROFILE GOES (10905): the prototype drew Stats · Schedule
              as two big white buttons; Stats is the chip beside the QR in the hero
              since 18 Sep 2026 (the user's ask), so only Schedule is left here, and
              only when there is a schedule to open */}
          {scheduleHref ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
              <Link href={scheduleHref} aria-label="Schedule" style={bigWhite}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="16" rx="3" /><path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" /></svg>
                Schedule
              </Link>
            </div>
          ) : null}
        </div>

        {/* ── THE PEOPLE, IN ONE LANGUAGE (10990): a row per person, each group headed with a count ── */}
        {/* an ORGANIZATION's studios, under one hood (8 Sep 2026): every one it runs, public or
            not yet, each a door to its desk. Nobody else sees this list — they see each studio
            on its own page, and never the organization behind it. */}
        {isOrg ? (
          <Group title="Your studios" n={businesses.length}>
            {businesses.map((t) => (
              <Row key={t.id} href={`/business/${t.id}/classes`} markName={t.name} photo={t.photoPath ? photoUrl(t.photoPath) : null} title={t.name} sub={[t.area, t.city].filter(Boolean).join(", ") || "Studio"} right={t.verifiedAt ? "Verified" : "Not verified yet"} />
            ))}
            <Row href="/business" title="＋ Add studio" sub={businesses.length === 0 ? "Your first studio is opened from the hub" : "Opened from the hub — the same organization, another address"} />
          </Group>
        ) : null}
        {person.crews.length ? (
          <Group title="Crews" n={person.crews.length}>
            {person.crews.map((c) => (
              <Row key={c.crewId} href={`/crew/${c.crewId}`} markName={c.name} title={c.name} sub={`${c.style} · ${c.city} · since ${sinceWords(c.since)}`} right={c.role === "leader" ? "Leads this crew" : CREW_ROLE_WORD[c.role]} />
            ))}
          </Group>
        ) : null}
        {/* ── ONE PAGE PER PROFILE (19 Sep 2026, the user: "there should be only
            one way to view these pages"). An artist's public face IS this
            profile (R24), so their own artist page is not a second thing to
            open: STUDIOS is what "Teaches at" lists, and "Runs" names the
            studios they run. The `artist_page` row is still what every class,
            ask and payout hangs off — it is simply never a destination. ── */}
        {studiosTaughtAt.length ? (
          <Group title="Teaches at" n={studiosTaughtAt.length}>
            {studiosTaughtAt.map((t) => (
              <Row key={t.tenantId} href={`/studio/${t.tenantId}`} markName={t.tenantName} title={t.tenantName} sub={[t.kinds, `${t.classes} class${t.classes === 1 ? "" : "es"}`, t.city].filter(Boolean).join(" · ")} />
            ))}
          </Group>
        ) : null}
        {!isOrg && studiosRun.length ? (
          <Group title="Runs" n={studiosRun.length}>
            {studiosRun.map((t) => (
              <Row key={t.tenantId} href={`/studio/${t.tenantId}`} markName={t.tenantName} photo={t.photoPath ? photoUrl(t.photoPath) : null} title={t.tenantName} sub={["Studio", t.city].filter(Boolean).join(" · ")} />
            ))}
          </Group>
        ) : null}

        {/* Log out is in the Settings sheet, where the prototype keeps it (11416) —
            the gear in the top bar opens it from anywhere. */}
      </div>

      {/* ⚠ FOUR SHEETS LEFT THIS PAGE ON 19 Sep 2026 — Edit profile (11364) is
          Settings' first option now, and the styles (11217), the links (11161)
          and one platform's own editor (11140) are Home's band (`HomeBand`).
          Nothing was redrawn: they moved. */}
      {/* ── Followers / Following list — segregated by account type (11335) ── */}
      {followList ? (
        <Sheet label={followList === "followers" ? "Followers" : "Following"} onClose={() => setFollowList(null)} maxHeight="78vh">
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 14 }}>
            <b style={{ fontSize: 18 }}>{followList === "followers" ? "Followers" : "Following"}</b>
            <span style={{ fontSize: 13, color: SUB, fontWeight: 700 }}>{followRows.length}</span>
          </div>
          <div style={{ display: "flex", gap: 5, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none" }}>
            {FOLLOW_SEGS.map((s) => (
              <button type="button" key={s} onClick={() => setFollowSeg(s)} aria-pressed={followSeg === s} style={{ flex: "0 0 auto", textAlign: "center", padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", background: followSeg === s ? PINK : CARD, color: followSeg === s ? "#fff" : SUB, border: "none", fontFamily: "inherit", boxShadow: followSeg === s ? "0 3px 10px rgba(90,200,250,.35)" : "none" }}>{s}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shownFollowRows.map((r) => (
              <Link key={r.key} href={r.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16, background: `${r.tint}12`, border: `1px solid ${r.tint}30`, color: INK, textDecoration: "none" }}>
                <span style={{ position: "relative", flexShrink: 0 }}>
                  <span style={{ width: 46, height: 46, borderRadius: 23, display: "flex", overflow: "hidden", background: `linear-gradient(135deg,${r.tint},${r.tint}88)`, alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 17 }}>
                    {r.face ? <Image src={r.face} alt="" width={46} height={46} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : r.initials}
                  </span>
                  <RoleBadge kind={r.glyph} tint={r.tint} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 750, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: r.tint, fontWeight: 700, textTransform: "capitalize" }}>{r.kind}</span>
                </span>
                <span style={{ fontSize: 16, color: MUTED }}>›</span>
              </Link>
            ))}
            {shownFollowRows.length === 0 ? <div style={{ fontSize: 12, color: SUB, padding: "8px 2px" }}>{followList === "followers" ? "Nobody follows you yet." : "You follow nobody here yet."}</div> : null}
          </div>
        </Sheet>
      ) : null}

      <SettingsSheet
        open={settingsOpen}
        /* THE SHEET'S HISTORY ENTRY IS THE GEAR'S OWN (19 Sep 2026): the gear
           PUSHES `/profile?settings=1`, so closing is one step BACK — the same
           step the system gesture takes — and never a replace over it. The
           replace left `?settings=1` standing one entry back, so back re-opened
           Settings and closing it again landed on a second, identical /profile:
           the "page keeps looping" the user reported. A deep link with nothing
           behind it is the one case that has to replace instead. */
        onClose={() => {
          if (window.history.length > 1) router.back();
          else router.replace("/profile");
        }}
        role={profile.role}
        /* EDIT PROFILE IS ITS FIRST OPTION (19 Sep 2026) */
        profile={profile}
        isAdmin={isAdmin}
        gstVerified={gstVerified}
        business={business}
        plan={plan}
      />

    </div>
  );
}
