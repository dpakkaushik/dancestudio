"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CARD, DOS_UI, INK, LILAC, MUTED, PINK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { MembershipOnSale } from "@/repositories/memberships";
import type { PublicPerson } from "@/repositories/publicPerson";
import type { FollowedCrew, FollowedOrganization, PersonFollowRow } from "@/repositories/follows";
import type { FollowedTenant } from "@/types/follow";
import { KIND_WORD, heroMetaWords, kindOf, memberNoWords } from "@/types/profile";
import { PersonBody } from "./PersonBody";
import { ActionRow, CallButton, LocationButton, MailButton, mapsPinHref } from "./ContactButtons";
import { EnquiryButton } from "@/features/enquiries/components/EnquirySheet";
import { ProfileLink, ProfileShare } from "./ProfileShare";
import { StatsChip } from "./StatsChip";
import { SettingsSheet } from "@/features/settings/components/SettingsSheet";
import type { ArtistPlan } from "@/repositories/plans";
import type { Tenant } from "@/types/tenant";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { HeroShot } from "./HeroRail";
import { HeroId, HeroPlace, IdentityHero } from "./hero-kit";
import { EntityBand, figureLabel, figureNum } from "./profile-band";
import { Group, ROLE_RING, RoleBadge, Row, Sheet, followTint, initialsOf, type FollowGlyph } from "./profile-kit";

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
 *  number), and the long-press-for-QR gesture (the QR is a button).
 *
 *  ⚠ THE BAND AND EVERYTHING UNDER IT ARE SHARED WITH /person/{id} SINCE
 *  20 Sep 2026 — `EntityBand` and `PersonBody`. This screen used to draw both
 *  itself, which is why the two kept diverging; `PersonBody`'s own comment lists
 *  the five ways they had. What is left here is what only your own tab has: the
 *  Settings sheet, the two follow lists behind the figures, the eye in the
 *  corner, and an organization's own studios. */

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
  memberships = [],
  trainsAt = [],
  eventsHostId = null,
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
  /** what this artist has ON SALE (20 Sep 2026) — the public page has shown it
   *  since 19 Sep and this one showed nothing, which is one of the five ways the
   *  two screens had drifted */
  memberships?: MembershipOnSale[];
  /** ⚠ THE **TRAIN** GROUP, AND IT IS THIS SCREEN'S ALONE (21 Sep 2026) — a
   *  booking is private, so where somebody has taken classes is drawn on their
   *  own tab and never on the public page `PersonBody` also serves. */
  trainsAt?: Tenant[];
  /** an ORGANIZATION's own event-hosting row (R15) — where an enquiry to it
   *  lands, and the one id the button row needs that `person` cannot carry */
  eventsHostId?: string | null;
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
  /* the button row's three questions, asked exactly as `/person/{id}` asks them
     (21 Sep 2026): an artist's Call is their own switch, a plain user's row is
     not drawn at all, and an enquiry names a BUSINESS — the artist page behind
     them, or an organization's hosting row — because `send_enquiry` takes no
     person (R24, R15) */
  const isArtist = kind === "artist";
  const isPlainUser = !isOrg && !isArtist;
  /* ⚠ an ORGANIZATION's asks go to its own HOSTING row (R15), which is NOT an
     artist page and is not in `person` — the route reads it and hands it over,
     the same id Home already asks for */
  const asksGoHere = isOrg ? eventsHostId : isArtist ? person.artistPageId : null;

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
  /* ⚠ NO RANK ON THE PROFILE TAB (19 Sep 2026, the user: "remove rank from
     profile tab"). Where you stand is the Stats chip's own screen, which prints
     the place WITH its population — a bare "#4" beside two follower counts said
     less than it implied. `my_chart_place` is no longer read for this page. */

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
          /* ⚠⚠ NO CORNER AT ALL (21 Sep 2026). The pencil went to Settings on
             19 Sep, and the eye goes now: asked whether the Profile tab and a
             profile page are the same thing, the user's reading is that they
             are — and under it "no top right button required on profile pages"
             covers this screen too.
             ⚠ NOTHING IS LOST, which is the only reason it may go (C31): the
             DISC directly above is already that door and says so — its
             accessible name is "Open your public page", which is plainer than a
             glyph called "Public view" — and the Share chip in the figures row
             sends the same address. The eye was a SECOND door to one page, on a
             screen that also had a third. So the rule is now one sentence with
             no exception: a corner exists on a HOME and points at the Profile
             tab; no profile surface has one. */
        >
          {/* ── THE BAND — `EntityBand`, THE ONE EVERY OTHER PROFILE DRAWS
              (20 Sep 2026, the user: "FIX IT PERMANENTLY").
              This screen hand-wrote the figures row, the styles row and the links
              row, so their spacing, their order and their empty states were its
              own — and a fix to the shared component reached the other four
              screens and never this one. The FIGURES are still buttons here,
              because on your own tab they open your lists; everything about how
              they are SET comes from the shared file. ── */}
          <EntityBand
            figures={
              <>
                {/* an organization's first figure is what it actually has: its
                    studios, a door to the hub. Followers and Following follow,
                    exactly as they do for a person (20 Sep 2026: an organization
                    follows now, so the second figure means something). */}
                {isOrg ? (
                  <Link href="/business" aria-label={`${businesses.length} ${businesses.length === 1 ? "studio" : "studios"} — open the hub`} style={{ textDecoration: "none", textAlign: "left" }}>
                    <span style={figureNum}>{businesses.length}</span>
                    <span style={figureLabel}>{businesses.length === 1 ? "Studio" : "Studios"}</span>
                  </Link>
                ) : null}
                <button type="button" aria-label={`${followers.length} followers`} onClick={() => { setFollowSeg("All"); setFollowList("followers"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <span data-testid="my-followers" style={figureNum}>{followers.length}</span>
                  <span style={figureLabel}>Followers</span>
                </button>
                {/* ⚠ AN ORGANIZATION HAS THIS FIGURE NOW (20 Sep 2026, the user:
                    "Organization and Studio still dont have Following section in
                    profile and home"). It was withheld because R11 made an
                    organization follow nothing; asked which way to take it the
                    user chose to let it really follow, so
                    `20260920180000_an_organization_follows` lifts the refusal in
                    the three doors and this figure counts real rows. */}
                <button type="button" aria-label={`${followingN} following`} onClick={() => { setFollowSeg("All"); setFollowList("following"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                  <span data-testid="my-following" style={figureNum}>{followingN}</span>
                  <span style={figureLabel}>Following</span>
                </button>
              </>
            }
            /* the chips at the row's right edge (20 Sep 2026) — the QR that
               shares the page a stranger reads (an organization's own since
               18 Sep) and the Stats chip beside it. No Follow bell: this is
               your own profile, and you do not follow yourself. */
            chips={
              <>
                {/* FOLLOW · STATS · QR · SHARE (21 Sep 2026) — no bell here,
                    because this screen is only ever your own */}
                <StatsChip href={isOrg ? "/business/stats" : "/stats"} />
                <ProfileShare path={isOrg ? `/org/${profile.id}` : `/person/${profile.id}`} name={profile.fullName} />
                <ProfileLink path={isOrg ? `/org/${profile.id}` : `/person/${profile.id}`} name={profile.fullName} />
              </>
            }
            /* an organization dances no style of its own — what it runs does */
            styles={isOrg ? [] : styleList}
            styleAria={(s) => `${s} — one of your styles`}
            /* ⚠ WHATSAPP IS OFF THE PUBLISHED RAIL, HERE TOO (20 Sep 2026): the
               public page has filtered it since the rail was built — "a number is
               not a public handle" (10778) — and this screen did not, so your own
               tab and your own public page listed different links. This tab is
               the published view of yourself; the link is still yours to edit on
               Home, where every platform is shown. */
            socials={isOrg ? socials : socials.filter((l) => l.platform !== "WhatsApp")}
          >
            {/* THE ONE THING THIS SCREEN SAYS THAT THE PUBLIC ONE CANNOT: where a
                row is filled in. Drawn only when a row is EMPTY, so a profile
                with styles and links is pixel-for-pixel its own public page. */}
            {isOrg || styleList.length ? null : <div style={{ marginTop: 12, fontSize: 11.5, color: SUB, fontWeight: 700 }}>The styles you dance are added on Home.</div>}
            {socials.length ? null : <div style={{ marginTop: 8, fontSize: 11.5, color: SUB, fontWeight: 700 }}>Your links are added on Home.</div>}
          </EntityBand>
        </IdentityHero>

        {/* ⚠ THE ABOUT BLOCK IS GONE (20 Sep 2026, the user: "about and bio for
            profiles need to go away"). The column went too
            (`20260920160000_the_bio_is_gone`), so there is nothing to read. */}

        {/* ── THE BUTTONS ABOVE SCHEDULE (21 Sep 2026, the user: "buttons above
            schedule should also be visible on the home tab in the same way as
            profile"). They asked for Home, and this tab is the third surface
            drawing the same person — leaving it as the only one WITHOUT the row
            would recreate, on the same screen, the very difference they have
            reported three times (C32). One row, three places, from the same
            fields. ⚠ Enquiry is drawn and disabled with its reason, as on your
            own public page. ── */}
        <ActionRow marginTop={12}>
          {asksGoHere ? (
            <EnquiryButton
              tenantId={asksGoHere}
              tenantName={profile.fullName}
              tenantType={isOrg ? "org" : "artist_page"}
              signedIn
              accent={RC}
              cannotAsk="This is your own page — enquiries come to you here"
            />
          ) : null}
          {profile.phone && (isOrg || (isArtist && profile.phonePublic)) ? <CallButton phone={profile.phone} /> : null}
          {!isPlainUser && profile.contactEmail ? <MailButton email={profile.contactEmail} /> : null}
          {isOrg && profile.lat != null && profile.lng != null ? (
            <LocationButton href={mapsPinHref(profile.lat, profile.lng)} />
          ) : isOrg && profile.city ? (
            <LocationButton query={`${profile.fullName} ${profile.city}`} />
          ) : null}
        </ActionRow>

        {/* ── AND EVERYTHING BELOW IS `PersonBody`, THE VERY COMPONENT
            /person/{id} DRAWS (20 Sep 2026): **Schedule**, then what is on sale,
            then the associations in one language. What used to be here was the
            same facts under different headings — "Teaches at" and "Runs" where
            the public page said "Studios taught at" and "Studios associated
            with" — plus no memberships at all, and Schedule alone. That is the
            drift the user has now reported three times. ── */}
        <PersonBody
          person={person}
          isMe
          signedIn
          memberships={memberships}
          trainsAt={trainsAt}
          scheduleHref={scheduleHref}
          accent={RC}
          /* an organization's only seats are the owner rows on its own studios,
             and "Your studios" below lists those already — and more completely,
             because it carries the unlisted ones too */
          omitStudioSeats={isOrg}
          beforeGroups={
            /* an ORGANIZATION's studios, under one hood (8 Sep 2026): every one it
               runs, public or not yet, each a door to its desk. Nobody else sees
               this list — they see each studio on its own page, and never the
               organization behind it. */
            isOrg ? (
              <Group title="Your studios" n={businesses.length}>
                {businesses.map((t) => (
                  <Row key={t.id} href={`/business/${t.id}/classes`} markName={t.name} photo={t.photoPath ? photoUrl(t.photoPath) : null} title={t.name} sub={[t.area, t.city].filter(Boolean).join(", ") || "Studio"} right={t.verifiedAt ? "Verified" : "Not verified yet"} />
                ))}
                <Row href="/business" title="＋ Add studio" sub={businesses.length === 0 ? "Your first studio is opened from the hub" : "Opened from the hub — the same organization, another address"} />
              </Group>
            ) : null
          }
        />

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
