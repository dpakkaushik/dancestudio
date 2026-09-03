import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { DOS_DISPLAY, GOLD, PINK } from "@/lib/design/tokens";
import { isPlatform, type Platform } from "@/lib/constants/socials";
import { useCloseOnBack } from "@/lib/hooks/useCloseOnBack";
import type { ProfileRole } from "@/types/profile";

/** The Profile tab's small parts, lifted from the prototype so the own page and
 *  the person page draw the same marks: the brand tiles (8512-8552), the
 *  metal tiers (DOS_TIERS 1418), the rings a role wears (DOS_RINGS 1462), the
 *  type scale (DOS_TYPE 3427) and the sheet chrome every sheet shares. */

export const TYPE = {
  display: { fontSize: 34, fontWeight: 900, letterSpacing: -1.4, lineHeight: 1.02, fontFamily: DOS_DISPLAY } as CSSProperties,
  shelf: { fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1.2, fontFamily: DOS_DISPLAY } as CSSProperties,
  micro: { fontSize: 9.5, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase" } as CSSProperties,
};

/** DOS_RINGS (1462): the metal each role wears */
export const ROLE_RING: Record<ProfileRole, [string, string]> = {
  studio: ["#F9E27D", "#B8860B"],
  trainer: ["#F2F2F2", "#8E9BAE"],
  dancer: ["#F0BC8A", "#8C5A2B"],
};

/** WHERE YOU STAND (1418): one number, and the metal it earns */
export const DOS_TIERS = {
  gold: { k: "gold", label: "Gold", ring: ["#FDE68A", "#B45309"], text: "#F2C14E" },
  silver: { k: "silver", label: "Silver", ring: ["#F1F5F9", "#64748B"], text: "#D8DEE6" },
  bronze: { k: "bronze", label: "Bronze", ring: ["#E9B183", "#8A4A22"], text: "#D08A5A" },
  blue: { k: "blue", label: "Ranked", ring: ["#7DD3FC", "#2563EB"], text: "#7DD3FC" },
} as const;
export const tierOf = (rank: number) => DOS_TIERS[rank <= 3 ? "gold" : rank <= 10 ? "silver" : rank <= 50 ? "bronze" : "blue"];

export const initialsOf = (name: string) => name.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "D";

/* ── brand marks: one square tile silhouette, each brand's real glyph inside (8518) ── */
function BrandTile({ size = 19, bg, grad, children }: { size?: number; bg?: string; grad?: { id: string; stops: Array<[string, string]> }; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, display: "block" }} aria-hidden="true">
      {grad ? (
        <defs>
          <radialGradient id={grad.id} cx="30%" cy="107%" r="150%">
            {grad.stops.map(([o, c]) => (
              <stop key={o} offset={o} stopColor={c} />
            ))}
          </radialGradient>
        </defs>
      ) : null}
      <rect x="0" y="0" width="24" height="24" rx="5.75" fill={grad ? `url(#${grad.id})` : bg} />
      {children}
    </svg>
  );
}
const YtIcon = ({ size }: { size: number }) => (
  <BrandTile size={size} bg="#FF0000">
    <path fill="#fff" d="M18.6 9.1a2 2 0 0 0-1.4-1.42C15.97 7.35 12 7.35 12 7.35s-3.97 0-5.2.33A2 2 0 0 0 5.4 9.1C5.07 10.35 5.07 12 5.07 12s0 1.65.33 2.9a2 2 0 0 0 1.4 1.42c1.23.33 5.2.33 5.2.33s3.97 0 5.2-.33a2 2 0 0 0 1.4-1.42c.33-1.25.33-2.9.33-2.9s0-1.65-.33-2.9zM10.62 14.4V9.6L14.78 12l-4.16 2.4z" />
  </BrandTile>
);
const IgIcon = ({ size }: { size: number }) => (
  <BrandTile size={size} grad={{ id: "dosIg", stops: [["0%", "#FDF497"], ["5%", "#FDF497"], ["45%", "#FD5949"], ["60%", "#D6249F"], ["90%", "#285AEB"]] }}>
    <rect x="6.6" y="6.6" width="10.8" height="10.8" rx="3.4" fill="none" stroke="#fff" strokeWidth="1.55" />
    <circle cx="12" cy="12" r="2.75" fill="none" stroke="#fff" strokeWidth="1.55" />
    <circle cx="16.35" cy="7.65" r="1" fill="#fff" />
  </BrandTile>
);
const FbIcon = ({ size }: { size: number }) => (
  <BrandTile size={size} bg="#1877F2">
    <path fill="#fff" d="M14.9 8.05h-1.32c-.32 0-.53.21-.53.53v1.6h1.85l-.28 1.95h-1.57v6.37h-2.06v-6.37H9.3v-1.95h1.69V8.4c0-1.53.97-2.5 2.5-2.5h1.41v2.15z" />
  </BrandTile>
);
const WaIcon = ({ size }: { size: number }) => (
  <BrandTile size={size} bg="#25D366">
    <path fill="#fff" d="M12 5.1a6.7 6.7 0 0 0-5.72 10.2L5.4 18.6l3.4-.88A6.7 6.7 0 1 0 12 5.1zm0 1.5a5.2 5.2 0 0 1 0 10.4 5.2 5.2 0 0 1-2.77-.8l-.3-.19-1.72.45.46-1.67-.2-.31A5.2 5.2 0 0 1 12 6.6z" />
    <path fill="#fff" d="M10.13 9.05c-.13-.3-.27-.3-.4-.31h-.34c-.12 0-.31.05-.47.23-.17.18-.63.61-.63 1.5 0 .88.64 1.73.73 1.85.09.12 1.24 1.98 3.06 2.7 1.51.6 1.82.48 2.15.45.33-.03 1.06-.44 1.21-.86.15-.42.15-.78.11-.85-.05-.08-.17-.12-.35-.21-.18-.1-1.07-.53-1.24-.59-.16-.06-.28-.09-.4.1-.13.18-.48.6-.59.72-.1.12-.21.13-.39.04-.18-.09-.77-.28-1.46-.9-.54-.48-.9-1.08-1.01-1.27-.11-.18-.01-.28.07-.37.08-.08.18-.21.27-.32.09-.1.12-.18.18-.3.06-.12.03-.22-.01-.32-.05-.09-.41-.98-.56-1.33z" />
  </BrandTile>
);
const XIcon = ({ size }: { size: number }) => (
  <BrandTile size={size} bg="#000000">
    <path fill="#fff" d="M15.9 6.6h-1.6l-2.3 2.8-1.95-2.8H7.2l3.3 4.6-3.5 4.4h1.62l2.47-3.06 2.13 3.06h2.72l-3.5-4.85 3.46-4.15z" />
  </BrandTile>
);
const LiIcon = ({ size }: { size: number }) => (
  <BrandTile size={size} bg="#0A66C2">
    <circle cx="7.6" cy="7.9" r="1.4" fill="#fff" />
    <path fill="#fff" d="M6.45 10.35h2.3v7.3h-2.3zM10.6 10.35h2.2v1c.37-.63 1.15-1.17 2.28-1.17 1.72 0 2.52 1.06 2.52 3.02v4.45h-2.3v-4.1c0-.97-.35-1.47-1.13-1.47-.72 0-1.17.48-1.17 1.47v4.1h-2.4z" />
  </BrandTile>
);
const SpIcon = ({ size }: { size: number }) => (
  <BrandTile size={size} bg="#1DB954">
    <path fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" d="M7.6 9.6c2.8-.8 5.9-.55 8.4.9M8.1 12.25c2.3-.62 4.9-.4 6.95.75M8.6 14.85c1.85-.5 3.9-.32 5.6.62" />
  </BrandTile>
);
const WebIcon = ({ size }: { size: number }) => (
  <BrandTile size={size} bg="#7C3AED">
    <g fill="none" stroke="#fff" strokeWidth="1.4">
      <circle cx="12" cy="12" r="5.6" />
      <ellipse cx="12" cy="12" rx="2.45" ry="5.6" />
      <path d="M6.5 10.3h11M6.5 13.7h11" />
    </g>
  </BrandTile>
);

/** PlatformIcon (8624): the brand's own mark, or the web tile for anything else */
export function PlatformIcon({ label, size = 19 }: { label: string; size?: number }) {
  const p: Platform | null = isPlatform(label) ? label : null;
  switch (p) {
    case "YouTube":
      return <YtIcon size={size} />;
    case "Instagram":
      return <IgIcon size={size} />;
    case "Facebook":
      return <FbIcon size={size} />;
    case "WhatsApp":
      return <WaIcon size={size} />;
    case "X (Twitter)":
      return <XIcon size={size} />;
    case "LinkedIn":
      return <LiIcon size={size} />;
    case "Spotify":
      return <SpIcon size={size} />;
    default:
      return <WebIcon size={size} />;
  }
}

/* ── the sheet chrome every profile sheet shares (11141, 11162, 11218, 11336, 11365) ── */
export function Sheet({ label, onClose, children, maxHeight = "80vh" }: { label: string; onClose: () => void; children: ReactNode; maxHeight?: string }) {
  useCloseOnBack(onClose);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 600 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--solid)", borderRadius: "24px 24px 0 0", padding: "16px 16px 26px", width: "100%", maxWidth: 430, boxSizing: "border-box", maxHeight, overflowY: "auto", color: "var(--text)", animation: "dosSheetUp .28s cubic-bezier(.22,.9,.34,1)" }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--el)", margin: "0 auto 12px" }} />
        {children}
      </div>
    </div>
  );
}

export const fieldLabel: CSSProperties = { fontSize: 11.5, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--muted)", margin: "14px 0 6px" };
export const fieldInput: CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 12, padding: "11px 14px", fontSize: 14, color: "var(--text)", outline: "none", fontFamily: "inherit" };
export const sheetBtn = (primary: boolean): CSSProperties => ({
  flex: 1,
  textAlign: "center",
  padding: 12,
  borderRadius: 12,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  background: primary ? "var(--text)" : "var(--card)",
  color: primary ? "var(--solid)" : "var(--text)",
  border: primary ? "1.5px solid var(--text)" : "1.5px solid var(--el)",
});
export const dangerBtn: CSSProperties = { padding: "12px 16px", borderRadius: 12, background: "var(--card)", border: "1.5px solid #EF4444", color: "#EF4444", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };

/* ── every name wears a gradient of its own until a real photo arrives — the same
   six the Discover card draws from (StudioCard GRADS) ── */
const GRADS: [string, string][] = [
  ["#E84393", "#F39C12"],
  ["#3B82F6", "#7C3AED"],
  ["#922B21", "#00CEC9"],
  ["#8E44AD", "#E84393"],
  ["#7C3AED", "#EC4899"],
  ["#0D9488", "#3498DB"],
];
const hashOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
};
export const gradientOf = (name: string): [string, string] => GRADS[hashOf(name) % GRADS.length];

/** "1.2k" — the prototype's fmtF (4189) */
export const fmtFollowers = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

/* ── the place, underlined in the line's own grey, and it opens Maps (10694-10698;
   dosOpenMaps 206 builds the same URL) ── */
export const mapsHref = (place: string) => `https://maps.google.com/?q=${encodeURIComponent(place)}`;
export function PlaceLink({ prefix, place, query }: { prefix?: string; place: string; query?: string }) {
  return (
    <a
      href={mapsHref(query ?? place)}
      target="_blank"
      rel="noreferrer"
      aria-label="Open this address in Maps"
      style={{ fontWeight: 800, color: "var(--text)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "var(--el)", textUnderlineOffset: 3, fontVariantNumeric: "tabular-nums" }}
    >
      {prefix ?? ""}
      {place}
    </a>
  );
}

/* ── the 42px mark every people-row wears (11007-11010): the entity's own
   gradient and its initials in display type, or its picture when it has one ── */
export function EntityMark({ name, photo, size = 42, radius = 13 }: { name: string; photo?: string | null; size?: number; radius?: number }) {
  const g = gradientOf(name);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, borderRadius: radius, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center", background: `linear-gradient(150deg,${g[0]},${g[1]})`, color: "#fff", fontSize: 15, fontWeight: 900, letterSpacing: 0.4, fontFamily: DOS_DISPLAY }}
    >
      {photo ? <Image src={photo} alt="" width={size} height={size} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : initialsOf(name)}
    </span>
  );
}

/* ── THE PEOPLE, IN ONE LANGUAGE (11000-11030): a Group headed with the word and
   its count, a Row per entity — mark, name, role in the group's colour, and the
   row itself opens their page, ending in the › ── */
export function Group({ title, n, children }: { title: string; n: number; children: ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <span style={{ ...TYPE.shelf, color: "var(--text)" }}>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{n}</span>
      </div>
      <div style={{ background: "var(--card)", border: "1px solid var(--el)", borderRadius: 16, padding: "2px 11px" }}>{children}</div>
    </div>
  );
}

export function Row({ href, title, sub, subColor, right, photo, markName }: { href?: string; title: string; sub?: string; subColor?: string; right?: string; photo?: string | null; markName?: string }) {
  const body = (
    <>
      <EntityMark name={markName ?? title} photo={photo} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        {sub ? <span style={{ display: "block", ...TYPE.micro, color: subColor ?? "var(--muted)", marginTop: 3 }}>{sub}</span> : null}
      </span>
      {right ? <span style={{ ...TYPE.micro, color: GOLD, flexShrink: 0 }}>{right}</span> : null}
      <span aria-hidden="true" style={{ flexShrink: 0, color: "var(--el)", fontSize: 15, fontWeight: 600 }}>›</span>
    </>
  );
  const style: CSSProperties = { display: "flex", alignItems: "center", gap: 11, padding: "9px 4px", minWidth: 0, color: "var(--text)", textDecoration: "none" };
  return href ? (
    <Link href={href} aria-label={`Open ${title}`} style={style}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}

/* ── THE TWO ROWS OF ACTIONS (10875-10920). The small row: the things you can do
   TO somebody, 38px tall, 11px type, as many equal cells as there are acts; the
   one that is ON keeps the ground and takes a lit edge in the page's own colour.
   The big white row: the places this profile GOES, 42px, the page's own metal. ── */
export const smallBox = (on: boolean, accent: string): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  height: 38,
  borderRadius: 11,
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 11,
  boxSizing: "border-box",
  padding: "0 4px",
  overflow: "hidden",
  whiteSpace: "nowrap",
  background: "var(--card)",
  color: "var(--text)",
  border: `1px solid ${on ? accent : "var(--el)"}`,
  boxShadow: on ? `0 0 0 1px ${accent}55` : "none",
  width: "100%",
  fontFamily: "inherit",
  textDecoration: "none",
});
export const actionRow = (n: number, small: boolean): CSSProperties => ({ display: "grid", gridTemplateColumns: `repeat(${n},1fr)`, gap: small ? 6 : 8 });
export const bigWhite: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, borderRadius: 12, cursor: "pointer", fontWeight: 900, fontSize: 12.5, boxSizing: "border-box", padding: "0 6px", whiteSpace: "nowrap", overflow: "hidden", background: "var(--text)", color: "var(--solid)", border: "1.5px solid var(--text)", textDecoration: "none" };
export const SchedIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
    <path d="M3.5 9.5h17M8.5 4.5v-2M15.5 4.5v-2" />
  </svg>
);
export const StatsIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M4 20h16" />
    <path d="M6.5 20v-6M12 20V8.5M17.5 20V4.5" />
  </svg>
);

/* ── the badge hung bottom-right of a follower's face (11353-11355): an 18px
   circle in the account type's tint with the type's glyph on it. Three small
   marks drawn here — a dancer mid-step, an artist with an arm raised, a studio as
   a building — because the prototype's ChoreoI / ArtistI / StudioI are not lifted
   and a follow of a crew does not exist yet (CrewI in crew-kit is the fourth,
   when it does). ── */
export type FollowGlyph = "dancer" | "artist" | "studio";
export function RoleGlyph({ kind, size = 11 }: { kind: FollowGlyph; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "studio" ? (
        <path d="M4 20V9l8-5 8 5v11M4 20h16M10 20v-5h4v5" />
      ) : (
        <>
          <circle cx="12" cy="5" r="2.2" fill="currentColor" stroke="none" />
          <path d="M12 8v6M12 14l-3.5 6M12 14l3.5 6" />
          {kind === "artist" ? <path d="M12 9.5l-4 2.5M12 9.5l4-4.5" /> : <path d="M12 9.5l-4 2.5M12 9.5l4 2.5" />}
        </>
      )}
    </svg>
  );
}
/** The colour a follow row wears, by what the follower IS (S_profiletab
 *  11335). Lives here rather than in either sheet, because a business's
 *  Followers sheet and a person's are the same list of the same people and a
 *  dancer who is pink on one and blue on the other is two answers to one
 *  question. */
export const followTint = (role: "dancer" | "trainer" | "studio" | "artist" | "studio-biz" | "artist-biz") =>
  role === "dancer" ? PINK : role === "trainer" || role === "artist-biz" ? GOLD : "#3498DB";

export function RoleBadge({ kind, tint }: { kind: FollowGlyph; tint: string }) {
  return (
    <span aria-hidden="true" style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, background: tint, border: "2px solid var(--bg)", boxSizing: "content-box", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
      <RoleGlyph kind={kind} />
    </span>
  );
}
