import type { BusinessType } from "@/types/tenant";

/** Where a business's public page lives (Step 15): studios at /studio/{id},
 *  artist businesses at /artist/{id} — the prototype's PubStudio / PubTrainer
 *  drills (19133-19134), one component in two dresses. */
/** Where a business is read by the public.
 *
 *  ⚠ THE `org` THROW IS GONE (29 Sep 2026) — it guarded a third `BusinessType`
 *  that no longer exists, so both remaining kinds have a page and this can no
 *  longer be asked a question it cannot answer. */
export const publicProfilePath = (business: { id: string; type: BusinessType }): string =>
  `/${business.type === "studio" ? "studio" : "artist"}/${business.id}`;

export const publicSchedulePath = (business: { id: string; type: BusinessType }): string =>
  `${publicProfilePath(business)}/schedule`;
