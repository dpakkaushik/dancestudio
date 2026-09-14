"use client";

import Image from "next/image";
import { useState } from "react";
import { initialsOf } from "@/features/profiles/components/profile-kit";
import { DOS_DISPLAY } from "@/lib/design/tokens";

const SQ = 206;
const sqShadow = "0 0 52px 20px rgba(0,0,0,.30), 0 26px 60px -4px rgba(0,0,0,.55), 0 8px 18px rgba(0,0,0,.4)";

/** THE SQUARE IS A SWIPE (prototype S_profiletab 10575-10627, 14 Sep 2026).
 *
 *  The profile hero's cover — a SHARP SQUARE standing on the entity's own colour
 *  with the sleeve's thrown shadow — and, when there is more than one picture,
 *  "the booking flow's sideways scroll-snap, profile photo first, then the
 *  latest shots, a dot for each." Here the shots are a studio's: its public
 *  photo first, then the photos of its space it showed DanceOS for the badge.
 *  The user, looking at the artist's profile in the prototype: *"the studio
 *  page header should have these studio images as scrollable header."*
 *
 *  A studio with no picture at all gets the one square every page gives it —
 *  its initials on its gradient — and no dots, because one thing is not a
 *  choice. The dots are decoration on a swipe a thumb already understands, so
 *  they are hidden from the accessibility tree; the rail itself says how many
 *  photos there are.
 *
 *  The images are `unoptimized` on purpose: a proof photo is a SIGNED URL into
 *  a private bucket, and the image optimizer would fetch it server-side without
 *  the signature and get a 400. `ProofPhotos` renders them the same way. */
export function StudioPhotoRail({ name, shots, grad }: { name: string; shots: string[]; grad: [string, string] }) {
  const [idx, setIdx] = useState(0);
  const many = shots.length > 1;
  const squares: Array<string | null> = shots.length ? shots : [null];

  return (
    <>
      <div
        role={many ? "region" : undefined}
        aria-label={many ? `${name} — ${shots.length} photos, swipe sideways` : undefined}
        data-testid="studio-photo-rail"
        onScroll={(e) => {
          const n = e.currentTarget;
          const i = Math.round(n.scrollLeft / Math.max(1, n.clientWidth));
          if (i !== idx) setIdx(i);
        }}
        style={{
          display: "flex",
          overflowX: many ? "auto" : "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {squares.map((src, i) => (
          <div
            key={`${i}:${src ?? "initials"}`}
            style={{ flex: "0 0 100%", scrollSnapAlign: "center", display: "flex", justifyContent: "center", padding: "24px 0 14px" }}
          >
            <div
              aria-label={src ? `Photo ${i + 1} of ${name}` : name}
              style={{
                width: SQ,
                height: SQ,
                position: "relative",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `linear-gradient(135deg,${grad[0]},${grad[1]})`,
                color: "#fff",
                fontSize: 64,
                fontWeight: 900,
                letterSpacing: 1,
                fontFamily: DOS_DISPLAY,
                boxShadow: sqShadow,
              }}
            >
              {src ? <Image src={src} alt="" fill sizes={`${SQ}px`} style={{ objectFit: "cover" }} unoptimized /> : initialsOf(name)}
            </div>
          </div>
        ))}
      </div>
      {many ? (
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: -4, paddingBottom: 2 }}>
          {shots.map((s, i) => (
            <span
              key={`${i}:${s}`}
              style={{
                width: i === idx ? 16 : 5,
                height: 5,
                borderRadius: 3,
                background: i === idx ? "#fff" : "rgba(255,255,255,.4)",
                transition: "width .18s",
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
