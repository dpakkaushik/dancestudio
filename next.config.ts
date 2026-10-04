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

  /** Gravestones — for the phone channel deleted in 88ef3bb (Rule 26), and for
   *  organizations and events (29 Sep 2026; the block below the auth pair).
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

      /* ══ ORGANIZATIONS AND EVENTS (29 Sep 2026, the user: "remove Organization
         and Events completely from the system") ══
         Twelve addresses stop existing in one push, and every one of them is a
         link somebody may be standing on — a bookmark, a shared event link, the
         installed TWA's last URL. Rule 14: none of them becomes a bare 404.

         WHERE EACH ONE LANDS is the nearest TRUE thing rather than the nearest
         similar thing. An event's public page and the events tab were things a
         stranger came to BROWSE, so they land on Discover, which is what is left
         to browse. An organization's own screens were things its owner came to
         RUN, so they land on the studios hub, which is what they still run. A
         person's own events desk and a business's belong to nobody but their
         owner, so those land on Home and on that business's own home.

         ⚠ ALL 307, NOT 308, and here the reason is sharper than it was for the
         phone channel: a 308 is cached by the browser indefinitely, so the day
         anything reclaims one of these paths every device that ever touched the
         redirect would keep bouncing until its cache was cleared by hand. 307
         costs nothing and forecloses nothing. */
      { source: "/organizations", destination: "/", permanent: false },
      { source: "/org/:orgId", destination: "/discover", permanent: false },
      { source: "/org/:orgId/stats", destination: "/discover", permanent: false },
      /* the four the retired organization LOGIN left behind (26 Sep 2026) —
         they pointed at `/organizations`, which is gone too, so they go one hop
         further rather than into a redirect that redirects */
      { source: "/gst", destination: "/", permanent: false },
      { source: "/business/team", destination: "/business", permanent: false },
      { source: "/business/earnings", destination: "/business", permanent: false },
      { source: "/business/stats", destination: "/business", permanent: false },
      /* an EVENT's own public page, and the tab that listed them */
      { source: "/e/:slug", destination: "/discover", permanent: false },
      { source: "/my-events", destination: "/", permanent: false },
      /* a business's events desk, its manager and both forms — the business's
         own home is what its owner still has */
      { source: "/business/:businessId/events", destination: "/business/:businessId", permanent: false },
      { source: "/business/:businessId/events/:rest*", destination: "/business/:businessId", permanent: false },
      { source: "/business/:businessId/gst", destination: "/business/:businessId", permanent: false },
      /* an ORGANIZATION's Team desk lived here; a studio's is `/staff`, which is
         where somebody typing this address almost certainly meant to go */
      { source: "/business/:businessId/team", destination: "/business/:businessId/staff", permanent: false },
      /* the crew's battle record */
      { source: "/crews/:crewId/manage/events", destination: "/crews/:crewId/manage", permanent: false },

      /* ══ PAGES NOTHING IN THE APP OPENED ANY MORE (5 Oct 2026, the user:
         "remove all pages which arent affecting the app in anyway and are
         unreachable … do it safely. one by one") ══
         Each was reachable only by typing its address, so deleting it changes
         nothing a person can tap — and each address still lands on the screen
         that does its job now, so a saved link or the installed TWA's last URL
         is never a bare 404 (Rule 14). One commit per page, so any one of them
         can be put back with a single `git revert`. `scripts/stranger-smoke.ps1`
         asserts every forward in this list, so one cannot quietly disappear.

         The old ROSTER: a read-only list of the booked names. The Roster pill
         that opened it went on 4 Oct 2026; the class page's Attendance tab is
         the register now (check-in, the scanner, walk-ins), and every card on
         the Classes desk opens that page. */
      { source: "/business/:businessId/classes/:classId/roster", destination: "/business/:businessId/classes", permanent: false },
      /* The MEDIA desk: a studio's two pictures as a separate page. Its tile left
         every grid on 21 Sep 2026; the pencil on the studio's own home shows the
         disc's ⊕ and the posters' ⊕, which are the same editors. */
      { source: "/business/:businessId/media", destination: "/business/:businessId", permanent: false },
      /* The four ADD forms as pages of their own. Since 22 Sep 2026 every Add
         button opens the SAME form as a sheet over its desk (`?new=1`), so the
         pages were a second shell around one component. ⚠ Each forwards to the
         DESK, deliberately not to `?new=1`: a sheet closes and saves by stepping
         BACK to the desk under it, and somebody arriving cold from an old link
         has no desk under them — so they land one press from the form instead.
         An artist page's desk forwards on to `/my-classes?show=manage` itself. */
      { source: "/business/:businessId/classes/new", destination: "/business/:businessId/classes", permanent: false },
      { source: "/crews/new", destination: "/crews", permanent: false },
      { source: "/routines/new", destination: "/routines", permanent: false },
    ];
  },
};

export default nextConfig;
