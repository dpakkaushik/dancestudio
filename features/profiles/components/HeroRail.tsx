"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { initialsOf } from "@/features/profiles/components/profile-kit";
import { DISC_RADIUS, DOS_DISPLAY, HERO_DISC, HERO_DISC_RING, HERO_HEAD_H, HERO_HEAD_W, HERO_SQ_SHADOW, LILAC } from "@/lib/design/tokens";

/** One picture in the header rail. */
export interface HeroShot {
  key: string;
  src: string;
  alt: string;
  /** a signed URL into a private bucket must not go through the image
   *  optimizer, which would fetch it server-side without the signature and get
   *  a 400 — a studio's photos are these */
  signed?: boolean;
}

type Slide = { key: string; src: string | null; alt: string; signed?: boolean };

/** THE HEADER IS A SWIPE (prototype S_profiletab 10575-10627; re-cut 15 Sep
 *  2026).
 *
 *  Until today the first square was the profile photo and the pictures came
 *  after it. The user split the two: the profile picture is the round disc
 *  below (`ProfileDisc`), and this rail is the HEADER — the pictures of a place
 *  or a body of work, "the booking flow's sideways scroll-snap … a dot for
 *  each." What it swipes through is the caller's: a studio's photos of its
 *  space, an artist's ten, a user's one.
 *
 *  ⚠ IT SHOWS; IT DOES NOT EDIT (16 Sep 2026, the user, with the ✕ and the ＋
 *  circled on their own hero: "the update image option should be inside the
 *  edit profile"). The dashed Add tile and the per-picture ✕ are gone from
 *  here; adding and removing happen in the Edit sheet, where the whole set is
 *  visible as a grid and the rules can be said in words. The rail is a rail.
 *
 *  A header with nothing in it draws one quiet square on the entity's own
 *  gradient — no initials, because the disc under it already says who this is,
 *  and the same letters twice is a stutter. A picture that would not load (a
 *  signed URL past its half hour, an object gone from the bucket) falls back to
 *  that same square rather than to a broken image.
 *
 *  One square is not a choice, so a lone square draws no dots. The dots are
 *  decoration on a swipe a thumb already understands, hidden from the
 *  accessibility tree; the rail itself says how many pictures there are.
 *
 *  The box is HERO_HEAD_W × HERO_HEAD_H — the 206 square today, by the user's
 *  choice; those two tokens are the whole of what changes if it ever goes
 *  wide. */
export function HeroRail({
  name,
  grad,
  shots = [],
}: {
  name: string;
  /** the two colours an empty header stands on */
  grad: [string, string];
  shots?: HeroShot[];
}) {
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState<Record<string, true>>({});

  const slides: Slide[] = shots.map((m): Slide => ({ key: m.key, src: m.src, alt: m.alt, signed: m.signed }));
  if (slides.length === 0) {
    slides.push({ key: "empty", src: null, alt: `${name} — no header pictures yet` });
  }
  const many = slides.length > 1;

  const square: CSSProperties = {
    width: HERO_HEAD_W,
    height: HERO_HEAD_H,
    position: "relative",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(135deg,${grad[0]},${grad[1]})`,
    color: "#fff",
    fontFamily: DOS_DISPLAY,
    boxShadow: HERO_SQ_SHADOW,
  };

  return (
    <>
      <div
        role={many ? "region" : undefined}
        aria-label={many ? `${name} — ${shots.length} header picture${shots.length === 1 ? "" : "s"}, swipe sideways` : undefined}
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
              {s.src && !broken[s.key] ? (
                <Image
                  src={s.src}
                  alt=""
                  fill
                  sizes={`${HERO_HEAD_W}px`}
                  style={{ objectFit: "cover" }}
                  unoptimized={Boolean(s.signed)}
                  onError={() => setBroken((b) => ({ ...b, [s.key]: true }))}
                />
              ) : null}
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

/** THE PROFILE DISC (15 Sep 2026) — the profile picture beside the name. Initials
 *  on the entity's own gradient until there is a picture, and again if the
 *  picture would not load. The ring is the page's own colour, so the disc cuts
 *  out of the wash behind it.
 *
 *  ⚠ A SQUIRCLE, NOT A CIRCLE (18 Sep 2026, the user: "profile pic should be
 *  squircle"). The corner is `DISC_RADIUS` of the side — 30%, the proportion the
 *  crew face (`CrewFace`) and the hub's 42px studio face already draw — so the
 *  same picture is the same shape at every size. The cropper's disc frame is
 *  masked to this exact shape, which is how what you see while cropping is what
 *  lands here.
 *
 *  It wore a ＋ on its rim until 16 Sep 2026; the picture is changed in the Edit
 *  sheet now, with the header pictures, so the disc is a picture again. */
export function ProfileDisc({ name, grad, photo, photoAlt, testId }: { name: string; grad: [string, string]; photo: string | null; photoAlt?: string; testId?: string }) {
  const [broken, setBroken] = useState(false);
  const size = HERO_DISC;
  return (
    <div data-testid={testId} style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        aria-label={photoAlt ?? name}
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * DISC_RADIUS),
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg,${grad[0]},${grad[1]})`,
          color: "#fff",
          fontSize: Math.round(size * 0.36),
          fontWeight: 900,
          letterSpacing: 0.5,
          fontFamily: DOS_DISPLAY,
          border: `${HERO_DISC_RING}px solid ${LILAC}`,
          boxSizing: "border-box",
          boxShadow: "0 10px 28px rgba(0,0,0,.45)",
        }}
      >
        {photo && !broken ? <Image src={photo} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }} onError={() => setBroken(true)} /> : initialsOf(name)}
      </div>
    </div>
  );
}
