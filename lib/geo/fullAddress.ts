import { reversePlace } from "./places";

/** A BUSINESS'S FULL ADDRESS, IN WORDS (4 Oct 2026; shared 5 Oct 2026).
 *
 *  A business stores no street address — only its area, its city and, once the
 *  owner placed it, a map PIN — so the full address is what the pin resolves to
 *  (`reversePlace`, the location picker's own geocoder, cached per instance).
 *
 *  ⚠ A pin that was never placed (`locationSetAt` null) is the city's centre, a
 *  guess, so it is not resolved. ⚠ And the geocoder gets 1.2 s — past that, or with
 *  no key, or on any error, the fallback (the area and the city) stands in rather
 *  than the page waiting on somebody else's service.
 *
 *  It was the Rooms desk's own local helper until the studio's PUBLIC page needed
 *  the same sentence (5 Oct 2026, the user: "Studio Public page- below Schedule
 *  should have full adrees"). Two copies of one address are two addresses that
 *  can disagree, so it lives here and both call it. */
export async function fullAddressOf(
  pin: { lat: number | null; lng: number | null; locationSetAt: string | null },
  fallback: string
): Promise<string> {
  try {
    if (!pin.locationSetAt || pin.lat == null || pin.lng == null) return fallback;
    const place = await Promise.race([
      reversePlace(pin.lat, pin.lng),
      new Promise<null>((r) => setTimeout(() => r(null), 1200)),
    ]);
    return place?.label?.trim() || fallback;
  } catch {
    return fallback;
  }
}
