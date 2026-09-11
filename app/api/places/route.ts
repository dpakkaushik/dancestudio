import { NextResponse } from "next/server";
import { z } from "zod";
import { isPlacesConfigured, isPlausibleIndianPoint, resolvePlace, reversePlace, suggestPlaces } from "@/lib/geo/places";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** THE ONLY DOOR THE BROWSER HAS ONTO GOOGLE'S SEARCH (11 Sep 2026).
 *
 *  The map is drawn in the browser with the PUBLIC Maps key — it has to be,
 *  that is what a map is. Search is not: autocomplete, place details and
 *  geocoding all spend quota, and the key that spends it stays on this side.
 *
 *  SIGNED IN ONLY. An open autocomplete endpoint is somebody else's quota being
 *  spent by strangers in this app's name — and on a demo key, whose daily
 *  allowance simply stops when it runs out, that is the difference between a
 *  working picker and a dead one.
 *
 *  Three shapes, one route:
 *    ?q=              — suggestions for what is being typed
 *    ?q=&cities=1     — the same, but only places that are cities
 *    ?place=          — the point and address for a chosen suggestion
 *    ?lat=&lng=       — the address under a dragged pin
 *
 *  NOTHING HERE IS AN ERROR THE USER SHOULD MEET. Google being slow, out of
 *  quota or unconfigured must not stop somebody choosing a point on a map: it
 *  only means the address is not filled in for them. So every failure answers
 *  200 with an empty result and the picker carries on. */

const searchQuery = z.object({
  q: z.string().trim().min(2).max(160),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  cities: z.string().optional(),
});

const placeQuery = z.object({ place: z.string().trim().min(1).max(400) });
const reverseQuery = z.object({ lat: z.coerce.number(), lng: z.coerce.number() });

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "sign in first" }, { status: 401 });
  }

  const params = Object.fromEntries(new URL(request.url).searchParams);

  /* a screen asks this to know whether to draw a search box at all */
  if (params.configured !== undefined) {
    return NextResponse.json({ configured: isPlacesConfigured() });
  }

  if (typeof params.place === "string" && params.place !== "") {
    const parsed = placeQuery.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ place: null });
    }
    return NextResponse.json({ place: await resolvePlace(parsed.data.place) });
  }

  if (typeof params.q === "string" && params.q.trim() !== "") {
    const parsed = searchQuery.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json({ places: [] });
    }
    const near =
      parsed.data.lat !== undefined && parsed.data.lng !== undefined && isPlausibleIndianPoint(parsed.data.lat, parsed.data.lng)
        ? { lat: parsed.data.lat, lng: parsed.data.lng }
        : null;
    return NextResponse.json({ places: await suggestPlaces(parsed.data.q, near, params.cities === "1") });
  }

  const parsed = reverseQuery.safeParse(params);
  if (!parsed.success || !isPlausibleIndianPoint(parsed.data.lat, parsed.data.lng)) {
    return NextResponse.json({ place: null });
  }
  return NextResponse.json({ place: await reversePlace(parsed.data.lat, parsed.data.lng) });
}
