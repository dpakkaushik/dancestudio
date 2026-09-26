"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { SUB } from "@/lib/design/tokens";
import { PencilIcon, cornerChip } from "./profile-kit";

/** EDIT MODE — ONE PENCIL, EVERY EDITOR ON A HOME (26 Sep 2026).
 *
 *  The user: *"it should be possible to edit everything in the edit profile
 *  option on the home page for every profile. should give edit plus button like
 *  profile pic for every part on the home tab which is editable. so fix that
 *  clicking on the edit pencil button from top right on every profile should
 *  open the option to edit everything from the home tab thats when the button
 *  to edits need to appear."*
 *
 *  So a home has TWO states rather than a permanent set of ⊕ chips: read, and
 *  edit. The pencil in the hero's corner toggles it, and every editor on the
 *  home — the disc's ⊕, the posters' ⊕, the styles ＋, the links ＋, the contact
 *  buttons' ⊕ and the Edit details chip — reads this context and draws itself
 *  only while `editing`. While not editing the home reads exactly as it did,
 *  minus the controls.
 *
 *  ⚠ IT IS A CONTEXT RATHER THAN A PROP because the controls sit at six
 *  different depths across five server-rendered pages, and threading a boolean
 *  through `IdentityHero`, `EntityBand` and every row is how the boolean ends
 *  up wrong in one of them (the 22 Sep lesson from `FormPage`'s `sheet`). The
 *  page wraps itself in the provider; the leaf reads the answer.
 *
 *  ⚠ THE DEFAULT IS NOT EDITING. A control rendered outside a provider draws
 *  nothing, which is the safe failure: a missing pencil is visible, a missing
 *  gate is not. */
const EditModeContext = createContext<{ editing: boolean; toggle: () => void }>({ editing: false, toggle: () => {} });

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return <EditModeContext.Provider value={{ editing, toggle: () => setEditing((v) => !v) }}>{children}</EditModeContext.Provider>;
}

export const useEditMode = () => useContext(EditModeContext);

/** THE PENCIL — the hero's top-right corner, over the eye. The same 36px
 *  blurred-glass square every corner control wears; `aria-pressed` is the mode,
 *  so a screen reader and a locator both know whether the home is open. */
export function EditModeButton() {
  const { editing, toggle } = useEditMode();
  return (
    <button
      type="button"
      aria-label="Edit profile"
      aria-pressed={editing}
      onClick={toggle}
      style={{ ...cornerChip, background: editing ? "var(--text)" : cornerChip.background, color: editing ? "var(--solid)" : "#fff" }}
    >
      <PencilIcon />
    </button>
  );
}

/** the small chip that opens a home's DETAILS sheet — the words a form still
 *  holds (a name, a date of birth, a city; a founding year and the pin) — drawn
 *  beside the name while editing. `href` for a sheet that is an ADDRESS
 *  (`?edit=1`, C54's grammar), `onClick` for one a client island owns. */
export function EditDetailsChip({ href, onClick }: { href?: string; onClick?: () => void }) {
  const { editing } = useEditMode();
  if (!editing) return null;
  const style = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    padding: "5px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    cursor: "pointer",
    background: "var(--card)",
    border: "1.5px solid var(--el)",
    color: "var(--text)",
    textDecoration: "none",
    fontFamily: "inherit",
  } as const;
  const body = (
    <>
      <span style={{ display: "inline-flex", lineHeight: 0, color: SUB }}>
        <PencilIcon />
      </span>
      Edit details
    </>
  );
  return href ? (
    <Link href={href} scroll={false} aria-label="Edit details" style={style}>
      {body}
    </Link>
  ) : (
    <button type="button" aria-label="Edit details" onClick={onClick} style={style}>
      {body}
    </button>
  );
}
