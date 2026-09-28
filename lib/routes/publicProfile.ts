import type { TenantType } from "@/types/tenant";

/** Where a business's public page lives (Step 15): studios at /studio/{id},
 *  artist businesses at /artist/{id} — the prototype's PubStudio / PubTrainer
 *  drills (19133-19134), one component in two dresses. */
/** Where a business is read by the public.
 *
 *  ⚠ THE `org` THROW IS GONE (29 Sep 2026) — it guarded a third `TenantType`
 *  that no longer exists, so both remaining kinds have a page and this can no
 *  longer be asked a question it cannot answer. */
export const publicProfilePath = (tenant: { id: string; type: TenantType }): string =>
  `/${tenant.type === "studio" ? "studio" : "artist"}/${tenant.id}`;

export const publicSchedulePath = (tenant: { id: string; type: TenantType }): string =>
  `${publicProfilePath(tenant)}/schedule`;
