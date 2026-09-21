"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { INK, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { TenantFollower } from "@/types/follow";
import { RoleBadge, Sheet, followTint, initialsOf, smallBox, type FollowGlyph } from "./profile-kit";
import { KIND_WORD, kindOf } from "@/types/profile";

/* the KIND is the badge, the glyph and the word at once (8 Sep 2026) */
const kindOfFollower = (f: TenantFollower): FollowGlyph => kindOf(f.role, f.isArtist);
const wordOf = (f: TenantFollower) => KIND_WORD[kindOf(f.role, f.isArtist)].toLowerCase();

/** WHO FOLLOWS YOU, FOR THE OWNER AND NOBODY ELSE (parity audit B6 —
 *  S_profiletab 11069, 11335). `findTenantFollowers` has existed since Step 15
 *  and nothing called it: the page printed how many and never who.
 *
 *  Who may open it is the app's decision, not RLS's. The policy admits every
 *  member of the business; the page offers the sheet to the OWNER, because a
 *  list of the people who follow you is the business's own record and a trainer
 *  on the roster has no reason to hold it. RLS is the ceiling — this is the
 *  scope, said out loud.
 *
 *  ⚠ A BUTTON, NOT A FIGURE (19 Sep 2026, the user: "remove all kinds of stats
 *  from profile page"). It was the Followers count made pressable; the count is
 *  off the page now, and this is a small button in the owner's row that opens
 *  the list. The number is inside the sheet, where the list is.
 *
 *  The rows are the person's Followers sheet's rows, drawn by the same kit with
 *  the same tint: the same people, so the same list. Each opens that person's
 *  page. A follower with no photo shows their initials on their own colour. */
/** the same segments the person's Followers / Following sheets carry (11336) —
 *  the list is the same people, so it is narrowed the same way */
const FOLLOW_SEGS = ["All", "Users", "Artists", "Organizations"] as const;
type FollowSeg = (typeof FOLLOW_SEGS)[number];
const segOf = (f: TenantFollower): FollowSeg => {
  const k = kindOf(f.role, f.isArtist);
  return k === "user" ? "Users" : k === "artist" ? "Artists" : "Organizations";
};

export function TenantFollowersButton({ followers, accent }: { followers: TenantFollower[]; accent: string }) {
  const [open, setOpen] = useState(false);
  const [seg, setSeg] = useState<FollowSeg>("All");
  const shown = followers.filter((f) => seg === "All" || segOf(f) === seg);

  return (
    <>
      <button type="button" onClick={() => { setSeg("All"); setOpen(true); }} aria-label="Followers — see who" aria-haspopup="dialog" style={smallBox(false, accent)}>
        Followers ›
      </button>

      {open ? (
        <Sheet label="Followers" onClose={() => setOpen(false)} maxHeight="78vh">
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 14 }}>
            <b style={{ fontSize: 18 }}>Followers</b>
            <span style={{ fontSize: 13, color: SUB, fontWeight: 700 }}>{followers.length}</span>
          </div>
          {/* ⚠ BIFURCATED BY PROFILE TYPE, LIKE THE OTHER TWO (20 Sep 2026, the
              user: "follow following list open with profile type bifercation and
              photo with name of profiles"). This sheet had the photos and the
              names since it was built and never the segments, so a studio with
              two hundred followers had one long column and the person's own
              sheet — the SAME rows, the same kit — had chips. ⚠ Only three
              words, not the person's six: a STUDIO and a CREW cannot follow, so
              those two segments could only ever be empty here, and a chip that
              can never match anything is worse than no chip. */}
          <div style={{ display: "flex", gap: 5, marginBottom: 14, overflowX: "auto", scrollbarWidth: "none" }}>
            {FOLLOW_SEGS.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setSeg(s)}
                aria-pressed={seg === s}
                style={{ flex: "0 0 auto", textAlign: "center", padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", background: seg === s ? accent : "var(--card)", color: seg === s ? "#fff" : SUB, border: "none", fontFamily: "inherit" }}
              >
                {s}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((f) => {
              const tint = followTint(kindOfFollower(f));
              const face = photoUrl(f.avatarPath);
              return (
                <Link
                  key={f.followId}
                  href={`/person/${f.userId}`}
                  /* no close on click (19 Sep 2026): the route change takes the
                     sheet down — closing first spent its history entry in the
                     same tick as the navigation and cancelled it */
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16, background: `${tint}12`, border: `1.5px solid ${tint}30`, color: INK, textDecoration: "none" }}
                >
                  <span style={{ position: "relative", flexShrink: 0 }}>
                    <span style={{ width: 46, height: 46, borderRadius: 23, display: "flex", overflow: "hidden", background: `linear-gradient(135deg,${tint},${tint}88)`, alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 17 }}>
                      {face ? <Image src={face} alt="" width={46} height={46} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(f.name)}
                    </span>
                    <RoleBadge kind={kindOfFollower(f)} tint={tint} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 750, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: tint, fontWeight: 700, textTransform: "capitalize" }}>
                      {[wordOf(f), f.city].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span style={{ fontSize: 16, color: MUTED }}>›</span>
                </Link>
              );
            })}
            {shown.length === 0 ? (
              <div style={{ fontSize: 12, color: SUB, padding: "8px 2px" }}>
                {followers.length === 0 ? "Nobody follows this page yet." : `No ${seg.toLowerCase()} among your followers yet.`}
              </div>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
