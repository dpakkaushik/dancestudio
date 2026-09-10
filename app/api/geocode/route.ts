import { NextResponse } from "next/server";
import { z } from "zod";
import { isPlausibleIndianPoint, reverseGeocode, searchPlaces } from "@/lib/geo/geocode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** THE ONLY DOOR THE BROWSER HAS ONTO A GEOCODER (11 Sep 2026).
 *
 *  The picker never calls OpenStreetMap itself, for three reasons that are all
 *  about not being a bad citizen of a free service:
 *
 *   1. Nominatim requires a User-Agent naming the application. A browser sends
 *      its own and there is no way to change it, so a browser calling it
 *      directly is a request it is entitled to refuse.
 *   2. One request per second is the policy. A throttle in a browser tab is a
 *      throttle for that tab; here it is one queue for the instance, and the
 *      answers are cached so the same question is not asked twice.
 *   3. SIGNED IN ONLY. An unauthenticated geocoding endpoint is an open proxy —
 *      somebody else's rate limit, spent by strangers, in this app's name.
 *
 *  Two shapes, one route: `?q=` searches, `?lat=&lng=` reverses. Both answer
 *  the same `GeoPlace` vocabulary, so the picker has one thing to read.
 *
 *  A failure here is not an error the user should meet. The geocoder being slow
 *  or down does not stop anybody choosing a point on the map — it only means the
 *  address is not filled in for them — so an upstream failure answers 200 with
 *  an empty list and lets the picker carry on. */

const searchQuery = z.object({
  q: z.string().trim().min(3).max(120),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
});

const reverseQuery = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);

  if (typeof params.q === "string" && params.q.trim() !== "") {
    const parsed = searchQuery.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ places: [] });
    }
    const near =
      parsed.data.lat !== undefined && parsed.data.lng !== undefined && isPlausibleIndianPoint(parsed.data.lat, parsed.data.lng)
        ? { lat: parsed.data.lat, lng: parsed.data.lng }
        : null;
    try {
      return NextResponse.json({ places: await searchPlaces(parsed.data.q, near) });
    } catch {
      /* the map still works; only the typed search does not */
      return NextResponse.json({ places: [] });
    }
  }

  const parsed = reverseQuery.safeParse(params);
  if (!parsed.success || !isPlausibleIndianPoint(parsed.data.lat, parsed.data.lng)) {
    return NextResponse.json({ place: null });
  }
  try {
    return NextResponse.json({ place: await reverseGeocode(parsed.data.lat, parsed.data.lng) });
  } catch {
    return NextResponse.json({ place: null });
  }
}
