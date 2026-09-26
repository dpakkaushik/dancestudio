"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import { CARD, INK, MUTED, PINK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { FollowedCrew, FollowedOrganization, PersonFollowRow } from "@/repositories/follows";
import type { FollowedTenant } from "@/types/follow";
import { kindOf, type Profile, type SocialLink } from "@/types/profile";
import { LinksRowEditor } from "./LinksRowEditor";
import { CHIP_ROW, FIGURE_ROW, figureLabel, figureNum } from "./profile-band";
import { useRecordLists } from "./RecordLists";
import { StylesRowEditor } from "./StylesRowEditor";
import { RoleBadge, Sheet, followTint, initialsOf, type FollowGlyph } from "./profile-kit";

/** THE BAND UNDER THE NAME ON HOME — and the ONE place these three are edited
 *  (19 Sep 2026, the user: "Dance style for the page should also be editable
 *  only from the home tab … Remove rank from home and give social media tiles
 *  also on home and should be editable only from here … Social media Links right
 *  below Dance styles … show follower following also on home it should be
 *  clickable with list to see follower following list with profile type name and
 *  photo who is in the list").
 *
 *  Three parts in the order they were asked for: the two FIGURES, the STYLES
 *  with their ＋, and the LINKS directly under them with theirs. The sheets are
 *  the prototype's own (11217 · 11161 · 11140 · 11335) — the same ones the
 *  Profile tab drew, which is the point: they MOVED, they were not copied.
 *
 *  ⚠ THE STYLES ROW AND THE LINKS ROW ARE THE APP'S ONE EACH SINCE 26 Sep 2026
 *  (`StylesRowEditor`, `LinksRowEditor`) — a studio's, an organization's and a
 *  crew's home draw the same two, with their own door behind them. What is
 *  this file's is the person's door (`update_my_profile`, which takes the
 *  whole profile, so everything not being edited rides through unchanged) and
 *  the Followers / Following sheet.
 *
 *  ⚠ THE TWO ＋ APPEAR WITH THE PENCIL (26 Sep 2026): the home is read-only
 *  until the corner's Edit is pressed. */

const FOLLOW_SEGS = ["All", "Users", "Artists", "Organizations", "Studios", "Crews"] as const;
type FollowSeg = (typeof FOLLOW_SEGS)[number];

export function HomeBand({
  profile,
  chips = null,
  followers,
  followingPeople,
  followingTenants,
  followingOrgs,
  followingCrews,
}: {
  profile: Profile;
  /** the QR and Stats chips, at the right end of the figures row (20 Sep 2026) —
   *  they were a column in the hero until today; a Follow bell joins them on the
   *  pages that have one, and your own Home is not one of them */
  chips?: ReactNode;
  followers: PersonFollowRow[];
  followingPeople: PersonFollowRow[];
  followingTenants: FollowedTenant[];
  followingOrgs: FollowedOrganization[];
  followingCrews: FollowedCrew[];
}) {
  const router = useRouter();
  const { lists } = useRecordLists();
  const [followList, setFollowList] = useState<"followers" | "following" | null>(null);
  const [followSeg, setFollowSeg] = useState<FollowSeg>("All");

  const followingN = followingPeople.length + followingTenants.length + followingOrgs.length + followingCrews.length;

  /* ONE RECORD, ONE DOOR — the very action the Profile tab called for these
     fields; everything not named here rides through unchanged. ⚠ The database
     refuses a profile without a city (9 Sep 2026), so it is said first.
     ⚠ THE LIST NOT BEING EDITED COMES OFF `lists`, NEVER OFF THE PROP: the prop
     is the server's read at mount, and a link saved a moment after a style
     would carry the styles from before the style (the 26 Sep e2e find). */
  const save = async (next: { styles?: string[]; socials?: SocialLink[] }): Promise<string | null> => {
    if (!(profile.city ?? "").trim()) return "Add your city first — the pencil, then Edit details";
    const out = await updateMyProfileAction({
      fullName: profile.fullName,
      city: (profile.city ?? "").trim(),
      age: profile.age,
      socials: next.socials ?? lists.socials,
      styles: next.styles ?? lists.styles,
      phone: profile.phone ?? null,
    });
    if (!out.error) router.refresh();
    return out.error;
  };

  const followRows: Array<{ key: string; href: string; name: string; kind: string; glyph: FollowGlyph; tint: string; face: string | null; initials: string }> =
    followList === "followers"
      ? followers.map((f) => ({ key: f.followId, href: `/person/${f.userId}`, name: f.name, kind: kindOf(f.role, f.isArtist), glyph: kindOf(f.role, f.isArtist) as FollowGlyph, tint: followTint(kindOf(f.role, f.isArtist)), face: photoUrl(f.avatarPath), initials: initialsOf(f.name) }))
      : [
          ...followingPeople.map((f) => ({ key: f.followId, href: `/person/${f.userId}`, name: f.name, kind: kindOf(f.role, f.isArtist), glyph: kindOf(f.role, f.isArtist) as FollowGlyph, tint: followTint(kindOf(f.role, f.isArtist)), face: photoUrl(f.avatarPath), initials: initialsOf(f.name) })),
          ...followingTenants.map((t) => ({ key: t.followId, href: `/${t.tenantType === "studio" ? "studio" : "artist"}/${t.tenantId}`, name: t.tenantName, kind: t.tenantType === "studio" ? "studio" : "artist", glyph: (t.tenantType === "studio" ? "org" : "artist") as FollowGlyph, tint: followTint(t.tenantType === "studio" ? "studio-biz" : "artist-biz"), face: null, initials: initialsOf(t.tenantName) })),
          ...followingOrgs.map((o) => ({ key: o.followId, href: `/org/${o.orgId}`, name: o.name, kind: "organization", glyph: "org" as FollowGlyph, tint: followTint("org"), face: photoUrl(o.photoPath), initials: initialsOf(o.name) })),
          ...followingCrews.map((c) => ({ key: c.followId, href: `/crew/${c.crewId}`, name: c.name, kind: "crew", glyph: "crew" as FollowGlyph, tint: followTint("crew"), face: photoUrl(c.photo), initials: initialsOf(c.name) })),
        ];
  const segOf = (kind: string): FollowSeg => (kind === "user" ? "Users" : kind === "artist" ? "Artists" : kind === "organization" ? "Organizations" : kind === "crew" ? "Crews" : "Studios");
  const shownFollowRows = followRows.filter((r) => followSeg === "All" || segOf(r.kind) === followSeg);

  return (
    <>
      {/* ── THE TWO FIGURES, AND BOTH OPEN THEIR LIST (19 Sep 2026) ── */}
      <div style={FIGURE_ROW}>
        <button type="button" aria-label={`${followers.length} followers`} onClick={() => { setFollowSeg("All"); setFollowList("followers"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
          <span data-testid="home-followers" style={figureNum}>{followers.length}</span>
          <span style={figureLabel}>Followers</span>
        </button>
        <button type="button" aria-label={`${followingN} following`} onClick={() => { setFollowSeg("All"); setFollowList("following"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
          <span data-testid="home-following" style={figureNum}>{followingN}</span>
          <span style={figureLabel}>Following</span>
        </button>
        {chips ? <div style={CHIP_ROW}>{chips}</div> : null}
      </div>

      {/* ── THE STYLES, AND THE ONE ＋ THAT CHANGES THEM (DosStyleRow 1767) —
          `small`, at the size the three other profile screens share (20 Sep 2026) ── */}
      <StylesRowEditor
        canEdit
        aria={(s) => `${s} — one of your styles`}
        lastWords="A user names at least one style"
        emptyWords="The styles you dance go here."
        save={(next) => save({ styles: next })}
      />

      {/* ── THE LINKS, RIGHT BELOW THE STYLES (10760, and the user's own order) ── */}
      <LinksRowEditor canEdit save={(next) => save({ socials: next })} />

      {/* ── Followers / Following, by account type (11335) ── */}
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
              <Link key={r.key} href={r.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16, background: `${r.tint}12`, border: `1.5px solid ${r.tint}30`, color: INK, textDecoration: "none" }}>
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
    </>
  );
}
