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
/* ⚠⚠ THE USERNAME, NOT THE LINK (2 Oct 2026, the user: "social media links
   should only use the username from the pasted link to show on profile right
   now whole link becomes the chip"). The old rule took the LAST piece of the
   address as it stood, so what a phone's share button pastes —
   `instagram.com/rheamoves/?igsh=MWx…`, `youtube.com/@rhea/featured`,
   `facebook.com/profile.php?id=1000…`, `linkedin.com/in/rhea-k/` — printed the
   tracking string or the sub-page as the handle. Now the query and the fragment
   are dropped, each platform's own shape picks the segment that IS the person,
   and only a link that names nobody falls back to the site. */
const NOT_A_HANDLE = new Set(["in", "c", "channel", "user", "pages", "people", "u", "profile", "add", "featured", "videos", "shorts", "reels", "posts", "about", "p", "reel", "tv", "watch", "status"]);
export const handleOf = (url: string): string => {
  const raw = String(url || "").trim();
  let host = "";
  let segs: string[] = [];
  let query = new URLSearchParams();
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    host = u.hostname.replace(/^(www|m|mobile)\./, "");
    segs = u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
    query = u.searchParams;
  } catch {
    segs = raw.split(/[?#]/)[0].split("/").filter(Boolean);
  }
  const at = (s: string) => (s.startsWith("@") ? s : `@${s}`);
  // a page that names its owner in the query (facebook.com/profile.php?id=…)
  if (segs[0] === "profile.php" && query.get("id")) return at(query.get("id") as string);
  // an @handle anywhere in the path is the handle (youtube.com/@rhea/featured, tiktok.com/@rhea/video/…)
  const atSeg = segs.find((s) => s.startsWith("@") && s.length > 1);
  if (atSeg) return atSeg;
  // linkedin.com/in/{name}, youtube.com/c/{name}, …/user/{name}: the segment after the prefix
  const named = segs.findIndex((s) => NOT_A_HANDLE.has(s.toLowerCase()));
  if (named === 0 && segs[1] && !NOT_A_HANDLE.has(segs[1].toLowerCase())) return at(segs[1]);
  // otherwise the FIRST segment is the account (instagram.com/rhea/reels → @rhea)
  const first = segs.find((s) => !NOT_A_HANDLE.has(s.toLowerCase()));
  if (first) return at(first);
  return host || raw;
};

/** A LINK IS ONLY EVER AN http(s) ADDRESS (11 Sep 2026).
 *
 *  Every one of these rails renders `href={l.url}`, and the value comes from
 *  the database — so it is only as trustworthy as the narrowest door that can
 *  write it. Until this date the narrowest door was a direct PostgREST PATCH,
 *  which validated nothing, and `javascript:alert(1)` could be stored as a
 *  business's Instagram link and rendered on its public page and in the
 *  admin's own verification queue (scripts/rls-proof-business-columns.ps1).
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
