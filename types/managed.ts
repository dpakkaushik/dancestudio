import type { DanceClass } from "@/types/class";
import type { DanceEvent } from "@/types/event";
import type { Tenant } from "@/types/tenant";

/** Parity slice — S_managed, "everything you manage" (prototype 6332-6378).
 *  Nothing new is stored: a managed listing is a class or an event of a
 *  business the person belongs to, seen from the side that RUNS it. The two
 *  kinds keep their own shapes (the class tile and the event card each already
 *  know how to draw theirs); what they share is the business, a start to sort
 *  on, and the page that manages them. */
export type ManagedKind = "class" | "event";

interface ManagedBase {
  /** "class:<id>" / "event:<id>" — unique across both kinds in one list */
  key: string;
  tenant: Tenant;
  /** ISO start of the first session (class) or the first day (event); null for
   *  a legacy class without one — those sort last */
  startsAt: string | null;
  /** where pressing the row goes: the roster desk or the event manager */
  manageHref: string;
}

export interface ManagedClass extends ManagedBase {
  kind: "class";
  danceClass: DanceClass;
  /** seats taken on the first session */
  filled: number;
}

export interface ManagedEvent extends ManagedBase {
  kind: "event";
  event: DanceEvent;
}

export type ManagedListing = ManagedClass | ManagedEvent;

/** the segmented control's three positions, and the URL word for each */
export const MANAGED_FILTERS: Array<{ k: "all" | ManagedKind; label: string; aria: string }> = [
  { k: "all", label: "All", aria: "Show everything you manage" },
  { k: "class", label: "Classes", aria: "Show classes only" },
  { k: "event", label: "Events", aria: "Show events only" },
];

export const parseManagedFilter = (raw: string | string[] | undefined): "all" | ManagedKind => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "class" || v === "event" ? v : "all";
};
