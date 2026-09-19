"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DosStylePicker } from "@/components/ui/DosStyleKit";
import { Portal } from "@/components/ui/Portal";
import { updateCrewAction } from "@/features/crews/server-actions/crews";
import { CityPicker } from "@/features/geo/components/CityPicker";
import { commitHeaderDraft, commitWords, crewPorts } from "@/features/media/commitHeaderDraft";
import { HeaderPictures, headerTiles } from "@/features/media/components/HeaderPictures";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { useHeaderDraft } from "@/features/media/headerDraft";
import { PencilIcon, Sheet, cornerChip, fieldInput, fieldLabel, sheetBtn } from "@/features/profiles/components/profile-kit";
import { MUTED } from "@/lib/design/tokens";
import { HEADER_MAX_CREW } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { Crew } from "@/types/crew";

/** EDIT CREW (19 Sep 2026) — the leader's one editor for the crew, the same
 *  shape as Edit profile and the studio's Edit sheet (the prototype has ONE
 *  editor per profile, 11364): the name, the photo, the header pictures, the
 *  city, the style, and the address the Mail button on the crew's page dials.
 *  Until today a crew's name, city and style were edited on the desk and its
 *  photo from a picker on the home; the pencil on the crew's home opens THIS.
 *
 *  THE PICTURES ARE A DRAFT, like every other field here (16 Sep 2026's
 *  lesson): adding and removing wait for Save, so Cancel means what it says.
 *  The DISC is the one thing written immediately, deliberately — changing it
 *  REPLACES rather than destroys. Five header pictures at most ("Artist and
 *  Crews — 5"), no floor: a crew may hold none. */
export function CrewEditSheet({ crew, header = [], onClose }: { crew: Crew; header?: HeaderPhoto[]; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(crew.name);
  const [city, setCity] = useState<string | null>(crew.city);
  const [style, setStyle] = useState(crew.style);
  const [email, setEmail] = useState(crew.contactEmail ?? "");
  /* CALL IS A TOGGLE (push 2): the number, and whether the crew's page dials it */
  const [phone, setPhone] = useState(crew.phone ?? "");
  const [phonePublic, setPhonePublic] = useState(crew.phonePublic);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const draft = useHeaderDraft({
    initial: header.map((h) => ({ id: h.id, path: h.path, url: h.url, signed: h.signed })),
    min: 0,
    max: HEADER_MAX_CREW,
  });
  const tiles = headerTiles(draft, crew.name);
  const [lightbox, setLightbox] = useState<number | null>(null);

  /** the words first, then the pictures, one refresh at the end — see
   *  BusinessEditSheet for why the order is deliberate */
  const save = () => {
    if (!name.trim()) return setErr("Name your crew first");
    if (!city) return setErr("Which city is the crew in?");
    start(async () => {
      setErr(null);
      const out = await updateCrewAction({ crewId: crew.id, name: name.trim(), city, style, contactEmail: email.trim() || null, phone: phone.trim() || null, phonePublic });
      if (out.error) {
        setErr(out.error);
        return;
      }
      if (draft.dirty) {
        const result = await commitHeaderDraft(draft.items, crewPorts(crew.id));
        draft.applyCommit(result);
        if (result.failures.length > 0) {
          setErr(commitWords(result, draft.changeCount));
          router.refresh();
          return;
        }
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
        <div style={fieldLabel}>Update photo</div>
        <PhotoPicker owner={{ kind: "crew", id: crew.id }} hasPhoto={Boolean(crew.photo)} label="Change the crew photo" />
        <div style={fieldLabel}>Update header</div>
        <HeaderPictures draft={draft} tiles={tiles} kind="person" canWrite addLabel="Add picture" onOpen={setLightbox} busy={pending} />
        <div style={fieldLabel}>City</div>
        <CityPicker value={city} onChange={(c) => setCity(c)} label="" />
        <div style={fieldLabel}>Style</div>
        <DosStylePicker value={style} onChange={setStyle} ariaLabel="Style" />
        <div style={fieldLabel}>Mobile</div>
        <input aria-label="Phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={fieldInput} />
        {/* the switch IS the rule (push 2): off, nobody reads the number — not the page, not the API */}
        <button
          type="button"
          role="switch"
          aria-checked={phonePublic}
          aria-label="Show Call on the crew's page"
          onClick={() => setPhonePublic((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--text)", textAlign: "left" }}
        >
          <span style={{ flex: 1, fontSize: 12, fontWeight: 800 }}>Show Call on the crew&apos;s page</span>
          <span aria-hidden="true" style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, background: phonePublic ? "#22C55E" : "var(--el)", position: "relative", display: "inline-block" }}>
            <span style={{ position: "absolute", top: 3, left: phonePublic ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
          </span>
        </button>
        <div style={fieldLabel}>Email</div>
        <input aria-label="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="crew@example.com" style={fieldInput} />
        <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Shown on the crew&apos;s page as Mail. Leave it empty and nobody sees an address.</div>
        {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 10 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" onClick={onClose} style={sheetBtn(false)}>
            Cancel
          </button>
          <button type="button" disabled={pending} onClick={save} style={sheetBtn(true)}>
            {pending ? "Saving…" : draft.dirty ? `Save · ${draft.changeCount} ${draft.changeCount === 1 ? "picture change" : "picture changes"}` : "Save"}
          </button>
        </div>
      </Sheet>
      {/* a SIBLING of the sheet — see PhotoLightbox's header for why */}
      {lightbox !== null ? <PhotoLightbox shots={tiles.map((t) => ({ key: t.key, src: t.url, alt: t.alt, signed: t.signed }))} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} label={crew.name} /> : null}
    </Portal>
  );
}

/** The pencil on the crew home's corner and the sheet behind it, in one client island. */
export function CrewEditButton({ crew, header = [] }: { crew: Crew; header?: HeaderPhoto[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Edit crew" onClick={() => setOpen(true)} style={cornerChip}>
        <PencilIcon />
      </button>
      {open ? <CrewEditSheet crew={crew} header={header} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
