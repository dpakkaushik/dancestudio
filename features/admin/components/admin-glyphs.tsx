import type { ReactNode } from "react";

/** THE PANEL'S ICONS (11 Sep 2026) — one per desk, in the same 24-grid stroke
 *  style as Home's tool glyphs, so a block on the admin Overview reads as a
 *  sibling of a tile on a studio's Home. Drawn here rather than pulled from a
 *  library: ten shapes, no dependency, and each one is chosen to say what the
 *  desk DOES rather than what it is called — a shield with a tick for the
 *  decision, a flag for what somebody raised, a repeating arrow for a plan that
 *  renews on its own. */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const I = (p: ReactNode, size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...S} aria-hidden="true">
    {p}
  </svg>
);

export type AdminGlyphKey =
  | "verifications"
  | "support"
  | "reports"
  | "money"
  | "subscriptions"
  | "plans"
  | "communication"
  | "accounts"
  | "businesses"
  | "audit"
  | "overview";

export function AdminGlyph({ k, size = 22 }: { k: AdminGlyphKey; size?: number }) {
  switch (k) {
    case "verifications":
      /* a shield, and the tick inside it — the decision this desk exists to make */
      return I(
        <>
          <path d="M12 3.5 5 6.2v5.3c0 4.3 3 7.6 7 8.9 4-1.3 7-4.6 7-8.9V6.2L12 3.5Z" />
          <path d="m8.8 12.1 2.1 2.1 4.3-4.6" />
        </>,
        size
      );
    case "support":
      /* two speech bubbles: a conversation, not an announcement */
      return I(
        <>
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h7A2.5 2.5 0 0 1 16 6.5v4a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 4 10.5v-4Z" />
          <path d="M16 9h1.5A2.5 2.5 0 0 1 20 11.5v4a2.5 2.5 0 0 1-2.5 2.5v2.5L14 18h-2" />
        </>,
        size
      );
    case "reports":
      /* a flag planted: somebody raised something */
      return I(
        <>
          <path d="M6 21V4" />
          <path d="M6 4h10.5l-1.6 3.2 1.6 3.3H6" />
        </>,
        size
      );
    case "money":
      /* the rupee */
      return I(
        <>
          <path d="M7 5h10M7 9h10" />
          <path d="M11 5c3.2 0 4.6 1.8 4.6 4S14.2 13 11 13H8l7 7" />
        </>,
        size
      );
    case "subscriptions":
      /* a cycle: it renews on its own */
      return I(
        <>
          <path d="M19 12a7 7 0 0 1-12.4 4.5" />
          <path d="M5 12a7 7 0 0 1 12.4-4.5" />
          <path d="M17.6 4v3.5H14M6.4 20v-3.5H10" />
        </>,
        size
      );
    case "plans":
      /* a price tag */
      return I(
        <>
          <path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7a2 2 0 0 1 1.4.6l6.9 6.9a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0L4.1 13.6a2 2 0 0 1-.6-1.4Z" />
          <circle cx="8.3" cy="8.3" r="1.4" />
        </>,
        size
      );
    case "communication":
      /* a megaphone: what the platform said */
      return I(
        <>
          <path d="M4 10.5v3a1.5 1.5 0 0 0 1.5 1.5H8l7 4V5l-7 4H5.5A1.5 1.5 0 0 0 4 10.5Z" />
          <path d="M18 9.5a3.5 3.5 0 0 1 0 5M8 15v4.5" />
        </>,
        size
      );
    case "accounts":
      /* people, more than one */
      return I(
        <>
          <circle cx="9" cy="8.5" r="3" />
          <path d="M3.5 19c.6-2.9 2.8-4.5 5.5-4.5S13.9 16.1 14.5 19" />
          <circle cx="17" cy="9.5" r="2.4" />
          <path d="M15.5 14.6c2.5.2 4.3 1.6 5 4.4" />
        </>,
        size
      );
    case "businesses":
      /* a storefront */
      return I(
        <>
          <path d="M4 9.5 5.5 4.5h13L20 9.5" />
          <path d="M4 9.5c0 1.4 1.1 2.5 2.5 2.5S9 10.9 9 9.5c0 1.4 1.3 2.5 3 2.5s3-1.1 3-2.5c0 1.4 1.1 2.5 2.5 2.5S20 10.9 20 9.5" />
          <path d="M5.5 12v8h13v-8M10 20v-5h4v5" />
        </>,
        size
      );
    case "audit":
      /* a ledger with lines: read after the fact */
      return I(
        <>
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" />
        </>,
        size
      );
    case "overview":
    default:
      return I(
        <>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
        </>,
        size
      );
  }
}

/** Each desk's colour — the tile wears it, the block on the Overview wears it,
 *  and the hero on the desk itself wears it, so a person learns "verification is
 *  the blue one" once. */
export const DESK_TINT: Record<AdminGlyphKey, string> = {
  overview: "#64748B",
  verifications: "#0EA5E9",
  support: "#7C3AED",
  reports: "#EF4444",
  money: "#22C55E",
  subscriptions: "#F59E0B",
  plans: "#EC4899",
  communication: "#8B5CF6",
  accounts: "#3B82F6",
  businesses: "#0D9488",
  audit: "#64748B",
};
