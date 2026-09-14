import Link from "next/link";
import type { CSSProperties } from "react";
import { DosStyleTile } from "@/features/discovery/components/DiscoverFilters";
import { DosShelfHead, HOME_TYPE, ToolGrid, type Tile } from "@/features/home/components/home-kit";
import { PassDeck } from "@/features/home/components/PassDeck";
import { ProfileShare } from "@/features/profiles/components/ProfileShare";
import { TYPE, gradientOf } from "@/features/profiles/components/profile-kit";
import { VerifiedTick } from "@/features/settings/components/settings-kit";
import { StudioPhotoRail } from "@/features/tenants/components/StudioPhotoRail";
import { dosStyleColor } from "@/lib/constants/styles";
import { CARD, DOS_DISPLAY, DOS_UI, INK, LILAC, LINE, PINK, SOLID, SUB } from "@/lib/design/tokens";
import type { DeckItem } from "@/types/home";
import type { Tenant } from "@/types/tenant";

const micro: CSSProperties = { fontSize: 9.5, fontWeight: 900, letterSpacing: 1.2, textTransform: "uppercase" };
const headLink: CSSProperties = { color: PINK, fontWeight: 800, cursor: "pointer", textDecoration: "none" };
const pillDark: CSSProperties = { display: "inline-block", padding: "9px 18px", borderRadius: 999, background: INK, color: SOLID, fontWeight: 900, fontSize: 11.5, cursor: "pointer", textDecoration: "none" };
const pillLight: CSSProperties = { display: "inline-block", padding: "9px 18px", borderRadius: 999, background: CARD, border: `1px solid ${LINE}`, fontWeight: 900, fontSize: 11.5, cursor: "pointer", color: INK, textDecoration: "none" };

/** ONE STUDIO'S OWN HOME (14 Sep 2026) — what a studio row on the hub opens.
 *
 *  The user, pressing a verified studio on the hub and landing on the classes
 *  register: *"I should get something like [the prototype's studio Home], with
 *  a scrollable header."* So this is the prototype's S_homebiz (7354-7660) —
 *  today's schedule as the deck asked the studio's question, then the Studio
 *  Tools grid — under the profile hero's photo swipe (S_profiletab 10575),
 *  because an organization runs several studios and each one is its own
 *  place, with its own pictures, its own rooms and its own day.
 *
 *  Nothing here is a second implementation: the deck is Home's `PassDeck`, the
 *  grid is Home's `ToolGrid`, the hero is the public page's square with the
 *  swipe the prototype always had on it. What the page ADDS is the composition
 *  — one studio, whole — and the register, which used to be where the row
 *  landed, is one of the tools. */
export function StudioHome({
  tenant,
  /** the pictures the hero swipes through — the public photo first, then the
   *  space as shown to DanceOS; empty draws the initials */
  shots,
  deck,
  roomCount,
  /** what it teaches, off its PUBLISHED classes — a studio with none says nothing (7419-7421) */
  styles,
  tiles,
}: {
  tenant: Tenant;
  shots: string[];
  deck: DeckItem[];
  roomCount: number;
  styles: string[];
  tiles: Tile[];
}) {
  const RG = gradientOf(tenant.name);
  const RC = RG[1];
  const place = [tenant.area, tenant.city].filter(Boolean).join(", ");
  const mapsHref = place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tenant.name} ${place}`)}` : null;
  const roomsWords = `${roomCount} room${roomCount === 1 ? "" : "s"}`;

  return (
    <div
      style={{
        background: LILAC,
        color: INK,
        maxWidth: 430,
        margin: "0 auto",
        fontFamily: DOS_UI,
        boxSizing: "border-box",
        paddingBottom: "var(--dos-foot)",
      }}
    >
      <div style={{ padding: "0 16px" }}>
        {/* ── the studio, lit like a player: its colour bleeding off the top, the
            photos as a swipe, then who it is in the order you read a business ── */}
        <div
          data-testid="studio-hero"
          style={{
            margin: "0 -16px",
            position: "relative",
            overflow: "hidden",
            background: `linear-gradient(180deg, ${RC}b8 0%, ${RC}55 46%, ${RC}18 74%, ${LILAC} 100%)`,
          }}
        >
          <StudioPhotoRail name={tenant.name} shots={shots} grad={RG} />

          <div style={{ padding: "10px 16px 14px" }}>
            <div style={{ ...micro, letterSpacing: 2.2, color: "rgba(255,255,255,.9)" }}>STUDIO</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <h1 style={{ ...TYPE.display, margin: 0, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tenant.name}</h1>
              {/* the badge — set when a DanceOS admin approved this studio */}
              {tenant.verifiedAt ? <VerifiedTick size={18} /> : null}
              {/* the studio's own code, to be held up at its door — the app's one share sheet (7381, 7424) */}
              <ProfileShare path={`/studio/${tenant.id}`} name={tenant.name} />
            </div>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 7, fontSize: 13, fontWeight: 800, color: INK }}>
              {place ? (
                mapsHref ? (
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open this address in Maps"
                    style={{ minWidth: 0, color: INK, textDecoration: "underline", textDecorationColor: LINE, textUnderlineOffset: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {place}
                  </a>
                ) : (
                  <span>{place}</span>
                )
              ) : null}
              {place ? <span style={{ color: LINE }}>·</span> : null}
              {/* "· N rooms" is the hub row's own sub-line (2655), and here it is a door */}
              <Link href={`/business/${tenant.id}/rooms`} aria-label="Rooms at this studio" style={{ color: SUB, textDecoration: "none", fontWeight: 800 }}>
                {roomsWords}
              </Link>
            </div>
            {styles.length ? (
              <div style={{ display: "flex", gap: 5, overflowX: "auto", scrollbarWidth: "none", marginTop: 12, alignItems: "center" }}>
                {styles.map((s) => (
                  <DosStyleTile key={s} label={s} color={dosStyleColor(s)} aria={`${s} — a style this studio teaches`} small />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* ── TODAY, AS THE SCHEDULE IT ACTUALLY IS (7500-7520): every class and
            event running in THIS studio's rooms today, one card each, in the
            order the day happens; a studio's doors are its own (7143-7150) ── */}
        <div data-dosfold="deck" style={{ margin: "10px -16px 14px", padding: "0 16px" }}>
          <DosShelfHead
            pad="2px 0 8px"
            right={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <Link href={`/business/${tenant.id}/classes`} aria-label="Classes at this studio" style={headLink}>
                  Classes
                </Link>
                <Link href={`/business/${tenant.id}/calendar`} aria-label="Open the studio calendar" style={headLink}>
                  Calendar ›
                </Link>
              </span>
            }
          >
            Today’s schedule
            <span style={{ ...HOME_TYPE.meta, color: SUB, marginLeft: 8 }}>{deck.length} today</span>
          </DosShelfHead>

          {deck.length === 0 ? (
            <div style={{ background: CARD, border: `1.5px dashed ${LINE}`, borderRadius: 16, padding: "16px", textAlign: "center" }}>
              <div style={{ fontSize: 12.5, fontWeight: 900 }}>Nothing in your rooms today</div>
              <div style={{ fontSize: 10.5, color: SUB, marginTop: 3 }}>Every class and event running in this studio’s rooms shows up here on the day.</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
                <Link href="/managed" style={pillLight}>
                  See everything you manage
                </Link>
                <Link href={`/business/${tenant.id}/calendar`} aria-label="Open the studio calendar" style={pillDark}>
                  Open the calendar
                </Link>
              </div>
            </div>
          ) : (
            <PassDeck items={deck} />
          )}
        </div>

        {/* ── STUDIO TOOLS (7590-7620): the same tile language as Home's grid, and
            every door is THIS studio's ── */}
        <div style={{ position: "relative", zIndex: 1, background: LILAC, marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.3, color: INK, fontFamily: DOS_DISPLAY, margin: "4px 0 7px" }}>Studio Tools</div>
          <ToolGrid tiles={tiles} />
        </div>
      </div>
    </div>
  );
}
