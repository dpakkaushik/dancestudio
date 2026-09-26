"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import { Portal } from "@/components/ui/Portal";
import { updateCrewAction } from "@/features/crews/server-actions/crews";
import { CityPicker } from "@/features/geo/components/CityPicker";
import { Sheet, fieldInput, fieldLabel, sheetBtn } from "@/features/profiles/components/profile-kit";
import { MUTED } from "@/lib/design/tokens";
import type { Crew } from "@/types/crew";

/** EDIT CREW (19 Sep 2026) — the leader's one editor for the crew, the same
 *  shape as Edit profile and the studio's Edit sheet (the prototype has ONE
 *  editor per profile, 11364): the name, the city, the style, the number and
 *  the address the Mail button on the crew's page dials.
 *  ⚠ THE PICTURES LEFT ON 21 Sep 2026 for the ⊕ on the disc and the ⊕ on the
 *  rail (`CrewPictures.tsx`), which is where every other profile's have been
 *  since 20 Sep. This sheet holds WORDS now, like the other three.
 *  Until today a crew's name, city and style were edited on the desk and its
 *  photo from a picker on the home; the pencil on the crew's home opens THIS.
 *
 *  THE PICTURES ARE A DRAFT, like every other field here (16 Sep 2026's
 *  lesson): adding and removing wait for Save, so Cancel means what it says.
 *  The DISC is the one thing written immediately, deliberately — changing it
 *  REPLACES rather than destroys. Five header pictures at most ("Artist and
 *  Crews — 5"), no floor: a crew may hold none. */
export function CrewEditSheet({ crew, onClose }: { crew: Crew; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(crew.name);
  const [city, setCity] = useState<string | null>(crew.city);
  const [style, setStyle] = useState(crew.style);
  /* ⚠ THE NUMBER, THE SWITCH AND THE ADDRESS LEFT THIS SHEET (26 Sep 2026, the
     user: "all buttons like email, location, phone, message, enquiry on home tab
     should also be like social media and dance style edit style … and those
     options can be removed from edit profile"). They are the ⊕ beside the
     buttons on the crew's own home now (`ContactEditor`). This save leaves them
     exactly as they are: `update_crew`'s three last arguments read null as
     "unchanged". */
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** the words first, then the pictures, one refresh at the end — see
   *  BusinessEditSheet for why the order is deliberate */
  const save = () => {
    if (!name.trim()) return setErr("Name your crew first");
    if (!city) return setErr("Which city is the crew in?");
    start(async () => {
      setErr(null);
      const out = await updateCrewAction({ crewId: crew.id, name: name.trim(), city, style });
      if (out.error) {
        setErr(out.error);
        return;
      }
      onClose();
      router.refresh();
    });
  };

  return (
    <Portal>
      <Sheet label="Edit crew" onClose={onClose} maxHeight="88vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Edit crew</b>
        <div style={fieldLabel}>Name</div>
        <input aria-label="Name" value={name} maxLength={64} onChange={(e) => setName(e.target.value)} style={fieldInput} />
        {/* ⚠ NO PICTURES HERE ANY MORE (21 Sep 2026, the user: "make sure all
            profile types have similar ways to edit the profile, the segments
            like social media, dance styles, pictures and posters"). "Update
            photo" and "Update header" sat between Name and City; they are the
            ⊕ on the disc and the ⊕ on the rail now, on the crew's own home,
            which is where a user's, an artist's and a studio's have been since
            20 Sep. This sheet holds WORDS, like every other one. */}
        <div style={fieldLabel}>City</div>
        <CityPicker value={city} onChange={(c) => setCity(c)} label="" />
        <div style={fieldLabel}>Style</div>
        {/* the FIRST of the crew's styles — the list is the ＋ on the crew's home (26 Sep 2026) */}
        <DosStylePicker value={style} onChange={setStyle} ariaLabel="Style" />
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>The number, the email and the links are the ⊕ beside the buttons on the crew&apos;s home.</div>
        {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 10 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={sheetBtn(false)}>
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={save} style={sheetBtn(true)}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </Sheet>
    </Portal>
  );
}

/** ⚠ THE PENCIL IS GONE FROM THE CORNER (22 Sep 2026), for the studio's reason
 *  and in the same breath. The user asked for a STUDIO's edit to move into
 *  Settings and for its view button to look like the other profiles'; a crew's
 *  home carried the identical pencil-plus-eye pair, so fixing only the screen
 *  that was complained about is the mistake this file has recorded twice — C36
 *  corrected an organization's add control and missed the crew's, and C49 had
 *  to come back for it.
 *
 *  ⚠ THIS SUPERSEDES C53's crew sentence, which said a crew's Settings has
 *  nothing of its own *because* its name, picture and city are the pencil on
 *  its home. That was true when it was written and is the thing being changed:
 *  the sheet carries **Edit crew** now, so a crew's Settings is no longer an
 *  apology for being empty. */
export function CrewEditFromUrl({ crew }: { crew: Crew }) {
  const router = useRouter();
  return <CrewEditSheet crew={crew} onClose={() => router.back()} />;
}
