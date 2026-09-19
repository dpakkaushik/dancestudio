"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import dynamic from "next/dynamic";
import { CityPicker } from "@/features/geo/components/CityPicker";

/* THE MAP LOADS WHEN THE SHEET NEEDS IT (19 Sep 2026, "make app snappier"): this
   sheet is on Home, and the Google Maps picker — the map component, its loader,
   the places search — was in Home's first-load JavaScript for the one
   organization in a hundred loads that opens the sheet to place a pin */
const LocationPicker = dynamic(() => import("@/features/geo/components/LocationPicker").then((m) => m.LocationPicker), { ssr: false });
import { commitHeaderDraft, commitWords, personPorts } from "@/features/media/commitHeaderDraft";
import { HeaderPictures, headerTiles } from "@/features/media/components/HeaderPictures";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { useHeaderDraft } from "@/features/media/headerDraft";
import { setMyPlaceAction, updateMyProfileAction } from "@/features/profiles/server-actions/profile";
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
 *  tab (11217, 11161) — so this save sends them back exactly as they are.
 *
 *  PUSH 2 (19 Sep 2026), two of the user's answers: an ARTIST gets a switch
 *  under Mobile — "Show Call on my profile" (`phone_public`, off by default:
 *  "Call is off for artist page by default but should have option to make it
 *  available on profile"); an ORGANIZATION gets the map under Location — its
 *  PIN (`set_my_place`), which is what its page's Location button opens
 *  ("locations should be the google map link for the particular organization").
 *  The pin is written the moment it is placed, like a studio's: a pin somebody
 *  has visibly put should not need a second press, and the LOCKED picker
 *  (16 Sep 2026) is what keeps a scroll from moving it. */

/* THE DATE OF BIRTH'S BOUNDS AND ITS ARITHMETIC (19 Sep 2026). The prototype
   offered 65 ages, 13 to 77 (11384); the app asks for the date instead and the
   database works the age out from it, so these are the same 13-to-99 window the
   RPC checks — said here too, so the picker cannot offer a date it would refuse. */
const isoYearsAgo = (years: number): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
};
const ageFromDob = (iso: string): number => {
  const [y, m, day] = iso.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < day)) age -= 1;
  return age;
};

export function EditProfileSheet({
  profile,
  header = [],
  headerMax = 0,
  isArtist = false,
  onClose,
  onSaved,
}: {
  profile: Profile;
  header?: HeaderPhoto[];
  /** one for a user, five for an artist, ten for an organization (19 Sep 2026) */
  headerMax?: number;
  /** the plan's word — an artist's page can dial their number, so an artist gets the switch */
  isArtist?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isOrg = profile.role === "org";
  const [d, setD] = useState({ fullName: profile.fullName, city: profile.city ?? "", age: profile.age, dob: profile.dob ?? "", about: profile.about ?? "", phone: profile.phone ?? "", email: profile.contactEmail ?? "", phonePublic: profile.phonePublic });
  const [err, setErr] = useState<string | null>(null);
  const [placeNote, setPlaceNote] = useState<string | null>(null);
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
        /* THE DATE OF BIRTH (19 Sep 2026): the database works the age out from it; an empty box leaves it as it is */
        dob: isOrg || !d.dob ? undefined : d.dob,
        about: d.about.trim() || null,
        socials: profile.socials,
        styles: profile.styles,
        phone: d.phone.trim() || null,
        /* the Mail button's address (19 Sep 2026): an empty box clears it */
        contactEmail: d.email.trim() || null,
        /* CALL IS A TOGGLE (push 2): an organization's number is always its Call; a person's dials only while this is on */
        phonePublic: isOrg ? undefined : d.phonePublic,
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
          and, since push 2, an ARTIST'S BY CHOICE: the switch under the box is
          off until they turn it on. A plain user's number stays on the record
          and is dialled from nowhere; the line under the box says which is true */}
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>
        {isOrg ? "Shown on your organization's page as Call. Leave it empty and nobody sees a number." : isArtist ? "Shown on your page as Call only while the switch below is on." : "Kept on your account. It is not shown on your public page."}
      </div>
      {!isOrg && isArtist ? (
        <button
          type="button"
          role="switch"
          aria-checked={d.phonePublic}
          aria-label="Show Call on my profile"
          onClick={() => setD((x) => ({ ...x, phonePublic: !x.phonePublic }))}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 0 2px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--text)", textAlign: "left" }}
        >
          <span style={{ flex: 1, fontSize: 12, fontWeight: 800 }}>Show Call on my profile</span>
          <span aria-hidden="true" style={{ width: 42, height: 24, borderRadius: 12, flexShrink: 0, background: d.phonePublic ? "#22C55E" : "var(--el)", position: "relative", display: "inline-block" }}>
            <span style={{ position: "absolute", top: 3, left: d.phonePublic ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
          </span>
        </button>
      ) : null}
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
      {/* THE ONE CITY DROPDOWN (19 Sep 2026) — the same control as everywhere else */}
      <CityPicker value={d.city.trim() || null} onChange={(c) => setD((x) => ({ ...x, city: c ?? "" }))} label="" />
      {!d.city.trim() ? <div style={{ fontSize: 10.5, color: "#EF4444", marginTop: 4 }}>Your city is required — it is where Discover and the rankings place you.</div> : null}
      {/* AN ORGANIZATION'S PIN (push 2): what its page's Location button opens.
          Written the moment it is placed — see the header — and the picker opens
          LOCKED once there is a pin, so scrolling past the map moves nothing */}
      {isOrg ? (
        <>
          <div style={fieldLabel}>On the map</div>
          <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 6 }}>Where the Location button on your page points. Saved as soon as you place it.</div>
          <LocationPicker
            value={{ lat: profile.lat, lng: profile.lng, area: profile.city }}
            onChange={(p) => {
              start(async () => {
                const out = await setMyPlaceAction({ lat: p.lat, lng: p.lng });
                setPlaceNote(out.error ? out.error : "Pin saved — your Location button opens it now.");
                if (!out.error) router.refresh();
              });
            }}
          />
          {placeNote ? (
            <div role="status" style={{ fontSize: 10.5, color: placeNote.startsWith("Pin saved") ? "#22C55E" : "#F87171", marginTop: 6 }}>
              {placeNote}
            </div>
          ) : null}
        </>
      ) : null}
      {/* an organization has no age (10594) */}
      {isOrg ? null : (
        <>
          {/* A DATE OF BIRTH, NOT AN AGE (19 Sep 2026, the user: "age should
              always be DOB instead when selecting anywhere in the app" — "dob in
              picker and age on profile according to that"). A typed age is wrong
              a year later; the date is asked once and the age is worked out from
              it. The page still prints the number alone ("24, Gurugram"). */}
          <div style={fieldLabel}>Date of birth</div>
          <input
            type="date"
            aria-label="Date of birth"
            value={d.dob}
            min={isoYearsAgo(99)}
            max={isoYearsAgo(13)}
            onChange={(e) => setD((x) => ({ ...x, dob: e.target.value }))}
            style={fieldInput}
          />
          <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>
            {d.dob ? `Your profile says ${ageFromDob(d.dob)}.` : "Your age is worked out from this — it is never shown as a date."}
          </div>
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
export function EditProfileButton({ profile, header = [], headerMax = 0, isArtist = false }: { profile: Profile; header?: HeaderPhoto[]; headerMax?: number; isArtist?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label="Edit profile" onClick={() => setOpen(true)} style={cornerChip}>
        <PencilIcon />
      </button>
      {open ? <EditProfileSheet profile={profile} header={header} headerMax={headerMax} isArtist={isArtist} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
