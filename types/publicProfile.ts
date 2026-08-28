import type { TenantType } from "@/types/tenant";

/** A business as a stranger sees it (prototype S_profiletab with
 *  `publicEntity="studio"|"trainer"`, PUB presets 8641-8646). Everything here is
 *  readable under existing public policies: the listed tenant, the styles of its
 *  published classes, and the people confirmed on those classes. */
export interface PublicTenant {
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
  /** when the business joined DanceOS — the honest stand-in for the prototype's
   *  founding year, which no field holds yet */
  createdAt: string;
  /** a path in the public media bucket, or null for the business's gradient */
  photoPath: string | null;
}

/** Somebody confirmed on one of the business's published classes — the
 *  prototype's Faculty group (dosProfileGroups, 11037). */
export interface PublicFacultyMember {
  userId: string;
  name: string;
  city: string | null;
  /** "Artist" when they take a class, "Assistant" when they only assist */
  role: "Artist" | "Assistant";
  classCount: number;
}

export interface PublicTenantProfile {
  tenant: PublicTenant;
  /** distinct styles of the business's published classes, most-taught first */
  styles: string[];
  faculty: PublicFacultyMember[];
  followers: number;
  /** published sessions still to come */
  upcomingSessions: number;
}
