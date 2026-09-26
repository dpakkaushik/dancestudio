"use client";

import { useRouter } from "next/navigation";
import { setCrewSocialsAction, setCrewStylesAction } from "@/features/crews/server-actions/crews";
import { LinksRowEditor } from "@/features/profiles/components/LinksRowEditor";
import { StylesRowEditor } from "@/features/profiles/components/StylesRowEditor";
import type { Crew } from "@/types/crew";

/** A CREW'S STYLES AND LINKS, EDITED ON ITS OWN HOME (26 Sep 2026, the user:
 *  "all profiles should have both dance style edits and social media edit
 *  options and option to add multiple").
 *
 *  A crew had ONE style, in its Edit sheet, and no links at all (`crews` had no
 *  `socials` column). `20260926120000` gives it a list of styles — `style` is
 *  kept equal to the first, for the card, the board and the search — and the
 *  same links list a person's and a business's carry. The rows are the app's
 *  one styles row and one links row; what is this file's is the two doors,
 *  `set_crew_styles` and `set_crew_socials`, which are the leader's alone and
 *  PARTIAL — each takes its own list, so nothing here has to merge. The lists
 *  the rows draw are the home's (`RecordLists`, seeded from the crew's row). */
export function CrewStylesRow({ crew, canEdit }: { crew: Crew; canEdit: boolean }) {
  const router = useRouter();
  return (
    <StylesRowEditor
      canEdit={canEdit}
      aria={(s) => `${s} — the crew's style`}
      lastWords="A crew dances at least one style"
      save={async (next) => {
        const out = await setCrewStylesAction({ crewId: crew.id, styles: next });
        if (!out.error) router.refresh();
        return out.error;
      }}
    />
  );
}

export function CrewLinksRow({ crew, canEdit }: { crew: Crew; canEdit: boolean }) {
  const router = useRouter();
  return (
    <LinksRowEditor
      canEdit={canEdit}
      save={async (next) => {
        const out = await setCrewSocialsAction({ crewId: crew.id, socials: next });
        if (!out.error) router.refresh();
        return out.error;
      }}
    />
  );
}
