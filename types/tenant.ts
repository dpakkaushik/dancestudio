export type TenantType = "studio" | "trainer_business";

export interface Tenant {
  /** a path in the public media bucket, or null for the business's gradient */
  photoPath?: string | null;
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
}
