/** Who an account IS (8 Sep 2026): a person, or an organization that runs
 *  studios. The prototype's dancer | trainer | studio is gone at the user's
 *  instruction — "Pro" is the artist plan, a ROW on `artist_plans_legacy`, never a role
 *  again. Chosen once at onboarding; only DanceOS may change it afterwards. */
export type ProfileRole = "user" | "org";

/** What a screen PRINTS beside a name. The role says person-or-organization;
 *  a live plan is what makes a person an artist, so the word needs both. */
export type PersonKind = "user" | "artist" | "org";

export const kindOf = (role: ProfileRole, isArtist: boolean): PersonKind =>
  role === "org" ? "org" : isArtist ? "artist" : "user";

/** ⚠ AN ORGANIZATION DOES NOT BOOK (19 Sep 2026, the user: "studio and
 *  organizations can have Discover in navbar but should not be able to book any
 *  class or event — make sure it is applied in all logics").
 *
 *  This has been the DATABASE's rule since 8 Sep 2026 — `guard_person_only`
 *  refuses an organization account a class seat, an assistant seat, an event
 *  booking, a crew, an enquiry and an order across eight tables (R11) — and the
 *  screens went on offering the button anyway, so the only way to learn it was
 *  to press Book and be refused. This is that rule, said where the button is
 *  drawn. A STUDIO is not an account: browsing as an organization is how a
 *  studio's people reach Discover, so one test covers both.
 *
 *  It is a PRESENTATION gate over a real one. Nothing here is the enforcement;
 *  the RPCs are, and they refuse a forged press exactly as they always did. */
export const canBook = (role: ProfileRole | null | undefined): boolean => role !== "org";

/** What a page says in place of the button, in the rule's own words. */
export const NO_BOOKING_FOR_AN_ORGANIZATION = "An organization runs classes and events — it does not book them. Sign in as yourself to take a place.";

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
  /** the person's own sentence, ≤ 220 chars; null prints nothing */
  about: string | null;
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
export const KIND_BADGE: Record<PersonKind, string> = { user: "USER", artist: "ARTIST", org: "ORGANIZATION" };
/** the same three, in a sentence */
export const KIND_WORD: Record<PersonKind, string> = { user: "User", artist: "Artist", org: "Organization" };

/** the account number as the prototype prints it: six digits, zero-padded */
export const memberNoWords = (n: number | null | undefined): string => (n == null ? "" : String(n).padStart(6, "0"));
