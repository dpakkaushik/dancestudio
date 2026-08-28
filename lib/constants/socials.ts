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
