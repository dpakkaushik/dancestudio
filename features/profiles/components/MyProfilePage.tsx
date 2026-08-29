"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import { DOS_STYLE_NAMES, dosStyleColor } from "@/lib/constants/styles";
import { PLATFORMS, handleOf, isPlatform } from "@/lib/constants/socials";
import { CARD, DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, MUTED, PINK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { PublicPerson } from "@/repositories/publicPerson";
import type { PersonFollowRow } from "@/repositories/follows";
import { CREW_ROLE_WORD } from "@/types/crew";
import type { FollowedTenant } from "@/types/follow";
import { ROLE_BADGE, memberNoWords, type Profile, type SocialLink } from "@/types/profile";
import { ProfileShare } from "./ProfileShare";
import { SettingsSheet } from "@/features/settings/components/SettingsSheet";
import type { NotificationPrefs } from "@/types/notification";
import type { ArtistPlan } from "@/repositories/plans";
import type { Tenant } from "@/types/tenant";
import { Group, PlaceLink, PlatformIcon, ROLE_RING, RoleBadge, Row, Sheet, TYPE, dangerBtn, fieldInput, fieldLabel, followTint, initialsOf, sheetBtn, tierOf, type FollowGlyph } from "./profile-kit";

/** THE PROFILE TAB — prototype S_profiletab's OWN render (10565-11400), lifted
 *  whole: the profile lit like a player (the role's colour bleeding off the top,
 *  the picture as a sharp 206px square with the sleeve's thrown shadow, the ＋
 *  on its corner), the three controls top right (Edit, Public view — Share is
 *  the QR beside the name), WHO in the order you read a person (the role and
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

const micro = TYPE.micro;
const SQ = 206;
const sqShadow = "0 0 52px 20px rgba(0,0,0,.30), 0 26px 60px -4px rgba(0,0,0,.55), 0 8px 18px rgba(0,0,0,.4)";
/* the prototype offers 65 ages, 13 to 77 (11384) */
const AGES = Array.from({ length: 65 }, (_, i) => 13 + i);
const sinceWords = (iso: string) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short", year: "numeric" }).format(new Date(iso));

type Draft = { fullName: string; city: string; age: number | null; about: string; socials: SocialLink[]; styles: string[]; phone: string };
const draftOf = (p: Profile): Draft => ({ fullName: p.fullName, city: p.city ?? "", age: p.age, about: p.about ?? "", socials: p.socials, styles: p.styles, phone: p.phone ?? "" });

const move = <T,>(arr: T[], i: number, dir: -1 | 1): T[] => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
};

/* the ▲▼ pair every reorderable sheet row carries (11170) */
function Arrows({ i, n, onMove }: { i: number; n: number; onMove: (dir: -1 | 1) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => onMove(-1)} style={{ fontSize: 10, cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--el)" : "var(--sub)", lineHeight: 1, background: "none", border: "none", padding: 0 }}>▲</button>
      <button type="button" aria-label="Move down" disabled={i === n - 1} onClick={() => onMove(1)} style={{ fontSize: 10, cursor: i === n - 1 ? "default" : "pointer", color: i === n - 1 ? "var(--el)" : "var(--sub)", lineHeight: 1, background: "none", border: "none", padding: 0 }}>▼</button>
    </div>
  );
}


export function MyProfilePage({
  person,
  followers,
  followingPeople,
  followingTenants,
  place,
  scheduleHref,
  prefs,
  business,
  plan,
}: {
  person: PublicPerson;
  followers: PersonFollowRow[];
  followingPeople: PersonFollowRow[];
  followingTenants: FollowedTenant[];
  place: { place: number; population: number } | null;
  scheduleHref: string | null;
  /** what reaches you — the settings sheet's Notifications row */
  prefs: NotificationPrefs;
  /** the first business this person runs, for the rows that live on its desk */
  business: Tenant | null;
  /** the Artist plan, for the settings sheet's switch */
  plan: ArtistPlan | null;
}) {
  const router = useRouter();
  const { profile } = person;
  const ring = ROLE_RING[profile.role];
  const RC = ring[1];
  const face = photoUrl(profile.avatarPath);
  const followingN = followingPeople.length + followingTenants.length;

  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<Draft>(() => draftOf(profile));
  const [stylesOpen, setStylesOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linkEditor, setLinkEditor] = useState<{ platform: string; url: string; isNew: boolean } | null>(null);
  const [customDraft, setCustomDraft] = useState({ label: "", url: "" });
  const [followList, setFollowList] = useState<"followers" | "following" | null>(null);
  /* the gear arrives as ?settings=1 (prototype 19263). The sheet is a PLACE, so
      the address is its open state — a state seeded at mount would never see the
      gear, because the gear links to the page it is already on. */
  const settingsOpen = useSearchParams().get("settings") === "1";
  const [followSeg, setFollowSeg] = useState<"All" | "Dancers" | "Artists" | "Studios">("All");

  const fire = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2500);
  };
  /* every sheet lands on the one record; the page re-reads after */
  const save = (next: Partial<Draft>, said: string, after?: () => void) => {
    const d = { ...draftOf(profile), ...next };
    start(async () => {
      const out = await updateMyProfileAction({ fullName: d.fullName, city: d.city.trim() || null, age: d.age, about: d.about.trim() || null, socials: d.socials, styles: d.styles, phone: d.phone.trim() || null });
      if (out.error) {
        fire(out.error);
        return;
      }
      after?.();
      fire(said);
      router.refresh();
    });
  };

  const styleList = profile.styles;
  const socials = profile.socials;
  const RK = place?.place ?? null;
  const TT = RK ? tierOf(RK) : null;
  const seg = profile.role === "trainer" ? "artist" : "dancer";

  const bigWhite: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 12, fontWeight: 900, fontSize: 12.5, boxSizing: "border-box", padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden", background: "var(--text)", color: "var(--solid)", border: "1.5px solid var(--text)", textDecoration: "none" };
  const corner: React.CSSProperties = { width: 36, height: 36, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxSizing: "border-box", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,.42)", color: "#fff", border: "1px solid rgba(255,255,255,.28)", textDecoration: "none" };
  const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, padding: "6px 11px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: "var(--card)", border: "1px solid var(--el)", fontFamily: "inherit", color: INK };

  const followRows: Array<{ key: string; href: string; name: string; kind: string; glyph: FollowGlyph; tint: string; face: string | null; initials: string }> =
    followList === "followers"
      ? followers.map((f) => ({ key: f.followId, href: `/person/${f.userId}`, name: f.name, kind: f.role === "trainer" ? "artist" : f.role === "studio" ? "studio owner" : "dancer", glyph: (f.role === "trainer" ? "artist" : f.role === "studio" ? "studio" : "dancer") as FollowGlyph, tint: followTint(f.role), face: photoUrl(f.avatarPath), initials: initialsOf(f.name) }))
      : [
          ...followingPeople.map((f) => ({ key: f.followId, href: `/person/${f.userId}`, name: f.name, kind: f.role === "trainer" ? "artist" : f.role === "studio" ? "studio owner" : "dancer", glyph: (f.role === "trainer" ? "artist" : f.role === "studio" ? "studio" : "dancer") as FollowGlyph, tint: followTint(f.role), face: photoUrl(f.avatarPath), initials: initialsOf(f.name) })),
          ...followingTenants.map((t) => ({ key: t.followId, href: `/${t.tenantType === "studio" ? "studio" : "artist"}/${t.tenantId}`, name: t.tenantName, kind: t.tenantType === "studio" ? "studio" : "artist", glyph: (t.tenantType === "studio" ? "studio" : "artist") as FollowGlyph, tint: followTint(t.tenantType === "studio" ? "studio-biz" : "artist-biz"), face: null, initials: initialsOf(t.tenantName) })),
        ];
  const segOf = (kind: string) => (kind === "dancer" ? "Dancers" : kind === "artist" ? "Artists" : "Studios");
  const shownFollowRows = followRows.filter((r) => followSeg === "All" || segOf(r.kind) === followSeg);

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", paddingBottom: 40, boxSizing: "border-box" }}>
      <style>{`@keyframes dosSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      <div style={{ padding: "0 16px" }}>
        {/* ── THE PROFILE, LIT LIKE A PLAYER (10574) ── */}
        <div style={{ margin: "0 -16px", position: "relative", overflow: "hidden", background: `linear-gradient(180deg, ${RC}b8 0%, ${RC}55 46%, ${RC}18 74%, ${LILAC} 100%)` }}>
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 14px" }}>
            <div style={{ width: SQ, height: SQ, position: "relative", boxShadow: sqShadow }}>
              <div aria-label={profile.fullName} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: `linear-gradient(135deg,${ring[0]},${ring[1]})`, color: "#fff", fontSize: 64, fontWeight: 900, letterSpacing: 1, fontFamily: DOS_DISPLAY }}>
                {face ? <Image src={face} alt="" width={SQ} height={SQ} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(profile.fullName)}
              </div>
              {/* the ＋ on the corner of the square (10600): the one place you change your picture */}
              <PhotoPicker owner={{ kind: "avatar", id: profile.id }} hasPhoto={Boolean(profile.avatarPath)} label="Change your photo" overlay />
            </div>
          </div>

          {/* ── THE THREE CONTROLS, TOP RIGHT (10613) — Share is the QR beside the name ── */}
          <div style={{ position: "absolute", right: 12, top: 12, zIndex: 3, display: "flex", gap: 6 }}>
            <button type="button" aria-label="Edit profile" onClick={() => { setEdit(draftOf(profile)); setEditOpen(true); }} style={corner}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m14.5 5.5 4 4" /></svg>
            </button>
            {/* "Public view" — the page as another signed-in person reads it, which is a real page of its own here */}
            <Link href={`/person/${profile.id}`} aria-label="Public view" style={corner}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
            </Link>
          </div>

          {/* ── WHO, IN THE ORDER YOU READ A PERSON (10632) ── */}
          <div style={{ padding: "10px 16px 2px" }}>
            <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>{ROLE_BADGE[profile.role]}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: MUTED, fontVariantNumeric: "tabular-nums", letterSpacing: 0.3, marginTop: 3 }}>{memberNoWords(profile.memberNo)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <span style={{ ...TYPE.display, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.fullName}</span>
              <ProfileShare path={`/person/${profile.id}`} name={profile.fullName} />
            </div>
            {/* age and place read as one introduction — "24, New Delhi" (10664) */}
            {profile.age || profile.city ? (
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 7, fontSize: 15, fontWeight: 700, color: SUB }}>
                {profile.city ? (
                  <PlaceLink prefix={profile.age ? `${profile.age}, ` : ""} place={profile.city} />
                ) : (
                  <span style={{ fontWeight: 800, color: INK, fontVariantNumeric: "tabular-nums" }}>{profile.age}</span>
                )}
              </div>
            ) : null}

            {/* ── THE THREE FIGURES, AT THE SIZE OF FIGURES (10683) ── */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" aria-label={`${followers.length} followers`} onClick={() => { setFollowSeg("All"); setFollowList("followers"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <span data-testid="my-followers" style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>{followers.length}</span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Followers</span>
              </button>
              <button type="button" aria-label={`${followingN} following`} onClick={() => { setFollowSeg("All"); setFollowList("following"); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                <span style={{ display: "block", fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: -0.6, fontFamily: DOS_DISPLAY, color: INK, fontVariantNumeric: "tabular-nums" }}>{followingN}</span>
                <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Following</span>
              </button>
              {/* where you stand, in the metal it earned — only once there is a place to stand (Step 25: no "#0") */}
              {RK && TT ? (
                <Link href={`/stats?tab=charts&seg=${seg}`} aria-label={`Rank ${RK} of ${place?.population} — open global rankings`} style={{ textDecoration: "none" }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 1, lineHeight: 1, filter: `drop-shadow(0 2px 10px ${TT.text}44)` }}>
                    <span style={{ fontSize: 14, fontWeight: 900, fontFamily: DOS_DISPLAY, color: TT.text, opacity: 0.8 }}>#</span>
                    <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.9, fontFamily: DOS_DISPLAY, fontVariantNumeric: "tabular-nums", background: `linear-gradient(135deg,${TT.ring[0]},${TT.ring[1]})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{RK}</span>
                  </span>
                  <span style={{ display: "block", ...micro, color: TT.text, marginTop: 4 }}>{TT.label} rank</span>
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── THE BAND UNDER THE NAME — ONE STRUCTURE, THREE PARTS (10739) ── */}
        <div style={{ textAlign: "left" }}>
          {/* the styles you dance, and the ＋ that edits them (DosStyleRow 1767) */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", padding: "14px 0 6px", alignItems: "center" }}>
            {styleList.map((s) => (
              <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={`${s} — one of your styles`} />
            ))}
            <button type="button" aria-label="Add a dance style" onClick={() => setStylesOpen(true)} style={{ width: 34, height: 34, borderRadius: 10, background: "var(--el)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16, fontWeight: 800, color: SUB, flexShrink: 0, border: "none", fontFamily: "inherit" }}>＋</button>
            {styleList.length === 0 ? <span style={{ fontSize: 11.5, color: SUB, fontWeight: 700 }}>The styles you dance go here.</span> : null}
          </div>

          {/* THE LINKS, UNDER THE STYLES (10760): one line, swiped sideways */}
          <div style={{ display: "flex", gap: 7, alignItems: "center", overflowX: "auto", scrollbarWidth: "none", margin: "0 0 14px", paddingBottom: 2 }}>
            {socials.map((l) => (
              <button type="button" key={l.platform} aria-label={`${l.platform} — ${isPlatform(l.platform) ? handleOf(l.url) : l.platform}`} onClick={() => setLinkEditor({ platform: l.platform, url: l.url, isNew: false })} style={chip}>
                <span style={{ flexShrink: 0, lineHeight: 0 }}><PlatformIcon label={l.platform} size={15} /></span>
                <span style={{ fontSize: 12, fontWeight: 800, color: PINK }}>{isPlatform(l.platform) ? handleOf(l.url) : l.platform}</span>
              </button>
            ))}
            <button type="button" aria-label="Add a link" onClick={() => setLinksOpen(true)} style={{ ...chip, background: "transparent", border: "1px dashed var(--el)", fontSize: 12, fontWeight: 800, color: SUB }}>＋ Add link</button>
          </div>

          {/* ABOUT, WHERE IT BELONGS (10811) — prose, not a boxed card */}
          <div style={{ margin: "20px 0 14px" }}>
            <div style={{ ...TYPE.shelf, color: INK, marginBottom: 6 }}>About</div>
            {profile.about ? (
              <div style={{ fontSize: 13.5, color: SUB, lineHeight: 1.62 }}>{profile.about}</div>
            ) : (
              <button type="button" onClick={() => { setEdit(draftOf(profile)); setEditOpen(true); }} style={{ fontSize: 13.5, color: SUB, lineHeight: 1.62, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                A sentence in your own words — <b style={{ color: PINK }}>Edit profile ›</b>
              </button>
            )}
          </div>

          {/* THE TWO PLACES THIS PROFILE GOES (10905): Stats · Schedule, two big white buttons */}
          <div style={{ display: "grid", gridTemplateColumns: scheduleHref ? "1fr 1fr" : "1fr", gap: 8 }}>
            <Link href="/stats" aria-label="Stats" style={bigWhite}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 20h16" /><path d="M6.5 20v-6M12 20V8.5M17.5 20V4.5" /></svg>
              Stats
            </Link>
            {scheduleHref ? (
              <Link href={scheduleHref} aria-label="Schedule" style={bigWhite}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="16" rx="3" /><path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" /></svg>
                Schedule
              </Link>
            ) : null}
          </div>
        </div>

        {/* ── THE PEOPLE, IN ONE LANGUAGE (10990): a row per person, each group headed with a count ── */}
        {person.crews.length ? (
          <Group title="Crews" n={person.crews.length}>
            {person.crews.map((c) => (
              <Row key={c.crewId} href={`/crew/${c.crewId}`} markName={c.name} title={c.name} sub={`${c.style} · ${c.city} · since ${sinceWords(c.since)}`} right={c.role === "leader" ? "Leads this crew" : CREW_ROLE_WORD[c.role]} />
            ))}
          </Group>
        ) : null}
        {person.teachesAt.length ? (
          <Group title="Teaches at" n={person.teachesAt.length}>
            {person.teachesAt.map((t) => (
              <Row key={t.tenantId} href={`/${t.tenantType === "studio" ? "studio" : "artist"}/${t.tenantId}`} markName={t.tenantName} title={t.tenantName} sub={[t.kinds, `${t.classes} class${t.classes === 1 ? "" : "es"}`, t.city].filter(Boolean).join(" · ")} />
            ))}
          </Group>
        ) : null}
        {person.runs.length ? (
          <Group title="Runs" n={person.runs.length}>
            {person.runs.map((t) => (
              <Row key={t.tenantId} href={`/${t.tenantType === "studio" ? "studio" : "artist"}/${t.tenantId}`} markName={t.tenantName} photo={t.photoPath ? photoUrl(t.photoPath) : null} title={t.tenantName} sub={[t.tenantType === "studio" ? "Studio" : "Artist business", t.city].filter(Boolean).join(" · ")} />
            ))}
          </Group>
        ) : null}

        {/* Log out is in the Settings sheet, where the prototype keeps it (11416) —
            the gear in the top bar opens it from anywhere. */}
      </div>

      {/* ── Edit profile — name, location, age, bio (11364) ── */}
      {editOpen ? (
        <Sheet label="Edit profile" onClose={() => setEditOpen(false)} maxHeight="88vh">
          <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Edit profile</b>
          <div style={fieldLabel}>Name</div>
          <input aria-label="Name" value={edit.fullName} onChange={(e) => setEdit((d) => ({ ...d, fullName: e.target.value }))} style={fieldInput} />
          <div style={fieldLabel}>Location</div>
          <input aria-label="Location" value={edit.city} onChange={(e) => setEdit((d) => ({ ...d, city: e.target.value }))} style={fieldInput} />
          {/* the number is the person's to publish and theirs to take down: an
              empty box saves null, and the line under the box says so rather
              than making them guess (N8 — Call, S_profiletab 10879) */}
          <div style={fieldLabel}>Phone</div>
          <input aria-label="Phone" type="tel" inputMode="tel" value={edit.phone} onChange={(e) => setEdit((d) => ({ ...d, phone: e.target.value }))} placeholder="+91 98765 43210" style={fieldInput} />
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Shown on your public page as Call. Leave it empty and nobody sees a number.</div>
          <div style={fieldLabel}>Age</div>
          <select aria-label="Age" value={edit.age ?? ""} onChange={(e) => setEdit((d) => ({ ...d, age: e.target.value ? Number(e.target.value) : null }))} style={fieldInput}>
            <option value="">—</option>
            {AGES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div style={fieldLabel}>Bio</div>
          <textarea aria-label="Bio" value={edit.about} rows={3} maxLength={220} onChange={(e) => setEdit((d) => ({ ...d, about: e.target.value }))} style={{ ...fieldInput, lineHeight: 1.5, resize: "none" }} />
          <div style={{ fontSize: 10, color: MUTED, textAlign: "right", marginTop: 4 }}>{edit.about.length}/220</div>
          <div style={fieldLabel}>Profile photo</div>
          <PhotoPicker owner={{ kind: "avatar", id: profile.id }} hasPhoto={Boolean(profile.avatarPath)} label="Change your photo" />
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button type="button" onClick={() => setEditOpen(false)} style={sheetBtn(false)}>Cancel</button>
            <button type="button" disabled={pending} onClick={() => save({ fullName: edit.fullName, city: edit.city, age: edit.age, about: edit.about, phone: edit.phone }, "✓ Profile updated", () => setEditOpen(false))} style={sheetBtn(true)}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </Sheet>
      ) : null}

      {/* ── ＋ Add a dance style (11217): reorder, remove, add from the registry ── */}
      {stylesOpen ? (
        <Sheet label="Add a dance style" onClose={() => setStylesOpen(false)} maxHeight="78vh">
          <b style={{ fontSize: 16 }}>＋ Add a dance style</b>
          <div style={{ fontSize: 12, color: SUB, margin: "4px 0 6px" }}>Reorder with ↑↓ — this is the order shown on your profile.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {styleList.map((s, i, arr) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderRadius: 14, background: CARD, border: `1px solid ${LINE}` }}>
                <Arrows i={i} n={arr.length} onMove={(dir) => save({ styles: move(arr, i, dir) }, "Order saved")} />
                <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 6, background: dosStyleColor(s), flexShrink: 0 }} />
                <b style={{ flex: 1, fontSize: 13.5, color: INK }}>{s}</b>
                <button type="button" aria-label={`Remove ${s}`} onClick={() => save({ styles: arr.filter((x) => x !== s) }, `${s} removed from your styles`)} style={{ fontSize: 12, fontWeight: 800, color: "#EF4444", cursor: "pointer", flexShrink: 0, background: "none", border: "none", fontFamily: "inherit" }}>Remove</button>
              </div>
            ))}
          </div>
          {DOS_STYLE_NAMES.some((s) => !styleList.includes(s)) ? (
            <>
              <div style={fieldLabel}>Add more styles</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {DOS_STYLE_NAMES.filter((s) => !styleList.includes(s)).map((s) => (
                  <button type="button" key={s} disabled={pending || styleList.length >= 12} aria-label={`Add ${s}`} onClick={() => save({ styles: [...styleList, s] }, `✓ ${s} added to your styles`)} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, padding: "6px 13px 6px 6px", borderRadius: 999, cursor: "pointer", background: CARD, border: `1px solid ${LINE}`, color: INK, fontFamily: "inherit" }}>
                    <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: dosStyleColor(s) }} />
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          <button type="button" onClick={() => setStylesOpen(false)} style={{ ...sheetBtn(true), width: "100%", marginTop: 14 }}>Done</button>
        </Sheet>
      ) : null}

      {/* ── Add a social link (11161): the list with ▲▼ · Edit · Remove, the platforms, "Something else?" ── */}
      {linksOpen ? (
        <Sheet label="Add a social link" onClose={() => setLinksOpen(false)}>
          <b style={{ fontSize: 16 }}>Add a social link</b>
          <div style={{ fontSize: 12, color: SUB, margin: "4px 0 12px" }}>Drag order with ↑↓ · tap a platform below to add it.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {socials.map((l, i, arr) => (
              <div key={l.platform} style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 12px", borderRadius: 14, background: CARD, border: `1px solid ${LINE}` }}>
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
                  <button type="button" key={p} aria-label={`Add ${p}`} onClick={() => setLinkEditor({ platform: p, url: "", isNew: true })} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, padding: "7px 13px 7px 7px", borderRadius: 999, cursor: "pointer", background: CARD, border: `1px solid ${LINE}`, color: INK, fontFamily: "inherit" }}>
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

      {/* ── Followers / Following list — segregated by account type (11335) ── */}
      {followList ? (
        <Sheet label={followList === "followers" ? "Followers" : "Following"} onClose={() => setFollowList(null)} maxHeight="78vh">
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 14 }}>
            <b style={{ fontSize: 18 }}>{followList === "followers" ? "Followers" : "Following"}</b>
            <span style={{ fontSize: 13, color: SUB, fontWeight: 700 }}>{followRows.length}</span>
          </div>
          <div style={{ display: "flex", gap: 5, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none" }}>
            {(["All", "Dancers", "Artists", "Studios"] as const).map((s) => (
              <button type="button" key={s} onClick={() => setFollowSeg(s)} aria-pressed={followSeg === s} style={{ flex: "0 0 auto", textAlign: "center", padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", background: followSeg === s ? PINK : CARD, color: followSeg === s ? "#fff" : SUB, border: "none", fontFamily: "inherit", boxShadow: followSeg === s ? "0 3px 10px rgba(90,200,250,.35)" : "none" }}>{s}</button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shownFollowRows.map((r) => (
              <Link key={r.key} href={r.href} onClick={() => setFollowList(null)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16, background: `${r.tint}12`, border: `1px solid ${r.tint}30`, color: INK, textDecoration: "none" }}>
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
        /* leaving takes the parameter back off */
        onClose={() => router.replace("/profile")}
        role={profile.role}
        business={business}
        plan={plan}
        prefs={prefs}
      />

      {toast ? <div role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: `1.5px solid ${PINK}`, color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 390, textAlign: "center", zIndex: 650 }}>{toast}</div> : null}
    </div>
  );
}
