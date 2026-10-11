import { createHmac, timingSafeEqual } from "node:crypto";

/** THE CALENDAR FEED'S KEY (12 Oct 2026, the user: "add to calendar not on
 *  individual class cards but the entire calendar sync from the calendar page").
 *
 *  A calendar app fetches a subscribed feed on its own schedule, with no cookie
 *  and no session — so the URL itself has to say whose calendar it is AND prove
 *  it was handed out by DanceOS. The proof is an HMAC of the person's id under a
 *  server-only secret (`CALENDAR_FEED_SECRET`, else one derived from the service
 *  key), so nobody can mint the URL of somebody else's calendar from their id.
 *  ⚠ No migration and no table: the token is a function of the id, so rotating
 *  the secret is what revokes every feed at once. */

const secret = () => {
  const own = process.env.CALENDAR_FEED_SECRET;
  if (own) return own;
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("no secret for the calendar feed");
  return createHmac("sha256", base).update("danceos-calendar-feed-v1").digest("hex");
};

export function calendarFeedToken(userId: string): string {
  return createHmac("sha256", secret()).update(`feed:${userId}`).digest("base64url").slice(0, 32);
}

export function calendarFeedTokenOk(userId: string, token: string): boolean {
  const want = Buffer.from(calendarFeedToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** the path the feed is served at — the page builds the absolute URL from it */
export const calendarFeedPath = (userId: string) => `/api/calendar/${userId}/${calendarFeedToken(userId)}`;
