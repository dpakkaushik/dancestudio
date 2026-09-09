import type { TenantType } from "@/types/tenant";

/** Where a business's public page lives (Step 15): studios at /studio/{id},
 *  artist businesses at /artist/{id} — the prototype's PubStudio / PubTrainer
 *  drills (19133-19134), one component in two dresses. */
/** Where a business is read by the public. An **org** tenant has no such
 *  address (R15): it is not a business anybody browses to, only the name on an
 *  event, so asking for its path is a programming error rather than a 404 —
 *  every caller either filters by type first or is reading a real business. */
export const publicProfilePath = (tenant: { id: string; type: TenantType }): string => {
  if (tenant.type === "org") {
    throw new Error("an organization has no public page — only its studios and its events do");
  }
  return `/${tenant.type === "studio" ? "studio" : "artist"}/${tenant.id}`;
};

export const publicSchedulePath = (tenant: { id: string; type: TenantType }): string =>
  `${publicProfilePath(tenant)}/schedule`;
