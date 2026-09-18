import type { AcceptedMethods, TenantType } from "@/types/tenant";

/** A business as a stranger sees it (prototype S_profiletab with
 *  `publicEntity="studio"|"trainer"`, PUB presets 8641-8646). Everything here is
 *  readable under existing public policies: the listed tenant, the styles of its
 *  published classes, and — since 19 Sep 2026 — its TEAM through one definer read. */
export interface PublicTenant {
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  /** WHERE IT IS (11 Sep 2026). Until an owner opens the location picker these
   *  are the CITY CENTROID `create_business_with_owner` defaulted to, which is
   *  why every studio in a city used to sit on the same point and Discover's
   *  distances were all the same number. */
  lat: number | null;
  lng: number | null;
  /** when the business joined DanceOS — the honest stand-in for the prototype's
   *  founding year, which no field holds yet */
  createdAt: string;
  /** a path in the public media bucket, or null for the business's gradient */
  photoPath: string | null;
  about: string | null;
  foundedYear: number | null;
  phone: string | null;
  /** the Mail button's address (19 Sep 2026) */
  contactEmail: string | null;
  socials: Array<{ platform: string; url: string }>;
  enquiryTypes: string[] | null;
  /** what the business takes from students (S_payments 16612) — printed on the page, edited on the desk */
  accepts: AcceptedMethods;
  verifiedAt: string | null;
}

/** THE TEAM A STUDIO'S PAGE PRINTS (19 Sep 2026, the user: "Studios — Owner,
 *  Faculty, Visiting Faculty"): one row per person on the team in one of those
 *  three seats, through `public_studio_team` — a listed studio's to anybody,
 *  an unlisted one's to its own team. Staff are the desk's business, not the
 *  page's. `isOrg` says the owner is an organization, so the row opens
 *  /org/{id} rather than a person's page. */
export interface PublicTeamMember {
  userId: string;
  role: "owner" | "trainer" | "visiting_faculty";
  name: string;
  photoPath: string | null;
  isOrg: boolean;
}

export interface PublicTenantProfile {
  tenant: PublicTenant;
  /** distinct styles of the business's published classes, most-taught first */
  styles: string[];
  team: PublicTeamMember[];
  followers: number;
}
