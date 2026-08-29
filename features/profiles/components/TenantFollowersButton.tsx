"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { DOS_DISPLAY, INK, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { TenantFollower } from "@/types/follow";
import { RoleBadge, Sheet, followTint, initialsOf, type FollowGlyph } from "./profile-kit";

const micro: React.CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };
const figure: React.CSSProperties = {
  display: "block",
  fontSize: 22,
  fontWeight: 900,
  lineHeight: 1,
  letterSpacing: -0.6,
  fontFamily: DOS_DISPLAY,
  color: INK,
  fontVariantNumeric: "tabular-nums",
};

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

const glyphOf = (role: TenantFollower["role"]): FollowGlyph =>
  role === "trainer" ? "artist" : role === "studio" ? "studio" : "dancer";
const wordOf = (role: TenantFollower["role"]) =>
  role === "trainer" ? "artist" : role === "studio" ? "studio owner" : "dancer";

/** THE FIGURE BECOMES A DOOR, BUT ONLY FOR THE OWNER (parity audit B6 —
 *  S_profiletab 11069, 11335). `findTenantFollowers` has existed since Step 15
 *  and nothing called it: the page printed how many and never who.
 *
 *  Who may open it is the app's decision, not RLS's. The policy admits every
 *  member of the business; the page offers the sheet to the OWNER, because a
 *  list of the people who follow you is the business's own record and a trainer
 *  on the roster has no reason to hold it. RLS is the ceiling — this is the
 *  scope, said out loud.
 *
 *  The rows are the person's Followers sheet's rows, drawn by the same kit with
 *  the same tint: the same people, so the same list. Each opens that person's
 *  page. A follower with no photo shows their initials on their own colour. */
export function TenantFollowersButton({ count, followers }: { count: number; followers: TenantFollower[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${count} follower${count === 1 ? "" : "s"} — see who`}
        aria-haspopup="dialog"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      >
        <span data-testid="followers-count" style={figure}>
          {fmt(count)}
        </span>
        <span style={{ display: "block", ...micro, color: MUTED, marginTop: 4 }}>Followers ›</span>
      </button>

      {open ? (
        <Sheet label="Followers" onClose={() => setOpen(false)} maxHeight="78vh">
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 14 }}>
            <b style={{ fontSize: 18 }}>Followers</b>
            <span style={{ fontSize: 13, color: SUB, fontWeight: 700 }}>{followers.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {followers.map((f) => {
              const tint = followTint(f.role);
              const face = photoUrl(f.avatarPath);
              return (
                <Link
                  key={f.followId}
                  href={`/person/${f.userId}`}
                  onClick={() => setOpen(false)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 16, background: `${tint}12`, border: `1px solid ${tint}30`, color: INK, textDecoration: "none" }}
                >
                  <span style={{ position: "relative", flexShrink: 0 }}>
                    <span style={{ width: 46, height: 46, borderRadius: 23, display: "flex", overflow: "hidden", background: `linear-gradient(135deg,${tint},${tint}88)`, alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 17 }}>
                      {face ? <Image src={face} alt="" width={46} height={46} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(f.name)}
                    </span>
                    <RoleBadge kind={glyphOf(f.role)} tint={tint} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 750, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: tint, fontWeight: 700, textTransform: "capitalize" }}>
                      {[wordOf(f.role), f.city].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span style={{ fontSize: 16, color: MUTED }}>›</span>
                </Link>
              );
            })}
            {followers.length === 0 ? (
              <div style={{ fontSize: 12, color: SUB, padding: "8px 2px" }}>Nobody follows this page yet.</div>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
