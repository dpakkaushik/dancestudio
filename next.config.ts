import type { NextConfig } from "next";

/** The uploaded photos live in a PUBLIC Supabase Storage bucket, so next/image
 *  needs the host named before it will optimise them. One pattern, one bucket,
 *  read from the same env var the client uses — nothing else is allowed through. */
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  images: supabaseHost
    ? {
        remotePatterns: [
          { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/media/**" },
        ],
      }
    : undefined,

  /** Gravestones for the phone channel deleted in 88ef3bb (Rule 26).
   *
   *  Deleting a route does not only remove it from the site — it strips the URL
   *  out from under everyone already standing on it. The installed TWA is the
   *  sharp case: Chrome persists web state per app, so an app last closed on
   *  /login/phone reopens there after the deploy and shows a bare 404 with no
   *  address bar to explain which URL failed. It looks like a broken build. It
   *  is a broken URL. Bookmarks and the back button do the same thing quieter.
   *
   *  Both point at /login/email rather than a channel-faithful twin, because
   *  the destination has to be somewhere a person can ACT. /login/verify's
   *  nearest equivalent is /login/check-email, but arriving there with no
   *  pending link is a dead end reading "we sent a link to " — /login/email is
   *  the screen that actually gets them in. Query strings ride along, so the
   *  old /login/verify?via=whatsapp lands intact and harmless.
   *
   *  TEMPORARY (307), not permanent (308), and the distinction matters: Rule 26
   *  records re-adding phone auth as an open product decision, not a closed
   *  door. A 308 is cached by the browser indefinitely, so if /login/phone ever
   *  returns, every device that touched this redirect would keep bouncing to
   *  email until its cache was cleared by hand — the identical stale-URL bug
   *  this block exists to fix. 307 costs nothing today and forecloses nothing. */
  async redirects() {
    return [
      { source: "/login/phone", destination: "/login/email", permanent: false },
      { source: "/login/verify", destination: "/login/email", permanent: false },
    ];
  },
};

export default nextConfig;
