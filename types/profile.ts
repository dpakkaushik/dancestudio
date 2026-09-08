/** Who an account IS (8 Sep 2026): a person, or an organization that runs
 *  studios. The prototype's dancer | trainer | studio is gone at the user's
 *  instruction — "Pro" is the artist plan, a ROW on `artist_plans`, never a role
 *  again. Chosen once at onboarding; only DanceOS may change it afterwards. */
export type ProfileRole = "user" | "org";

/** What a screen PRINTS beside a name. The role says person-or-organization;
 *  a live plan is what makes a person an artist, so the word needs both. */
export type PersonKind = "user" | "artist" | "org";

export const kindOf = (role: ProfileRole, isArtist: boolean): PersonKind =>
  role === "org" ? "org" : isArtist ? "artist" : "user";

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
  /** the age they state; printed as the number alone ("24, New Delhi") */
  age: number | null;
  socials: SocialLink[];
  /** the styles they dance, in their order (dosMyStyles 1719) */
  styles: string[];
  /** the account number beside the role — "000482" (10641) */
  memberNo: number | null;
  /** set by DanceOS — the tick (10678). On an organization it is the admin's
   *  verification, and everything the organization runs is public only once it is set */
  verifiedAt: string | null;
  /** the Call button's number (10879) — an artist's own */
  phone: string | null;
}

/** the word over the name (10639) — by KIND, because the badge on an artist is
 *  the plan's to give and the badge on an organization is what it is */
export const KIND_BADGE: Record<PersonKind, string> = { user: "USER", artist: "ARTIST", org: "ORGANIZATION" };
/** the same three, in a sentence */
export const KIND_WORD: Record<PersonKind, string> = { user: "User", artist: "Artist", org: "Organization" };

/** the account number as the prototype prints it: six digits, zero-padded */
export const memberNoWords = (n: number | null | undefined): string => (n == null ? "" : String(n).padStart(6, "0"));
