/** studio | trainer_business (an artist page) | **org** — an organization's own
 *  hosting row (R15, 9 Sep 2026). An `org` tenant is never listed, never on
 *  Discover, never in search and has no public page; it exists so an event can
 *  belong to the organization and print the organization's name as its host. */
export type TenantType = "studio" | "trainer_business" | "org";

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
  /** WHEN AN OWNER PLACED THIS BUSINESS ON THE MAP (11 Sep 2026). Null means
   *  its lat/lng is still the city centroid `create_tenant_with_owner`
   *  defaulted to — a guess, not an address — so Discover cannot honestly say
   *  how far away it is, and the hub asks for the pin. */
  locationSetAt?: string | null;
}
