/** Who an account IS. The prototype's dancer | trainer | studio went at the
 *  user's instruction on 8 Sep 2026 — "Pro" is the artist plan, a ROW, never a
 *  role again.
 *
 *  ⚠⚠ AND THERE IS ONLY ONE VALUE NOW (29 Sep 2026, the user: *"Remove
 *  Organization and Events completely from the system"*). `org` was the second,
 *  and it had already stopped meaning anything twice over: R48 retired the
 *  organization LOGIN on 26 Sep, so no live profile has carried the word since;
 *  the organization itself was a `businesses` row after that, and now that is
 *  gone too.
 *
 *  ⚠ THE COLUMN'S CHECK STILL ADMITS `'org'` and 52 soft-deleted rows still
 *  carry it — narrowing the TYPE is what makes every reader of the word a
 *  compile error, which is how this removal found them. Two reads still send
 *  `.neq("role", "org")` to PostgREST as a plain string, deliberately: those
 *  filter the dead rows out of search, and they are about the DATABASE's
 *  vocabulary rather than this app's. */
export type ProfileRole = "user";

/** What a screen PRINTS beside a name: a live plan is what makes a person an
 *  artist, and that is now the whole of the question. */
export type PersonKind = "user" | "artist";

export const kindOf = (isArtist: boolean): PersonKind => (isArtist ? "artist" : "user");

/** ⚠⚠ A BUSINESS DOES NOT BOOK — AND THE OLD TEST FOR IT DIED ON 26 Sep 2026.
 *
 *  The rule is the user's, twice: *"studio and organizations … should not be
 *  able to book any class or event"* (19 Sep) and *"crew can only take part in
 *  events and should not be able to book classes"* (27 Sep).
 *
 *  ⚠⚠ WHAT BROKE, AND IT BROKE IN SILENCE. Until today this was
 *  `role !== "org"` — a test on `profiles.role`, which was the right test while
 *  an organization was a LOGIN. **R48 retired that role**: every account is
 *  `user` now, so the predicate answered "yes, you may book" for everybody from
 *  the moment that migration applied, and nothing failed, because the check it
 *  replaced is a sentence rather than an exception. ⚠ The same word is dead one
 *  layer down — `guard_person_only`'s `if v_role = 'org'` branch, the DATABASE's
 *  own enforcement, refuses nobody for the same reason (its SUSPENDED branch is
 *  untouched and still live). **A value retired from one column leaves every
 *  reader of that value quietly answering the wrong question.**
 *
 *  ⚠ SO THE TEST IS NOT RESTORED, IT IS REPLACED. There is no organization
 *  account left to refuse; what there is instead is the profile you are ACTING
 *  AS — your own, or a studio, an organization or a crew you switched into.
 *  That is the profile switcher's question, and the entity bar's Discover link
 *  carries the answer (`?as=`), because `/discover` belongs to no profile by
 *  itself. A pointer is never an authority: the page it lands on looks the
 *  business up among the ones this account actually belongs to before it
 *  believes a word of it.
 *
 *  ⚠ `org` LEFT THIS UNION ON 29 Sep 2026 with organizations themselves. A CREW
 *  stays in it — it is still a profile you switch into — even though what it
 *  used to be able to do here (enter an event) is gone: it still cannot take a
 *  class seat, and that refusal is the one this type now carries. */
export type ActingAs = { kind: "studio" | "crew"; name: string; id: string } | null;

/** May the profile you are acting as take a CLASS SEAT? Only you can.
 *
 *  ⚠ `canBookEvent` was its twin until 29 Sep 2026 and went with events. It
 *  admitted a CREW, because entering an event as a crew is what a crew is for;
 *  with events gone a crew books nothing, which is why the two predicates have
 *  collapsed back into this one. */
export const canBookClass = (as: ActingAs): boolean => as === null;

/** What a card says in place of the button, in the rule's own words. One
 *  sentence per kind, naming the profile you are in, because "you cannot book"
 *  with no reason on a screen you reached by pressing Discover is the kind of
 *  refusal somebody reads as a broken button. */
export const noBookingWords = (as: NonNullable<ActingAs>): string =>
  as.kind === "crew"
    ? `${as.name} is a crew — it dances together, it does not take classes. Switch to your own profile to book one.`
    : `${as.name} teaches classes — it does not book them. Switch to your own profile to take a place.`;

/** One link where else to find a person (S_profiletab 10760): a known
 *  platform's name, or a short custom label, and the URL. Order is the
 *  person's own — the rail prints them as arranged. */
export interface SocialLink {
  platform: string;
  url: string;
}

export interface Profile {
  /** a path in the public media bucket, or null for initials on the kind's metal */
  avatarPath?: string | null;
  id: string;
  fullName: string;
  role: ProfileRole;
  city: string | null;
  /** the age, printed as the number alone ("24, New Delhi") — worked out from
   *  `dob` by the database on the day (19 Sep 2026), a bare number only for a
   *  profile that never gave a date */
  age: number | null;
  /** the date of birth, ISO — what the Edit sheet asks for since 19 Sep 2026
   *  (the user: "age should always be DOB instead when selecting anywhere") */
  dob: string | null;
  socials: SocialLink[];
  /** the styles they dance, in their order (dosMyStyles 1719) */
  styles: string[];
  /** the account number beside the role — "000482" (10641) */
  memberNo: number | null;
  /** set by DanceOS — the tick (10678). On an organization it is the admin's
   *  verification, and everything the organization runs is public only once it is set */
  verifiedAt: string | null;
  /** the Call button's number (10879) — an organization's, since 19 Sep 2026 (Call
   *  is a studio's and an organization's button, by the user's list) */
  phone: string | null;
  /** the address the Mail button opens (19 Sep 2026) — an organization's or an
   *  artist's own; a plain user's is never shown */
  contactEmail: string | null;
  /** CALL IS A TOGGLE (19 Sep 2026, push 2): whether an ARTIST's page dials the
   *  number. Off by default; an organization's Call is always drawn */
  phonePublic: boolean;
  /** AN ORGANIZATION'S PIN (19 Sep 2026, push 2) — set from Edit profile through
   *  `set_my_place`; a person's row never carries one */
  lat: number | null;
  lng: number | null;
  locationSetAt: string | null;
}

/** the word over the name (10639) — by KIND, because the badge on an artist is
 *  the plan's to give and the badge on an organization is what it is */
/** ⚠ DELETED 20 Sep 2026 — `KIND_BADGE` was `{ USER, ARTIST, ORGANIZATION }`,
 *  and `HERO_EYEBROW` uppercases in CSS, so a screen reading it and a screen
 *  reading `KIND_WORD` LOOKED identical while a screen reader said two different
 *  things. Home and the Profile tab were unified onto `KIND_WORD` on 19 Sep;
 *  `PublicPersonPage` was the one that was missed, and it is on this map now.
 *  The capitals belong to the style sheet, never to the text. */
/** what an account IS, in a sentence — the word every hero's eyebrow prints */
export const KIND_WORD: Record<PersonKind, string> = { user: "User", artist: "Artist" };

/** the account number as the prototype prints it: six digits, zero-padded */
export const memberNoWords = (n: number | null | undefined): string => (n == null ? "" : String(n).padStart(6, "0"));

/** THE LINE UNDER THE NAME — "20 Yrs · Gurugram" (19 Sep 2026, the user: "age
 *  with Yrs and City Name without comma in between", and when asked which
 *  separator: "give seprator").
 *
 *  It read "20, Gurugram" from the prototype's own introduction line (10664)
 *  until today. ⚠ It lives HERE rather than in either screen because Home and
 *  the Profile tab both print it and had each built it their own way — Home by
 *  joining with a comma, the Profile tab by handing a `prefix` to `PlaceLink` —
 *  which is exactly how the two screens came to disagree. One function, one
 *  sentence, both callers. */
export const heroMetaWords = (age: number | null | undefined, city: string | null | undefined): string =>
  [age != null ? `${age} Yrs` : "", (city ?? "").trim()].filter(Boolean).join(" · ");
