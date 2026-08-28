import type { TenantType } from "@/types/tenant";

/** Where a business's public page lives (Step 15): studios at /studio/{id},
 *  artist businesses at /artist/{id} — the prototype's PubStudio / PubTrainer
 *  drills (19133-19134), one component in two dresses. */
export const publicProfilePath = (tenant: { id: string; type: TenantType }): string =>
  `/${tenant.type === "studio" ? "studio" : "artist"}/${tenant.id}`;

export const publicSchedulePath = (tenant: { id: string; type: TenantType }): string =>
  `${publicProfilePath(tenant)}/schedule`;
