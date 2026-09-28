/** studio | artist_page (an artist page) — the two kinds of business left.
 *
 *  ⚠⚠ `org` WAS THE THIRD AND IS GONE (29 Sep 2026, the user: *"Remove
 *  Organization and Events completely from the system"*). It had been an
 *  organization's hosting row (R15), then the organization itself (R48) — owned
 *  through a seat like a studio, run from the switcher, with its events, its
 *  team, its GST number and a ₹5,000 mandate. Every one of those went with it,
 *  and events went with it too: on production all ten live events were hosted by
 *  an organization, because only an organization could ever host one.
 *
 *  ⚠ THE COLUMN'S CHECK STILL ADMITS `'org'` and 20 live rows still carry it
 *  until the held sweep runs. Narrowing the type here is what turned every
 *  reader of the word into a compile error, which is how they were found. */
export type TenantType = "studio" | "artist_page";

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
  /** "Since 2016" (10691) */
  foundedYear: number | null;
  /** the Call button's number (10879) */
  phone: string | null;
  /** the Mail button's address (19 Sep 2026) — the owner's to publish */
  contactEmail: string | null;
  /** the social chips (10760) */
  socials: SocialLink[];
  /** the business's own account number, printed beside its type (20 Sep 2026) */
  memberNo?: number | null;
  /** THE STYLES IT SAYS IT DANCES (19 Sep 2026, the user: "some studios dont
   *  show dance styles on profile it is mandatory to have one at least"). Its
   *  own field now — they used to be derived from its PUBLISHED classes, so a
   *  studio with none yet showed none. A studio may not be saved without one. */
  styles: string[];
  /** the enquiry types it accepts — null means every type its kind allows */
  enquiryTypes: string[] | null;
  accepts: AcceptedMethods;
  /** set by DanceOS after KYC — the tick */
  verifiedAt: string | null;
  /** WHEN AN OWNER PLACED THIS BUSINESS ON THE MAP (11 Sep 2026). Null means
   *  its lat/lng is still the city centroid `create_business_with_owner`
   *  defaulted to — a guess, not an address — so Discover cannot honestly say
   *  how far away it is, and the hub asks for the pin. */
  locationSetAt?: string | null;
}
