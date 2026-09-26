/** WHAT A SUBSCRIPTION ACTUALLY BUYS, PER KIND (27 Sep 2026, the user: *"correct
 *  descriptions and rights you get once you subscribe for any of the following —
 *  artist, studio, organization"*).
 *
 *  ⚠⚠ **THE LIST THIS REPLACES MADE THREE CLAIMS THE APP DOES NOT KEEP**, and two
 *  of them were about money:
 *
 *  · **"0.9% payments"** — there is NO PLATFORM FEE in DanceOS, and this file has
 *    said so since 21 Sep: *"NO FEE, NO GST, NO TDS. The prototype's S_earn prints
 *    all three; none exists here."* A fee printed on the screen where somebody
 *    decides to pay ₹700 a month is the worst possible place for a number nobody
 *    charges.
 *  · **"settlements"** — money out is Step 13's honest limit: a studio pays its
 *    own people and RECORDS it. Nothing is settled by DanceOS, and Easy Split is
 *    not wired.
 *  · **"Publish classes & events"** on the ARTIST plan — an event belongs to an
 *    ORGANIZATION (R15, R48) and `save_event` refuses anything else, so ₹700 has
 *    never bought an event. The plan gates CLASSES on an artist page
 *    (`why_no_class` → `artist_plan_active`), and that is the whole of it.
 *
 *  And the two business plans had NO list at all — a studio's ₹1,200 and an
 *  organization's ₹5,000 were a price with nothing beside it.
 *
 *  ⚠ **EVERY LINE BELOW IS A RULE THE DATABASE KEEPS**, named in the comment
 *  beside it, so the next person can check it rather than trust it. What a plan
 *  does NOT gate is left out on purpose: a studio's rooms, team, students and
 *  earnings desks all work while it is unlisted, and saying otherwise would sell
 *  somebody something they already have. */
export type PlanKind = "artist" | "studio" | "org";

export const PLAN_RIGHTS: Record<PlanKind, Array<[icon: string, title: string, sub: string]>> = {
  artist: [
    /* `ensureArtistPage` + `public_artist` (R22, R24): the page is provisioned and
       a stranger can read it — without the plan there is no page to read */
    ["👤", "Your artist page", "a public profile strangers can open, with your styles, links and posters"],
    /* `why_no_class` refuses a class on an artist page whose plan has lapsed */
    ["🗓", "Teach your own classes", "run them at a studio's room, or at a place of your own"],
    /* `discover_artists` lists the people with a live plan */
    ["🔍", "On Discover", "found under Artists in your city"],
    /* R18's artist grid + R30 (an artist sells memberships from their own page) */
    ["🧰", "Artist tools", "team, students, routines, memberships, assets and earnings"],
    /* `artist_page_of` — an enquiry on a person's profile lands on their page */
    ["📩", "Take enquiries", "quotes and advances for shows, judging and private sessions, in your Inbox"],
  ],
  studio: [
    /* `guard_business_visibility` refuses `listed` without a live plan — this IS
       the subscription, and everything under it follows from the row being public */
    ["🔍", "On Discover", "the studio is listed in its city and measured by distance"],
    ["🌐", "A public page", "anybody can open it — your rooms, your team and your styles"],
    /* a class is public only through a LISTED business (Step 3's public policy) */
    ["🎟", "Bookable classes", "your published classes are open to everybody, not just your own people"],
    ["💳", "Take payments for seats", "through Cashfree, into your own account"],
  ],
  org: [
    /* `org_is_public` = GST verified AND a live mandate (`20260926120000`) */
    ["🌐", "A public page", "your organization, its team and everything it runs"],
    /* `event_host_is_public` decides whether an event is readable and bookable */
    ["🎪", "Public events", "published events are open for entries and tickets"],
    /* `public_organization_team` prints the confirmed rows of a PUBLIC org */
    ["👥", "Your team, named", "owners and event team shown on the page"],
    ["💳", "Take money for tickets and entries", "through Cashfree, into your own account"],
  ],
};

/** the one line under the list — what it costs and what stopping does */
export const PLAN_RIGHTS_NOTE = "Cancelling stops the renewal; you keep what is paid for until the period ends.";
