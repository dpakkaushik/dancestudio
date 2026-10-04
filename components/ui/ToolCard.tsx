import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { DISC_RADIUS, DOS_DISPLAY, INK, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";

/** ONE CARD ANATOMY FOR EVERY HOME TOOL (3 Oct 2026, the user: *"Home Tools inside
 *  on all profiles — better and bigger cards for Crew, Studio, Routines, Team,
 *  Students, membership, practice. each has a profile linked to it which should be
 *  visible with profile pic and name and big. rest all details arranged properly
 *  according to the tool. different looking cards for each tool according to their
 *  fields. buttons segregated as well. find an overall solution for this"*).
 *
 *  The overall solution is THREE BANDS, always in this order, whatever the tool:
 *
 *   1. THE PROFILE — `ToolHead`: the profile the card is linked to, at the size of
 *      a profile (a 58px squircle and the name in the display face), over a wash
 *      of the tool's own colour. A crew card leads with the crew, a team card with
 *      the person, a routine with whoever made it, a pass with whoever sold it, a
 *      practice with the crew that called it.
 *   2. THE TOOL'S OWN FIELDS — `ToolBody`, `ToolTitle`, `ToolFacts`: what differs
 *      per tool lives here, which is what makes seven cards read as seven things
 *      instead of one list wearing seven labels. Facts are tiles of label + figure,
 *      so a number is read as a number rather than parsed out of a sentence.
 *   3. THE BUTTONS — `ToolActions`: a bar of its own under a hairline, so what the
 *      card SAYS and what you can DO with it are never mixed in one line.
 *
 *  ⚠ A CARD THAT OPENS STILL HAS BUTTONS INSIDE IT. An anchor inside an anchor is
 *  invalid HTML (the 3 Oct routine-card hydration error), so `href` draws ONE link
 *  stretched over the card under everything, the content above it with pointer
 *  events off, and `ToolActions` / `ToolLive` switch them back on for what is
 *  really pressable — the studio card's pattern since 15 Sep 2026.
 *
 *  ⚠ NO STATE AND NO HOOKS, so a server component (the Crews hub) can draw it as
 *  readily as a client desk. */

export type ToolBtnKind = "primary" | "tinted" | "secondary" | "danger";

/** black or white, whichever reads on a solid `#rrggbb` (WCAG relative luminance);
 *  anything that is not a six-digit hex is treated as dark and gets white */
export function inkOn(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  /* white wins while it gives at least what black would — the crossover is ~0.18 */
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.05) ? "#fff" : "#141414";
}

/** the one button of the action bar — every tool's buttons are this shape */
export function toolBtn(kind: ToolBtnKind, tint: string, extra?: CSSProperties): CSSProperties {
  const paint: Record<ToolBtnKind, CSSProperties> = {
    /* ⚠ THE INK IS PICKED FROM THE TINT, not assumed white: an owner's amber and a
       style's yellow are light, and white on them measured ~2:1 */
    primary: { background: tint, color: inkOn(tint), borderColor: tint },
    /* ⚠ INK, not the tint, as the WORD — a tint coloured on its own 8% wash is
       readable on one theme's card and not the other's; the tint is the ring */
    tinted: { background: `${tint}1f`, color: INK, borderColor: `${tint}77` },
    secondary: { background: "transparent", color: INK, borderColor: "var(--el)" },
    danger: { background: "transparent", color: "#F87171", borderColor: "var(--el)" },
  };
  return {
    flex: "1 1 0",
    minWidth: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 12px",
    borderRadius: 999,
    border: "1.5px solid",
    fontSize: 12,
    fontWeight: 900,
    fontFamily: "inherit",
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    ...paint[kind],
    ...extra,
  };
}

/** a status word on the head's right edge — LIVE, LEADER, ACTIVE, DRAFT… */
export function ToolChip({ word, fg, bg, testId }: { word: string; fg: string; bg: string; testId?: string }) {
  return (
    <span data-testid={testId} style={{ flexShrink: 0, alignSelf: "flex-start", fontSize: 9, fontWeight: 900, letterSpacing: 0.7, padding: "4px 9px", borderRadius: 999, background: bg, color: fg, border: `1.5px solid ${fg}33` }}>
      {word}
    </span>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "·";

/** THE FACE — the app's squircle (`DISC_RADIUS`), the picture when there is one
 *  and initials on the tool's colour when there is not; never an empty box. */
export function ToolFace({ name, photoPath, tint, size = 58, icon }: { name: string; photoPath: string | null | undefined; tint: string; size?: number; icon?: ReactNode }) {
  const src = photoUrl(photoPath);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: size * DISC_RADIUS,
        flexShrink: 0,
        overflow: "hidden",
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${tint}, ${tint}99)`,
        color: inkOn(tint),
        fontSize: size * 0.34,
        fontWeight: 900,
        boxShadow: `0 0 0 2px var(--card), 0 0 0 3.5px ${tint}55`,
      }}
    >
      {src ? <Image src={src} alt="" fill sizes={`${size}px`} style={{ objectFit: "cover" }} /> : (icon ?? initialsOf(name))}
    </span>
  );
}

/** BAND 1 — the profile the card belongs to, big. `href` makes the face and the
 *  name a door of their own; leave it out on a card whose whole surface opens. */
export function ToolHead({
  tint,
  name,
  photoPath,
  eyebrow,
  sub,
  right,
  afterName,
  href,
  hrefLabel,
  icon,
  size = 58,
  onFace,
  faceLabel,
}: {
  /** the FACE alone is a button — an asset's picture opens itself (4 Oct 2026).
   *  Not used with `href`, which already makes the face a door. */
  onFace?: () => void;
  faceLabel?: string;
  tint: string;
  /** the linked profile's name — the head's title */
  name: string;
  photoPath: string | null | undefined;
  /** what the profile is to this card — CREW · YOU LEAD, FACULTY · ARTIST … */
  eyebrow: ReactNode;
  sub?: ReactNode;
  /** a status chip, or the owner's arrows */
  right?: ReactNode;
  /** beside the name — the verified tick, "· you" */
  afterName?: ReactNode;
  href?: string;
  hrefLabel?: string;
  icon?: ReactNode;
  size?: number;
}) {
  const face = <ToolFace name={name} photoPath={photoPath} tint={tint} size={size} icon={icon} />;
  const who = (
    <>
      {onFace && !href ? (
        <button type="button" onClick={onFace} aria-label={faceLabel ?? name} style={{ padding: 0, margin: 0, border: "none", background: "none", cursor: "zoom-in", lineHeight: 0, flexShrink: 0, borderRadius: size * DISC_RADIUS, pointerEvents: "auto" }}>
          {face}
        </button>
      ) : (
        face
      )}
      <span style={{ flex: 1, minWidth: 0, display: "block" }}>
        <span style={{ display: "block", fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: "uppercase", color: tint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eyebrow}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, marginTop: 2 }}>
          <span style={{ minWidth: 0, fontFamily: DOS_DISPLAY, fontSize: 18, fontWeight: 800, letterSpacing: -0.4, lineHeight: 1.18, color: INK, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{name}</span>
          {afterName}
        </span>
        {sub ? <span style={{ display: "block", fontSize: 11.5, color: SUB, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span> : null}
      </span>
    </>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 14px 13px", background: `linear-gradient(135deg, ${tint}24, ${tint}08 62%, transparent)` }}>
      {href ? (
        <Link href={href} aria-label={hrefLabel} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 13, color: INK, textDecoration: "none", pointerEvents: "auto" }}>
          {who}
        </Link>
      ) : (
        who
      )}
      {/* ⚠ NOT pointer-events auto: a status chip is not a control, and on a card
          that opens it must not swallow the press. Arrows set their own. */}
      {right ? <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>{right}</span> : null}
    </div>
  );
}

/** BAND 2's container — the tool's own fields, under a hairline from the head */
export function ToolBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ padding: "12px 14px", borderTop: "1.5px solid var(--el)", ...style }}>{children}</div>;
}

/** the OBJECT the card is about, when it is not the profile — a pass's name, a
 *  routine's, a practice's hour. A kicker over it says what kind of thing it is. */
export function ToolTitle({ kicker, children, after, size = 16 }: { kicker?: ReactNode; children: ReactNode; after?: ReactNode; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {kicker ? <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase", marginBottom: 3 }}>{kicker}</div> : null}
        <div style={{ fontSize: size, fontWeight: 900, letterSpacing: size > 18 ? -0.5 : -0.25, lineHeight: size > 18 ? 1.15 : 1.25, overflowWrap: "anywhere" }}>{children}</div>
      </div>
      {after}
    </div>
  );
}

export interface ToolFact {
  label: string;
  value: ReactNode;
  /** colours the figure — a status that IS a figure (LIVE, PAID) */
  tint?: string;
  testId?: string;
}

/** figures as tiles — label under a number, read across a list without parsing */
export function ToolFacts({ items, tint, style }: { items: ToolFact[]; tint: string; style?: CSSProperties }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 6, ...style }}>
      {items.map((f) => (
        <div key={f.label} style={{ borderRadius: 12, background: `${tint}0f`, border: "1.5px solid var(--el)", padding: "8px 6px 7px", textAlign: "center", minWidth: 0 }}>
          <div data-testid={f.testId} style={{ fontSize: 15.5, fontWeight: 900, lineHeight: 1.1, color: f.tint ?? INK, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {f.value}
          </div>
          <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, color: MUTED, marginTop: 3, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</div>
        </div>
      ))}
    </div>
  );
}

/** something inside the body that is really pressable (a form, a disclosure) */
export function ToolLive({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ pointerEvents: "auto", ...style }}>{children}</div>;
}

/** BAND 3 — the buttons, on their own bar */
export function ToolActions({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 12px 12px", borderTop: "1.5px solid var(--el)", pointerEvents: "auto" }}>{children}</div>;
}

/** THE CARD — the three bands in one frame. `href` stretches one link over it. */
export function ToolCard({
  children,
  testId,
  href,
  hrefLabel,
  dim = false,
  edge,
}: {
  children: ReactNode;
  testId?: string;
  href?: string;
  hrefLabel?: string;
  /** a called-off practice, a declined invite — still readable, plainly not live */
  dim?: boolean;
  /** a coloured left edge — a team member's label colour */
  edge?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        position: "relative",
        background: "var(--card)",
        border: "1.5px solid var(--el)",
        borderLeft: edge ? `4px solid ${edge}` : "1.5px solid var(--el)",
        borderRadius: 20,
        overflow: "hidden",
        marginBottom: 12,
        color: INK,
        opacity: dim ? 0.74 : 1,
      }}
    >
      {href ? <Link href={href} aria-label={hrefLabel} style={{ position: "absolute", inset: 0, zIndex: 0 }} /> : null}
      <div style={{ position: "relative", zIndex: 1, pointerEvents: href ? "none" : "auto" }}>{children}</div>
    </div>
  );
}
