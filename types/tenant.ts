export type TenantType = "studio" | "trainer_business";

import type { SocialLink } from "@/types/profile";

/** the four "accepted from students" switches (prototype S_payments 16612) */
export interface AcceptedMethods {
  upi: boolean;
  cards: boolean;
  cash: boolean;
  bank: boolean;
}

export interface Tenant {
  /** a path in the public media bucket, or null for the business's gradient */
  photoPath?: string | null;
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  /** the business's own words (About, 10834) — null prints nothing */
  about: string | null;
  /** "Since 2016" (10691) */
  foundedYear: number | null;
  /** the Call button's number (10879) */
  phone: string | null;
  /** the social chips (10760) */
  socials: SocialLink[];
  /** the enquiry types it accepts — null means every type its kind allows */
  enquiryTypes: string[] | null;
  accepts: AcceptedMethods;
  /** set by DanceOS after KYC — the tick */
  verifiedAt: string | null;
}
