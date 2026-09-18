"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { commitHeaderDraft, commitWords, personPorts } from "@/features/media/commitHeaderDraft";
import { HeaderPictures, headerTiles } from "@/features/media/components/HeaderPictures";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { useHeaderDraft } from "@/features/media/headerDraft";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import { MUTED, SUB } from "@/lib/design/tokens";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { Profile } from "@/types/profile";
import { PencilIcon, Sheet, cornerChip, fieldInput, fieldLabel, sheetBtn } from "./profile-kit";

/** EDIT PROFILE (prototype 11364 — "one editor, and it is Edit profile"), in
 *  the order the user asked for on 15 Sep 2026: Name · Mobile · Profile
 *  picture · Header pictures · then where and who. Lifted out of the Profile
 *  tab into a component of its own the same day, because the user opened Home
 *  and asked "where is the edit profile button?" — so the pencil now sits on
 *  Home's hero as well, and both open THIS sheet. Every field lands on the one
 *  record through `update_my_profile`; the pictures land the moment they
 *  upload and the page re-reads.
 *
 *  Styles and links are not here — they have their own sheets on the Profile
 *  tab (11217, 11161) — so this save sends them back exactly as they are. */

/* the prototype offers 65 ages, 13 to 77 (11384) */
const AGES = Array.from({ length: 65 }, (_, i) => 13 + i);

export function EditProfileSheet({
  profile,
  header = [],
  headerMax = 0,
  onClose,
  onSaved,
}: {
  profile: Profile;
  header?: HeaderPhoto[];
  /** one for a user, five for an artist, ten for an organization (19 Sep 2026) */
  headerMax?: number;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isOrg = profile.role === "org";
  const [d, setD] = useState({ fullName: profile.fullName, city: profile.city ?? "", age: profile.age, about: profile.about ?? "", phone: profile.phone ?? "", email: profile.contactEmail ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* the header pictures as a DRAFT (16 Sep 2026) — the same bug lived here:
     `HeaderRemove`'s ✕ deleted a picture on the press, inside a sheet with a
     Cancel button. A person's floor is 0, not 1: `remove_my_header_photo` has
     no minimum guard, and inventing one here would be a rule nobody wrote. */
  const draft = useHeaderDraft({
    initial: header.map((h) => ({ id: h.id, path: h.path, url: h.url, signed: h.signed })),
    min: 0,
    max: headerMax,
  });
  const tiles = headerTiles(draft, profile.fullName);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const save = () => {
    /* the database refuses a profile without a city (9 Sep 2026) — say so before asking it */
    if (!d.city.trim()) {
      setErr("Your city is required — it is where Discover and the rankings place you.");
      return;
    }
    start(async () => {
      setErr(null);
      /* the words first: a refusal here must cost nothing (see BusinessEditSheet) */
      const out = await updateMyProfileAction({
        fullName: d.fullName,
        city: d.city.trim(),
        age: isOrg ? null : d.age,
        about: d.about.trim() || null,
        socials: profile.socials,
        styles: profile.styles,
        phone: d.phone.trim() || null,
        /* the Mail button's address (19 Sep 2026): an empty box clears it */
        contactEmail: d.email.trim() || null,
      });
      if (out.error) {
        setErr(out.error);
        return;
      }
      if (headerMax > 0 && draft.dirty) {
        const result = await commitHeaderDraft(draft.items, personPorts(profile.id, headerMax));
        draft.applyCommit(result);
        if (result.failures.length > 0) {
          setErr(commitWords(result, draft.changeCount));
          router.refresh();
          return;
        }
      }
      onSaved?.();
      onClose();
      router.refresh();
    });
  };

  return (
    <Portal>
    <Sheet label="Edit profile" onClose={onClose} maxHeight="88vh">
      <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Edit profile</b>
      <div style={fieldLabel}>Name</div>
      <input aria-label="Name" value={d.fullName} onChange={(e) => setD((x) => ({ ...x, fullName: e.target.value }))} style={fieldInput} />
      {/* the number is the person's to publish and theirs to take down: an
          empty box saves null, and the line under the box says so rather
          than making them guess (N8 — Call, S_profiletab 10879) */}
      <div style={fieldLabel}>Mobile</div>
      <input aria-label="Phone" type="tel" inputMode="tel" value={d.phone} onChange={(e) => setD((x) => ({ ...x, phone: e.target.value }))} placeholder="+91 98765 43210" style={fieldInput} />
      {/* CALL IS A STUDIO'S AND AN ORGANIZATION'S (19 Sep 2026, the user's list) —
          a person's number stays on their record and is no longer dialled from
          their page, so the line under the box says which is true here */}
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{isOrg ? "Shown on your organization's page as Call. Leave it empty and nobody sees a number." : "Kept on your account. It is not shown on your public page."}</div>
      {/* THE MAIL BUTTON'S ADDRESS (19 Sep 2026): an organization's and an
          artist's page carry Mail; a user's page carries no buttons at all */}
      <div style={fieldLabel}>Email</div>
      <input aria-label="Email" type="email" inputMode="email" value={d.email} onChange={(e) => setD((x) => ({ ...x, email: e.target.value }))} placeholder="you@example.com" style={fieldInput} />
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{isOrg ? "Shown on your organization's page as Mail." : "Shown on your page as Mail while you hold the Artist plan."} Leave it empty and nobody sees an address.</div>
      {/* one label style, every field — see BusinessEditSheet for why */}
      <div style={fieldLabel}>{isOrg ? "Update logo" : "Update profile"}</div>
      <PhotoPicker owner={{ kind: "avatar", id: profile.id }} hasPhoto={Boolean(profile.avatarPath)} label="Change your photo" />
      {/* THE HEADER PICTURES (15 Sep 2026): an artist has no verification
          step, so this sheet is where theirs are added — up to five; a user
          has one; an organization ten (the caps since 19 Sep 2026). A DRAFT
          since 16 Sep 2026: adding and removing both wait for Save, so Cancel
          means what it says. */}
      {headerMax > 0 ? (
        <>
          <div style={fieldLabel}>Update header</div>
          {/* the one non-obvious fact, and only to the person it is news to */}
          {headerMax === 1 ? <div style={{ fontSize: 10.5, color: SUB, marginBottom: 8 }}>The Artist plan makes it five.</div> : null}
          <HeaderPictures draft={draft} tiles={tiles} kind="person" canWrite addLabel="Add picture" onOpen={setLightbox} busy={pending} />
        </>
      ) : null}
      <div style={fieldLabel}>Location</div>
      <input aria-label="Location" value={d.city} onChange={(e) => setD((x) => ({ ...x, city: e.target.value }))} style={fieldInput} />
      {!d.city.trim() ? <div style={{ fontSize: 10.5, color: "#EF4444", marginTop: 4 }}>Your city is required — it is where Discover and the rankings place you.</div> : null}
      {/* an organization has no age (10594) */}
      {isOrg ? null : (
        <>
          <div style={fieldLabel}>Age</div>
          <select aria-label="Age" value={d.age ?? ""} onChange={(e) => setD((x) => ({ ...x, age: e.target.value ? Number(e.target.value) : null }))} style={fieldInput}>
            <option value="">—</option>
            {AGES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </>
      )}
      <div style={fieldLabel}>{isOrg ? "About" : "Bio"}</div>
      <textarea aria-label="Bio" value={d.about} rows={3} maxLength={220} onChange={(e) => setD((x) => ({ ...x, about: e.target.value }))} style={{ ...fieldInput, lineHeight: 1.5, resize: "none" }} />
      <div style={{ fontSize: 10, color: MUTED, textAlign: "right", marginTop: 4 }}>{d.about.length}/220</div>
      {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 8 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button type="button" onClick={onClose} style={sheetBtn(false)}>Cancel</button>
        <button type="button" disabled={pending || !d.city.trim()} onClick={save} style={sheetBtn(true)}>
          {pending ? "Saving…" : draft.dirty ? `Save · ${draft.changeCount} ${draft.changeCount === 1 ? "picture change" : "picture changes"}` : "Save"}
        </button>
      </div>
    </Sheet>
    {/* a SIBLING of the sheet — see PhotoLightbox's header for why */}
    {lightbox !== null ? (
      <PhotoLightbox
        shots={tiles.map((t) => ({ key: t.key, src: t.url, alt: t.alt, signed: t.signed }))}
        index={lightbox}
        onIndex={setLightbox}
        onClose={() => setLightbox(null)}
        label={profile.fullName}
      />
    ) : null}
    </Portal>
  );
}

/** The pencil on a hero's corner (10613) and the sheet behind it, in one
 *  client island — so a server page like Home can offer Edit profile. */
export function EditProfileButton({ profile, header = [], headerMax = 0 }: { profile: Profile; header?: HeaderPhoto[]; headerMax?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Edit profile" onClick={() => setOpen(true)} style={cornerChip}>
        <PencilIcon />
      </button>
      {open ? <EditProfileSheet profile={profile} header={header} headerMax={headerMax} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
