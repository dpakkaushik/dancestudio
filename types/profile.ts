/** Mirrors the prototype's __DOSROLE: dancer | trainer | studio. */
export type ProfileRole = "dancer" | "trainer" | "studio";

/** One link where else to find a person (S_profiletab 10760): a known
 *  platform's name, or a short custom label, and the URL. Order is the
 *  person's own — the rail prints them as arranged. */
export interface SocialLink {
  platform: string;
  url: string;
}

export interface Profile {
  /** a path in the public media bucket, or null for initials on the role's metal */
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
  /** set by DanceOS after KYC — the tick (10678) */
  verifiedAt: string | null;
  /** the Call button's number (10879) — an artist's own */
  phone: string | null;
}

/** the prototype's own words for what somebody is (10639) */
export const ROLE_BADGE: Record<ProfileRole, string> = { dancer: "DANCER", trainer: "ARTIST", studio: "STUDIO OWNER" };

/** the account number as the prototype prints it: six digits, zero-padded */
export const memberNoWords = (n: number | null | undefined): string => (n == null ? "" : String(n).padStart(6, "0"));
