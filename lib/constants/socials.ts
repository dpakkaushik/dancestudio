/** The platforms a profile can link to (prototype PLATFORMS 8623) and the tint
 *  each wears (PLATFORM_TINT 8554). Anything else is a custom label — "Linktree"
 *  — and draws the generic link mark. */
export const PLATFORMS = ["YouTube", "Instagram", "Facebook", "WhatsApp", "X (Twitter)", "LinkedIn", "Spotify", "Website"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_TINT: Record<Platform, string> = {
  YouTube: "#FF0000",
  Instagram: "#C13584",
  Facebook: "#1877F2",
  WhatsApp: "#25D366",
  "X (Twitter)": "#1F2937",
  LinkedIn: "#0A66C2",
  Spotify: "#1DB954",
  Website: "#7C3AED",
};

export const isPlatform = (s: string): s is Platform => (PLATFORMS as readonly string[]).includes(s);

/** the handle a URL ends in — "@rheamoves" — the way the chip prints it (10786) */
export const handleOf = (url: string): string => {
  const s = String(url || "").replace(/\/+$/, "");
  const seg = s.split("/").filter(Boolean).pop() || s;
  return seg.startsWith("@") ? seg : "@" + seg.replace(/^www\./, "");
};

/** A LINK IS ONLY EVER AN http(s) ADDRESS (11 Sep 2026).
 *
 *  Every one of these rails renders `href={l.url}`, and the value comes from
 *  the database — so it is only as trustworthy as the narrowest door that can
 *  write it. Until this date the narrowest door was a direct PostgREST PATCH,
 *  which validated nothing, and `javascript:alert(1)` could be stored as a
 *  business's Instagram link and rendered on its public page and in the
 *  admin's own verification queue (scripts/rls-proof-tenant-columns.ps1).
 *
 *  The database keeps the rule now — a CHECK on both socials columns — and
 *  this keeps it a second time, at the last moment before the browser sees it.
 *  Two independent guards, because the cost of the second one is a function
 *  call and the cost of being wrong is a script running on somebody else's
 *  session. An address that is not http(s) is dropped rather than shown:
 *  a dead chip is better than a live one that lies about where it goes. */
export const safeHref = (url: string | null | undefined): string | null => {
  const s = String(url ?? "").trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : null;
};
