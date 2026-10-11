"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import type { FollowedCrew, PersonFollowRow } from "@/repositories/follows";
import type { FollowedBusiness } from "@/types/follow";
import type { Profile, SocialLink } from "@/types/profile";
import { LinksRowEditor } from "./LinksRowEditor";
import { CHIP_ROW, FIGURE_GROUP, FIGURE_ROW, figureLabel, figureNum } from "./profile-band";
import { useRecordLists } from "./RecordLists";
import { StylesRowEditor } from "./StylesRowEditor";

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

export function HomeBand({
  profile,
  chips = null,
  followers,
  followingPeople,
  followingBusinesses,
  followingCrews,
}: {
  profile: Profile;
  /** the QR and Stats chips, at the right end of the figures row (20 Sep 2026) —
   *  they were a column in the hero until today; a Follow bell joins them on the
   *  pages that have one, and your own Home is not one of them */
  chips?: ReactNode;
  followers: PersonFollowRow[];
  followingPeople: PersonFollowRow[];
  followingBusinesses: FollowedBusiness[];
  followingCrews: FollowedCrew[];
}) {
  const router = useRouter();
  const { lists } = useRecordLists();

  const followingN = followingPeople.length + followingBusinesses.length + followingCrews.length;

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
      /* no `phone`: the server keeps the stored number (6 Oct 2026, decision 4) */
    });
    if (!out.error) router.refresh();
    return out.error;
  };

  return (
    <>
      {/* ── THE TWO FIGURES, AND BOTH OPEN THEIR LIST — a page of its own since
          12 Oct 2026, Instagram's (`/follows/person/{id}`) ── */}
      <div style={FIGURE_ROW}>
        <div style={FIGURE_GROUP}>
        <Link href={`/follows/person/${profile.id}?tab=followers`} aria-label={`${followers.length} followers`} style={{ display: "block", color: "inherit", textDecoration: "none", textAlign: "left" }}>
          <span data-testid="home-followers" style={figureNum}>{followers.length}</span>
          <span style={figureLabel}>Followers</span>
        </Link>
        <Link href={`/follows/person/${profile.id}?tab=following`} aria-label={`${followingN} following`} style={{ display: "block", color: "inherit", textDecoration: "none", textAlign: "left" }}>
          <span data-testid="home-following" style={figureNum}>{followingN}</span>
          <span style={figureLabel}>Following</span>
        </Link>
        </div>
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

    </>
  );
}
