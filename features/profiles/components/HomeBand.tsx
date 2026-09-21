"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import { dosStyleColor } from "@/lib/constants/styles";
import { PLATFORMS, handleOf, isPlatform } from "@/lib/constants/socials";
import { CARD, INK, LINE, MUTED, PINK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { FollowedCrew, FollowedOrganization, PersonFollowRow } from "@/repositories/follows";
import type { FollowedTenant } from "@/types/follow";
import { kindOf, type Profile, type SocialLink } from "@/types/profile";
import { CHIP_ROW, FIGURE_ROW, LINKS_ROW, STYLES_ROW, figureLabel, figureNum, linkChip } from "./profile-band";
import { StylesSheet } from "./StylesSheet";
import { PlatformIcon, RoleBadge, Sheet, dangerBtn, fieldInput, fieldLabel, followTint, initialsOf, sheetBtn, type FollowGlyph } from "./profile-kit";

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
 *  Profile tab drew, which is the point: they MOVED, they were not copied. The
 *  Profile tab shows all three and offers a control on none of them now, so a
 *  style is changed in ONE place, the way a picture has been since 16 Sep.
 *
 *  Where the rank was: gone. Where you stand is the Stats chip's own screen,
 *  which prints the place WITH its population — the Profile tab lost the same
 *  figure earlier the same day (row C20). */


const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

const FOLLOW_SEGS = ["All", "Users", "Artists", "Organizations", "Studios", "Crews"] as const;
type FollowSeg = (typeof FOLLOW_SEGS)[number];

function Arrows({ i, n, onMove }: { i: number; n: number; onMove: (dir: -1 | 1) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)} style={{ fontSize: 10, cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--el)" : "var(--sub)", lineHeight: 1, background: "none", border: "none", padding: 0 }}>▲</button>
      <button type="button" aria-label="Move down" disabled={i === n - 1} onClick={() => onMove(1)} style={{ fontSize: 10, cursor: i === n - 1 ? "default" : "pointer", color: i === n - 1 ? "var(--el)" : "var(--sub)", lineHeight: 1, background: "none", border: "none", padding: 0 }}>▼</button>
    </div>
  );
}

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
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [stylesOpen, setStylesOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linkEditor, setLinkEditor] = useState<{ platform: string; url: string; isNew: boolean } | null>(null);
  const [customDraft, setCustomDraft] = useState({ label: "", url: "" });
  const [followList, setFollowList] = useState<"followers" | "following" | null>(null);
  const [followSeg, setFollowSeg] = useState<FollowSeg>("All");

  const isOrg = profile.role === "org";
  const styleList = profile.styles;
  const socials = profile.socials;
  const followingN = followingPeople.length + followingTenants.length + followingOrgs.length + followingCrews.length;

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2600);
  };
  /* ONE RECORD, ONE DOOR — the very action the Profile tab called for these
     three fields; everything not named here rides through unchanged */
  const save = (next: { styles?: string[]; socials?: SocialLink[] }, said: string, after?: () => void) => {
    if (!(profile.city ?? "").trim()) {
      fire("Add your city first — Settings › Edit profile");
      return;
    }
    start(async () => {
      const out = await updateMyProfileAction({
        fullName: profile.fullName,
        city: (profile.city ?? "").trim(),
        age: profile.age,
        socials: next.socials ?? profile.socials,
        styles: next.styles ?? profile.styles,
        phone: profile.phone ?? null,
      });
      if (out.error) {
        fire(out.error);
        return;
      }
      after?.();
      fire(said);
      router.refresh();
    });
  };

  /* the chip is `linkChip` in profile-band.tsx now — it was declared here AND in
     MyProfilePage, which is how two screens drew the same row differently */
  const chip = linkChip;

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
        {/* ⚠ AN ORGANIZATION HAS THIS FIGURE NOW (20 Sep 2026, the user:
            "Organization and Studio still dont have Following section in profile
            and home"). It was withheld because R11 made an organization follow
            nothing — true until today, and the reason the figure would have read
            0 for ever. Asked which way to take it the user chose to let an
            organization really follow, and
            `20260920180000_an_organization_follows` removes the refusal from the
            three doors, so this counts rows rather than pretending. */}
        <button type="button" aria-label={`${followingN} following`} onClick={() => { setFollowSeg("All"); setFollowList("following"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
          <span data-testid="home-following" style={figureNum}>{followingN}</span>
          <span style={figureLabel}>Following</span>
        </button>
        {chips ? <div style={CHIP_ROW}>{chips}</div> : null}
      </div>

      {/* ── THE STYLES, AND THE ONE ＋ THAT CHANGES THEM (DosStyleRow 1767) ──
          ⚠ `small` AND `STYLES_ROW` SINCE 20 Sep 2026, and this row is why the
          user asked again. Home drew FULL-SIZE tiles here (12.5px on 7×13
          padding, gap 6, 14px above) while the Profile tab, a studio's home and
          a crew's home all drew the same styles `small` (11.5px on 6×11, gap 5,
          12px above) — so the one screen that was supposed to match the Profile
          tab was the only one that did not. Home moved rather than the other
          three: it is one screen against three, and the size the three share is
          `IdentityHero`'s own. The ＋ shrinks to 30px to sit on the shorter
          tile's line; its name is unchanged, so every locator still finds it. */}
      {isOrg ? null : (
        <div style={STYLES_ROW}>
          {styleList.map((s) => (
            <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={`${s} — one of your styles`} small />
          ))}
          <button type="button" aria-label="Add a dance style" onClick={() => setStylesOpen(true)} style={{ width: 30, height: 30, borderRadius: 10, background: "var(--el)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 15, fontWeight: 800, color: SUB, flexShrink: 0, border: "none", fontFamily: "inherit" }}>＋</button>
          {styleList.length === 0 ? <span style={{ fontSize: 11.5, color: SUB, fontWeight: 700 }}>The styles you dance go here.</span> : null}
        </div>
      )}

      {/* ── THE LINKS, RIGHT BELOW THE STYLES (10760, and the user's own order) ── */}
      <div style={LINKS_ROW}>
        {socials.map((l) => (
          <button type="button" key={l.platform} aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`} onClick={() => setLinkEditor({ platform: l.platform, url: l.url, isNew: false })} style={chip}>
            <span style={{ flexShrink: 0, lineHeight: 0 }}><PlatformIcon label={l.platform} size={15} /></span>
            <span style={{ fontSize: 12, fontWeight: 800, color: PINK }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
          </button>
        ))}
        <button type="button" aria-label="Add a link" onClick={() => setLinksOpen(true)} style={{ ...chip, background: "transparent", border: "1px dashed var(--el)", fontSize: 12, fontWeight: 800, color: SUB }}>＋ Add link</button>
      </div>

      {/* ── Add a dance style (11217) — the sheet itself moved into
          `StylesSheet.tsx` on 21 Sep 2026, when a STUDIO needed the same one.
          Everything specific to a person stays here: the door it writes through
          and the sentence under the last style. ── */}
      {stylesOpen ? (
        <StylesSheet
          styles={styleList}
          pending={pending}
          lastWords="A user names at least one style"
          onSave={(next, said) => save({ styles: next }, said)}
          onClose={() => setStylesOpen(false)}
        />
      ) : null}

      {/* ── Add a social link (11161) ── */}
      {linksOpen ? (
        <Sheet label="Add a social link" onClose={() => setLinksOpen(false)}>
          <b style={{ fontSize: 16 }}>Add a social link</b>
          <div style={{ fontSize: 12, color: SUB, margin: "4px 0 12px" }}>Drag order with ↑↓ · tap a platform below to add it.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {socials.map((l, i, arr) => (
              <div key={l.platform} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 14, background: CARD, border: `1.5px solid ${LINE}` }}>
                <Arrows i={i} n={arr.length} onMove={(dir) => save({ socials: move(arr, i, dir) }, "Order saved")} />
                <PlatformIcon label={l.platform} size={24} />
                <button type="button" onClick={() => setLinkEditor({ platform: l.platform, url: l.url, isNew: false })} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  <b style={{ fontSize: 13.5, color: INK, display: "block" }}>{l.platform}</b>
                  <span style={{ fontSize: 11, color: SUB, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.url}</span>
                </button>
                <span style={{ display: "flex", gap: 10, flexShrink: 0 }}>
                  <button type="button" aria-label={`Edit ${l.platform}`} onClick={() => setLinkEditor({ platform: l.platform, url: l.url, isNew: false })} style={{ fontSize: 12, fontWeight: 700, color: SUB, cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>Edit</button>
                  <button type="button" aria-label={`Remove ${l.platform}`} onClick={() => save({ socials: arr.filter((x) => x.platform !== l.platform) }, `${l.platform} removed`)} style={{ fontSize: 12, fontWeight: 800, color: "#EF4444", cursor: "pointer", background: "none", border: "none", fontFamily: "inherit" }}>Remove</button>
                </span>
              </div>
            ))}
          </div>
          {PLATFORMS.some((p) => !socials.find((l) => l.platform === p)) ? (
            <>
              <div style={fieldLabel}>Add a platform</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PLATFORMS.filter((p) => !socials.find((l) => l.platform === p)).map((p) => (
                  <button type="button" key={p} aria-label={`Add ${p}`} onClick={() => setLinkEditor({ platform: p, url: "", isNew: true })} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, padding: "7px 13px 7px 7px", borderRadius: 999, cursor: "pointer", background: CARD, border: `1.5px solid ${LINE}`, color: INK, fontFamily: "inherit" }}>
                    <PlatformIcon label={p} size={20} />
                    {p}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <div style={{ ...fieldLabel, margin: "18px 0 6px" }}>Something else?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input aria-label="Link label" value={customDraft.label} onChange={(e) => setCustomDraft((d) => ({ ...d, label: e.target.value }))} placeholder="Label, e.g. Linktree" style={{ ...fieldInput, flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13 }} />
            <input aria-label="Link URL" value={customDraft.url} onChange={(e) => setCustomDraft((d) => ({ ...d, url: e.target.value }))} placeholder="https://…" style={{ ...fieldInput, flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 13 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => setLinksOpen(false)} style={sheetBtn(false)}>Done</button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!customDraft.label.trim() || !customDraft.url.trim()) return fire("Add a label and URL first");
                save({ socials: [...socials, { platform: customDraft.label.trim(), url: customDraft.url.trim() }] }, "✓ Link added", () => setCustomDraft({ label: "", url: "" }));
              }}
              style={sheetBtn(true)}
            >
              Add this link
            </button>
          </div>
        </Sheet>
      ) : null}

      {/* ── one platform's URL (11140) ── */}
      {linkEditor ? (
        <Sheet label={linkEditor.isNew ? `Add your ${linkEditor.platform}` : `Edit ${linkEditor.platform}`} onClose={() => setLinkEditor(null)}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <PlatformIcon label={linkEditor.platform} size={24} />
            <b style={{ fontSize: 16 }}>{linkEditor.isNew ? `Add your ${linkEditor.platform}` : `Edit ${linkEditor.platform}`}</b>
          </div>
          <div style={{ ...fieldLabel, margin: "16px 0 6px" }}>URL</div>
          <input aria-label="URL" value={linkEditor.url} onChange={(e) => setLinkEditor((d) => (d ? { ...d, url: e.target.value } : d))} placeholder="https://…" autoFocus style={fieldInput} />
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {!linkEditor.isNew ? (
              <button type="button" onClick={() => save({ socials: socials.filter((l) => l.platform !== linkEditor.platform) }, `${linkEditor.platform} removed`, () => setLinkEditor(null))} style={dangerBtn}>Remove</button>
            ) : null}
            <button type="button" onClick={() => setLinkEditor(null)} style={sheetBtn(false)}>Cancel</button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const url = linkEditor.url.trim();
                if (!url) return fire("Add a URL first");
                const rest = socials.filter((l) => l.platform !== linkEditor.platform);
                const at = socials.findIndex((l) => l.platform === linkEditor.platform);
                const next = at >= 0 ? [...rest.slice(0, at), { platform: linkEditor.platform, url }, ...rest.slice(at)] : [...rest, { platform: linkEditor.platform, url }];
                save({ socials: next }, linkEditor.isNew ? `✓ ${linkEditor.platform} added` : `✓ ${linkEditor.platform} updated`, () => setLinkEditor(null));
              }}
              style={sheetBtn(true)}
            >
              Save
            </button>
          </div>
        </Sheet>
      ) : null}

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

      {toast ? (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: "calc(90px + var(--dos-safe-bottom, 0px))", transform: "translateX(-50%)", zIndex: 800, background: "var(--solid)", border: "1.5px solid #0EA5E9", borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 800, color: INK, boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
          {toast}
        </div>
      ) : null}
    </>
  );
}
