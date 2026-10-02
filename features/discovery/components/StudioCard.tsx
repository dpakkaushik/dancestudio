"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { gradientOf } from "@/features/profiles/components/profile-kit";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { DISC_RADIUS, DOS_DISPLAY, HERO_HEAD_H, HERO_HEAD_W, INK } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { publicProfilePath } from "@/lib/routes/publicProfile";
import type { NearbyBusiness } from "@/repositories/discovery";
import { DosWhere, FollowerPill, initialsOf, kmLabel } from "./discover-kit";

const CARD = "var(--card)";
const EL = "var(--el)";
/** the profile picture on the bottom line — the same squircle share every other
 *  face in the app is cut to (`DISC_RADIUS`), so one picture is one shape at
 *  every size */
const FACE = 56;
/** the card's poster rail is the crop's own shape — one ratio, read from the
 *  tokens the cropper and the hero rail read (28 Sep 2026) */
const SHOT_RATIO = `${HERO_HEAD_W} / ${HERO_HEAD_H}`;

/** One picture on a card, already signed by the server. */
export interface CardShot {
  key: string;
  src: string;
  /** a signed URL into the private bucket must skip the image optimizer, which
   *  would fetch it server-side without the signature and get a 400 */
  signed?: boolean;
}

/**
 * A STUDIO IS A ROOM YOU WALK INTO — the prototype's StudioCard (4306-4369),
 * re-cut 27 Sep 2026 to the user's own words: *"Studio Cards on discover should
 * have swipable photos in top section which are used in posters. and bottom part
 * should contain profile pic and other details. view photo should be same as how
 * it was cut."*
 *
 * ⚠⚠ THE TOP IS THE POSTERS, AND ITS SHAPE IS THE CROP'S SHAPE. Until 27 Sep this
 * card drew the studio's PROFILE PICTURE — one photo — stretched across a 150px
 * full-width strip, and put INITIALS in the face below it. So the one picture on
 * the card was the wrong picture, shown in the wrong shape, and `object-fit:
 * cover` into a 2.6:1 strip threw away the top and bottom of what somebody had
 * carefully framed.
 *
 * ⚠ THE RAIL READS `HERO_HEAD_W / HERO_HEAD_H` — the same two tokens the poster
 * rail and the cropper read, so it followed the square to the 3:2 rectangle of
 * 28 Sep without a number being typed here. **There is no second crop and no
 * second aspect ratio anywhere in this path**, which is the whole of "they should
 * be the same"; a card is simply a smaller frame than a hero.
 *
 * ⚠ AND THE BOTTOM IS THE PROFILE PICTURE, drawn rather than described. It rode
 * the cover's edge on a negative margin before and only ever showed initials.
 * It sits IN the bottom block now, in the app's own squircle, with the picture in
 * it and the initials as the fallback they were meant to be.
 *
 * ⚠ NO STYLE TILES (27 Sep 2026, the user: "remove dance styles from studio,
 * artist and crew discover cards"). The rail says what a studio is better than a
 * row of words did, and the styles are on the studio's own page.
 *
 * The "{n} photos" chip went with them: it existed because there was one static
 * photo and no way to say there were more, and the dots under a real rail are
 * that fact told properly.
 */
export function StudioCard({ business, followers = 0, shots = [] }: { business: NearbyBusiness; followers?: number; shots?: CardShot[] }) {
  const grad = gradientOf(business.name);
  const photo = photoUrl(business.photoPath);
  const place = business.city ?? business.area ?? "—";
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState<Record<string, true>>({});
  const [faceBroken, setFaceBroken] = useState(false);
  const live = shots.filter((s) => !broken[s.key]);
  const many = live.length > 1;

  return (
    <Link
      href={publicProfilePath(business)}
      aria-label={`Open ${business.name}`}
      style={{
        display: "block",
        borderRadius: 20,
        overflow: "hidden",
        background: CARD,
        border: `1.5px solid ${EL}`,
        marginBottom: 12,
        color: INK,
        textDecoration: "none",
      }}
    >
      <div style={{ position: "relative" }}>
        <div
          role={many ? "region" : undefined}
          aria-label={many ? `${business.name} — ${live.length} pictures, swipe sideways` : undefined}
          data-testid="studio-card-rail"
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
          {live.length === 0 ? (
            /* nothing put up yet: the studio's own two colours, and no initials —
               the face on the line below already says who this is, and the same
               letters twice is a stutter (`HeroRail`'s own rule) */
            <div style={{ flex: "0 0 100%", aspectRatio: SHOT_RATIO, background: `linear-gradient(140deg, ${grad[0]}55, ${grad[1]}33), var(--el)` }} />
          ) : (
            live.map((s) => (
              <div key={s.key} style={{ flex: "0 0 100%", scrollSnapAlign: "center", position: "relative", aspectRatio: SHOT_RATIO, background: `linear-gradient(140deg, ${grad[0]}55, ${grad[1]}33), var(--el)` }}>
                <Image
                  src={s.src}
                  alt=""
                  fill
                  sizes="(max-width: 430px) 100vw, 430px"
                  style={{ objectFit: "cover" }}
                  unoptimized={Boolean(s.signed)}
                  /* a signed URL past its half hour, or an object gone from the
                     bucket, drops the slide rather than drawing a broken image */
                  onError={() => setBroken((b) => ({ ...b, [s.key]: true }))}
                />
              </div>
            ))
          )}
        </div>
        <FollowerPill n={followers} />
        {many ? (
          <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: 10, display: "flex", justifyContent: "center", gap: 5 }}>
            {live.map((s, i) => (
              <span
                key={s.key}
                style={{
                  width: i === idx ? 16 : 5,
                  height: 5,
                  borderRadius: 3,
                  background: i === idx ? "#fff" : "rgba(255,255,255,.45)",
                  boxShadow: "0 1px 3px rgba(0,0,0,.4)",
                  transition: "width .18s",
                }}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* THE BOTTOM: the profile picture and the other details (27 Sep 2026) */}
      <div style={{ padding: "12px 13px", minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <span
            style={{
              width: FACE,
              height: FACE,
              flexShrink: 0,
              position: "relative",
              borderRadius: Math.round(FACE * DISC_RADIUS),
              overflow: "hidden",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: `linear-gradient(150deg, ${grad[0]}, ${grad[1]})`,
              color: "#fff",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 0.5,
              fontFamily: DOS_DISPLAY,
              boxShadow: "0 6px 16px -8px rgba(0,0,0,.6)",
            }}
          >
            {photo && !faceBroken ? <Image src={photo} alt="" fill sizes={`${FACE}px`} style={{ objectFit: "cover" }} onError={() => setFaceBroken(true)} /> : initialsOf(business.name)}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {/* ⚠ `flex: 0 1 auto`, NOT `flex: 1` (2 Oct 2026, the user: "verified
                  badge … should be with the name"): a growing name pushed the tick
                  to the card's far edge; this one shrinks to the name and ellipsises
                  only when it must, so the tick sits beside the last letter */}
              <span style={{ flex: "0 1 auto", minWidth: 0, fontWeight: 900, fontSize: 17, letterSpacing: -0.4, fontFamily: DOS_DISPLAY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{business.name}</span>
              {business.verifiedAt ? <VerifiedTick size={15} /> : null}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, marginTop: 4 }}>
              {/* A DISTANCE ONLY WHEN IT IS ONE (11 Sep 2026). Until a business has
                  opened the location picker its lat/lng is its city's centroid, so
                  "2.4 km" is the distance to the middle of town — the same number
                  for every studio in the city, and a confident lie on a card that
                  is asking somebody to travel. Where the point was never chosen the
                  card says the place and stops. */}
              <DosWhere city={place} km={business.located ? kmLabel(business.distanceKm) : null} />
              {/* the follower count moved up onto the picture as a pill (2 Oct 2026) */}
            </span>
          </span>
        </div>
      </div>
    </Link>
  );
}
