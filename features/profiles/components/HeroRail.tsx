"use client";

import Image from "next/image";
import { useState, type CSSProperties, type ReactNode } from "react";
import { initialsOf } from "@/features/profiles/components/profile-kit";
import { DOS_DISPLAY, HERO_SQ, HERO_SQ_SHADOW } from "@/lib/design/tokens";

/** One picture in the rail after the profile photo. */
export interface HeroShot {
  key: string;
  src: string;
  alt: string;
  /** a signed URL into a private bucket must not go through the image
   *  optimizer, which would fetch it server-side without the signature and get
   *  a 400 — a studio's proof photos are these */
  signed?: boolean;
  /** a control on the top-right corner — the artist's ✕ on a gallery photo */
  corner?: ReactNode;
}

type Slide = { key: string; src: string | null; alt: string; signed?: boolean; corner?: ReactNode; node?: ReactNode };

/** THE SQUARE IS A SWIPE (prototype S_profiletab 10575-10627, 14 Sep 2026).
 *
 *  The profile hero's cover — a SHARP SQUARE standing on the entity's own colour
 *  with the sleeve's thrown shadow — and, when there is more than one picture,
 *  "the booking flow's sideways scroll-snap, profile photo first, then the
 *  latest shots, a dot for each." The first square is always the profile photo,
 *  and it is where the ＋ that changes it sits. What follows it is the caller's:
 *  a studio's photos of its space, an artist's gallery, nothing at all for a
 *  user — the user: "in case of user we don't want scrollable cover photo
 *  collection, just one cover image is enough."
 *
 *  A square with no picture shows the initials on the gradient; so does a
 *  square whose picture would not load (a signed URL past its half hour, an
 *  object gone from the bucket) — an invisible failure over a gradient used to
 *  read as "no photo", and now it reads as exactly that instead of a blank.
 *  One thing is not a choice, so a lone square draws no dots. The dots are
 *  decoration on a swipe a thumb already understands, hidden from the
 *  accessibility tree; the rail itself says how many photos there are. */
export function HeroRail({
  name,
  grad,
  photo,
  photoAlt,
  picker,
  more = [],
  addTile,
}: {
  name: string;
  /** the two colours the initials stand on */
  grad: [string, string];
  /** the profile photo — null draws the initials */
  photo: string | null;
  photoAlt?: string;
  /** the ＋ on the first square's corner, for whoever may change the photo */
  picker?: ReactNode;
  more?: HeroShot[];
  /** the last square — the artist's "Add to your gallery" tile */
  addTile?: ReactNode;
}) {
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState<Record<string, true>>({});

  const slides: Slide[] = [
    { key: "photo", src: photo, alt: photoAlt ?? name, corner: picker },
    ...more.map((m): Slide => ({ key: m.key, src: m.src, alt: m.alt, signed: m.signed, corner: m.corner })),
    ...(addTile ? [{ key: "add", src: null, alt: "Add a photo", node: addTile } as Slide] : []),
  ];
  const many = slides.length > 1;
  const photos = 1 + more.length;

  const square: CSSProperties = {
    width: HERO_SQ,
    height: HERO_SQ,
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
    boxShadow: HERO_SQ_SHADOW,
  };

  return (
    <>
      <div
        role={many ? "region" : undefined}
        aria-label={many ? `${name} — ${photos} photo${photos === 1 ? "" : "s"}, swipe sideways` : undefined}
        data-testid="hero-rail"
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
        {slides.map((s) => (
          <div key={s.key} style={{ flex: "0 0 100%", scrollSnapAlign: "center", display: "flex", justifyContent: "center", padding: "24px 0 14px" }}>
            <div aria-label={s.alt} style={square}>
              {s.node ??
                (s.src && !broken[s.key] ? (
                  <Image
                    src={s.src}
                    alt=""
                    fill
                    sizes={`${HERO_SQ}px`}
                    style={{ objectFit: "cover" }}
                    unoptimized={Boolean(s.signed)}
                    onError={() => setBroken((b) => ({ ...b, [s.key]: true }))}
                  />
                ) : (
                  initialsOf(name)
                ))}
              {s.corner}
            </div>
          </div>
        ))}
      </div>
      {many ? (
        <div aria-hidden="true" style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: -4, paddingBottom: 2 }}>
          {slides.map((s, i) => (
            <span
              key={s.key}
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
