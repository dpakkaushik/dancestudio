"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { SocialLink } from "@/types/profile";

/** THE TWO LISTS A HOME EDITS, HELD ONCE PER HOME (26 Sep 2026).
 *
 *  ⚠ WHY THIS EXISTS — A STYLE WAS ADDED AND THEN LOST, AND THE E2E IS WHAT
 *  FOUND IT. Three editors on one home write the same record: the styles row,
 *  the links row and the contact ⊕. Two of the three doors take the WHOLE
 *  profile (`update_my_profile`, `update_business_profile`: an omitted list
 *  empties a column), so each save has to send the lists it is NOT editing —
 *  and each editor was sending them off its own PROPS. The row's save called
 *  `router.refresh()`, but a refresh is a round trip: press the styles ＋, add
 *  Kathak, press the links ＋ within the second, and the link's save merged the
 *  styles off a prop the refresh had not moved yet. Kathak was on the screen
 *  (the row's own state) and gone from the database (`happy-path:2035`, a
 *  stranger reading the page). Keying each row by its list (this morning's
 *  fix for the chip the contact ⊕ wrote) did not touch this, and added a cost
 *  of its own: the row REMOUNTED when its own refresh landed, so a sheet that
 *  was still open closed a moment after each add.
 *
 *  So the lists live HERE, seeded once from the server's read, and every
 *  writer on the home reads and writes them: a save merges from `lists` (never
 *  a prop) and, once the door says it landed, `adopt`s what it wrote. Nothing
 *  remounts, nothing is read off a prop after the first render, and the second
 *  save cannot carry a list the first one already changed. ⚠ The props are
 *  deliberately NOT re-adopted when the page re-reads: every writer on this
 *  screen is inside the provider, so a re-read can only ever confirm what is
 *  already here — and adopting it mid-flight is exactly the race above, from
 *  the other side. A navigation remounts the page and seeds afresh.
 *
 *  A crew's doors are partial (`set_crew_styles`, `set_crew_socials`) and
 *  need no merge; its rows still read from here so the chip the contact ⊕
 *  writes reaches the links row without a remount. */
export interface RecordLists {
  styles: string[];
  socials: SocialLink[];
}

interface Ctx {
  lists: RecordLists;
  /** what a door has just written, in full */
  adopt: (next: RecordLists) => void;
}

const RecordListsContext = createContext<Ctx | null>(null);

export function RecordListsProvider({ styles, socials, children }: { styles: string[]; socials: SocialLink[]; children: ReactNode }) {
  const [lists, setLists] = useState<RecordLists>({ styles, socials });
  return <RecordListsContext.Provider value={{ lists, adopt: setLists }}>{children}</RecordListsContext.Provider>;
}

/** the lists, for a component that is always inside a provider */
export function useRecordLists(): Ctx {
  const ctx = useContext(RecordListsContext);
  if (!ctx) {
    throw new Error("useRecordLists: no RecordListsProvider above this home's editors");
  }
  return ctx;
}

/** the lists when there is a provider, or null — for a sheet that is also
 *  drawn somewhere no home is being edited */
export function useRecordListsOptional(): Ctx | null {
  return useContext(RecordListsContext);
}
