export type TenantType = "studio" | "trainer_business";

export interface Tenant {
  id: string;
  type: TenantType;
  name: string;
  area: string | null;
  city: string | null;
}
