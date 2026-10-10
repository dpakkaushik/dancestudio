import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { findMyMemberships } from "@/repositories/businesses";
import { resolveActingAs } from "@/repositories/actingAs";

/** Refreshes the auth session cookie on every request (called from proxy.ts). */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /* Required: refreshes the session and rewrites the cookie when it rotates.
     ⚠ `getClaims`, not `getUser` (10 Oct 2026, the user: "make sure app is fast
     and smooth on every page"). Both refresh an expired token through
     `getSession`; the difference is what happens to a token that is still
     good. `getUser` asked the Auth server about it — a ~120 ms round trip in
     front of EVERY page and every client navigation, before the page had
     started. This project signs with ES256, so `getClaims` checks the
     signature here against the cached public key and makes no call at all.
     ⚠ Nothing about who may see what moved: the proxy only refreshes the
     cookie, and every page still asks the Auth server itself through
     `createSupabaseServerClient`'s `getUser()` (the user's choice, 10 Oct 2026:
     "Keep the server check"). */
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

  const forward = await retiredAddress(request, supabase, userId);
  if (forward) {
    const res = NextResponse.redirect(new URL(forward, request.url), 307);
    /* a rotated session cookie rides the redirect too, or the next page would
       start from the old one */
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  }

  return supabaseResponse;
}

/** FOUR ADDRESSES THAT DEPEND ON WHO IS ASKING (10 Oct 2026, the user: "delete
 *  all unreachable pages and files. make sure doesnt affect current running of
 *  the app in any way").
 *
 *  Each was a page file whose whole body was a redirect, and nothing in the app
 *  links them any more (checked, and no stored notification points at one) — but
 *  an address handed out is a promise (Rule 14), and these four forward to a
 *  place that depends on the signed-in person, which `next.config.ts` cannot know.
 *  So they are answered here, before any page renders, exactly as the pages did:
 *  · `/profile` → your own page (`?settings=1` carried, so the gear's old link
 *    still opens the sheet);
 *  · `/stats` → your own record, every query parameter carried;
 *  · `/assets` → the assets desk of your artist page, else of any business you
 *    own, else the hub;
 *  · `/enquiries` → the Inbox's Enquiries, of the studio or crew `?as=` names when
 *    you run it (a pointer is never an authority — `resolveActingAs` decides).
 *  Signed out, the first three go to sign in, as they did; `/enquiries` never
 *  asked and lands on the Inbox, which sends a stranger to sign in itself.
 *  Every other path pays one string comparison. */
async function retiredAddress(
  request: NextRequest,
  supabase: ReturnType<typeof createServerClient>,
  userId: string | null
): Promise<string | null> {
  const { pathname, searchParams } = request.nextUrl;
  switch (pathname) {
    case "/profile":
      if (!userId) return "/login";
      return `/person/${userId}${searchParams.get("settings") === "1" ? "?settings=1" : ""}`;
    case "/stats": {
      if (!userId) return "/login";
      const q = new URLSearchParams();
      searchParams.forEach((v, k) => {
        if (!q.has(k)) q.set(k, v);
      });
      return `/person/${userId}/stats${q.size > 0 ? `?${q.toString()}` : ""}`;
    }
    case "/assets": {
      if (!userId) return "/login";
      const teams = await findMyMemberships(supabase).catch(() => []);
      /* an artist's own page first — this address was an artist's tile — then
         any other business they own, so it is never a dead end */
      const owned = teams.filter((m) => m.memberRole === "owner");
      const page = owned.find((m) => m.business.type === "artist_page") ?? owned[0] ?? null;
      return page ? `/business/${page.business.id}/assets` : "/business";
    }
    case "/enquiries": {
      const actingAs = userId ? await resolveActingAs(supabase, searchParams.get("as")) : null;
      if (actingAs?.kind === "crew") return `/crews/${actingAs.id}/inbox?show=enquiries`;
      if (actingAs) return `/business/${actingAs.id}/inbox?show=enquiries`;
      return "/inbox?show=enquiries";
    }
    default:
      return null;
  }
}
