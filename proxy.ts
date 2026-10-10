import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/** WHAT THE SESSION REFRESH IS ALLOWED TO COST (11 Sep 2026).
 *
 *  `updateSession` used to call `supabase.auth.getUser()`, and for a signed-in caller
 *  that is a NETWORK ROUND TRIP to the Supabase Auth server (since 10 Oct 2026 it
 *  calls `getClaims()`, which verifies the token locally — see that file). It has to happen —
 *  it is what revalidates the token and rewrites the cookie when it rotates —
 *  but it should happen on requests that are about a person, and the matcher
 *  used to fire it on very nearly everything.
 *
 *  Two kinds of request are taken out of its way:
 *
 *  * STATIC FILES. Icons, the manifest, images — anything served straight off
 *    disk. `_next/static` and `_next/image` were already excluded; everything
 *    in `public/` was not, so each icon fetch bought its own auth round trip.
 *
 *  * THE WEBHOOK ROUTE. `/api/webhooks/*` reads no session and can't: it
 *    verifies Cashfree's HMAC over the raw body itself and then uses the
 *    service-role client. Putting the auth server in front of it added latency
 *    to every delivery and, worse, made a slow or unreachable auth server look
 *    to Cashfree like a failed delivery — retries, on the one path where money
 *    is being recorded.
 *
 *  Nothing about WHO may see WHAT changes here: every page and server action
 *  still resolves the user server-side through `createSupabaseServerClient`,
 *  and a page that needs a session still redirects without one. This only stops
 *  the app asking the auth server about a PNG. No route is removed or moved, so
 *  Rule 14 does not apply. */
export const config = {
  matcher: [
    /* `sw.js` (3 Oct 2026): the push service worker is a static file, and a
       browser re-fetches it on its own schedule — no session to refresh */
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|json|webmanifest)$).*)",
  ],
};
