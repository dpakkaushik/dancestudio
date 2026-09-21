"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { LocationPicker, type PickedLocation } from "@/features/geo/components/LocationPicker";
import { setTenantLocationAction } from "@/features/geo/server-actions/location";
import { updateTenantProfileAction } from "@/features/settings/server-actions/plans";
/* the style registry left with the styles block on 21 Sep — the value is still
   carried through this sheet's save, it is just not edited here any more */
import { CARD, INK, LINE, SUB } from "@/lib/design/tokens";
import type { PublicTenant } from "@/types/publicProfile";
import { PencilIcon, Sheet, cornerChip, fieldInput, fieldLabel, sheetBtn } from "./profile-kit";

/** The business's own Edit sheet — the prototype has ONE editor for a profile
 *  (11364, "one editor, and it is Edit profile"), and a studio's page is the
 *  same S_profiletab, so its owner edits the same way: the words under About
 *  (≤ 220, the sheet's own counter), the founding year ("Since 2016", 10691),
 *  the number the Call button dials (10879) and the links rail (10760). Saved
 *  through the one owner-only door, `update_business_profile`, which re-checks
 *  ownership inside and validates what a form cannot be trusted to.
 *
 *  AND THE PICTURES, SINCE 16 SEP 2026 (the user: "the update image option
 *  should be inside the edit profile"). They used to be controls on the hero —
 *  a ＋ on the disc's rim and a ✕ per header picture, one square at a time. Here
 *  the whole set is a gallery you can open a picture from. A STUDIO's header
 *  pictures are the photos it showed DanceOS (5–10, and the database keeps the
 *  last one); an ARTIST PAGE's header is its OWNER's own pictures, so those are
 *  edited in Edit profile on the person — this sheet draws the disc for both
 *  and the header for a studio.
 *
 *  ⚠ AND THE PICTURES ARE A DRAFT, LIKE EVERY OTHER FIELD HERE (16 Sep 2026).
 *  The first cut put the immediate-write grid from the verification form inside
 *  this sheet, which has a Cancel button — so a ✕ destroyed a picture on the
 *  press and Cancel had nothing to undo. The user lost four that way. Staging
 *  is not a new idea imported to fix it: it is what About, Since, the phone and
 *  the links have always done here, and what the prototype's own edit sheet
 *  does (11364-11400 — Cancel is `setEditOpen(false)` and NOTHING else). The
 *  DISC is the one thing still written immediately, and deliberately: changing
 *  it REPLACES rather than destroys — `PhotoPicker` never deletes the old
 *  object — and the result is visible on screen the moment it lands, which is
 *  the same test the map pin's own comment sets further down. */


/** ⚠ `photos`, `ownerId` and `canEditPhoto` are GONE (20 Sep 2026). All three
 *  existed for the picture blocks, and the pictures are two ⊕ controls on the
 *  studio's own home now — `StudioPictures.tsx`. Props nothing reads are a lie
 *  to the next reader, so the three call sites stopped sending them in the same
 *  push. */
export function BusinessEditSheet({
  tenant,
  onClose,
}: {
  tenant: PublicTenant;
  onClose: () => void;
}) {
  const router = useRouter();
  /* the name (18 Sep 2026, the user: "give option to rename") — the owner's alone,
     like everything else this sheet saves through the one door */
  const [name, setName] = useState(tenant.name);
  /* ⚠ THE ABOUT IS GONE ENTIRELY (20 Sep 2026). For one day this sheet read the
     column without writing it, so a Save could not wipe a paragraph written
     before the field went away; the user then asked for the column itself, so
     `update_business_profile` no longer takes `p_about` and there is nothing
     left to pass back. */
  const [founded, setFounded] = useState(tenant.foundedYear ? String(tenant.foundedYear) : "");
  const [phone, setPhone] = useState(tenant.phone ?? "");
  /* the Mail button's address (19 Sep 2026) — an empty box clears it */
  const [email, setEmail] = useState(tenant.contactEmail ?? "");
  /* ⚠ NO `socials` STATE — the links are edited on the studio's own home now
     (`StudioLinksRow`), the way a person's are on theirs. They are still SENT
     below, unchanged, because this door takes the whole profile and omitting
     them would empty the rail. */
  /* THE STYLES IT DANCES (19 Sep 2026, the user: "some studios dont show dance
     styles on profile it is mandatory to have one at least"). They were derived
     from the studio's PUBLISHED classes, so a studio with none showed none —
     and a brand-new studio always has none. Its own field now, and the database
     refuses a studio that ends up with an empty list. */
  /* ⚠ READ AND SENT, NEVER SET — the styles are edited on the studio's own band
     since 21 Sep, and this sheet carries the value through untouched because
     `update_business_profile` takes the whole profile and an omitted list would
     empty a column the same RPC then refuses. */
  const [styles] = useState<string[]>(tenant.styles);
  const [err, setErr] = useState<string | null>(null);
  const [placeNote, setPlaceNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isStudio = tenant.type === "studio";

  /** The pin saves itself. A location is chosen by a gesture that is already
   *  visible on screen — the map has moved, the address has appeared — so
   *  asking for a second press to confirm it reads as though the first did not
   *  register. Failures are said out loud rather than swallowed. */
  const savePlace = (picked: PickedLocation) =>
    start(async () => {
      setPlaceNote("Saving the pin…");
      const out = await setTenantLocationAction({
        tenantId: tenant.id,
        lat: picked.lat,
        lng: picked.lng,
        area: picked.area,
        city: picked.city,
      });
      setPlaceNote(out.error ? `Could not save the pin — ${out.error}` : "Saved. Discover measures from here now.");
      if (!out.error) {
        router.refresh();
      }
    });
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1950 + 1 }, (_, i) => thisYear - i);

  /** ⚠ THE WORDS, AND NOTHING ELSE (20 Sep 2026). This used to be "the words
   *  first, THEN the pictures" — two commits in one press, with the picture half
   *  able to fail on its own and leave the sheet open. The pictures are their own
   *  controls on the studio's home now, so a Save here is one call that either
   *  refuses or lands. */
  const save = () =>
    start(async () => {
      setErr(null);
      /* ⚠ SAY THE RULE BEFORE THE DATABASE REFUSES IT — AND SAY WHERE TO FIX IT
         (21 Sep 2026). `update_business_profile` refuses a studio with no style,
         and since the styles moved to the band this sheet cannot add one — so
         the old message would have been a dead end for the twelve studios that
         predate the rule: change the phone, press Save, be told about styles,
         and find nothing here that sets one. It names the control now. */
      if (isStudio && styles.length === 0) {
        setErr("This studio has no dance style yet, and the save needs one — add it with the ＋ beside the styles on the studio's home.");
        return;
      }
      const yr = founded ? Number(founded) : null;
      const out = await updateTenantProfileAction({
        tenantId: tenant.id,
        styles,
        name: name.trim() !== tenant.name ? name.trim() : undefined,
        foundedYear: yr,
        phone: phone.trim() || null,
        contactEmail: email.trim() || null,
        /* ⚠ SENT UNCHANGED (20 Sep 2026). The links are edited on the studio's
           home now, but this door takes the WHOLE profile — omitting them would
           empty the rail the moment somebody saved a phone number. */
        socials: tenant.socials,
        enquiryTypes: tenant.enquiryTypes,
        accepts: tenant.accepts,
      });
      if (out.error) {
        setErr(out.error);
        return;
      }
      onClose();
      router.refresh();
    });

  return (
    <Portal>
    <Sheet label="Edit business" onClose={onClose} maxHeight="88vh">
      <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Edit {isStudio ? "studio" : "artist page"}</b>

      {/* ── THE PICTURES (16 Sep 2026) ────────────────────────────────────────
          The round one first, because it is the one everybody sees on a card;
          then the header, which is a set and needs room to be one. The two
          paragraphs that used to explain them are gone at the user's
          instruction — a picture beside an Add button does not need a caption,
          and what was TRUE in them survives where it can be acted on: "one
          always stays" on the disabled ✕ that enforces it, and "an admin checks
          these" on the count badge and on the verification form itself. */}
      {/* ⚠ ONE LABEL STYLE, EVERY FIELD (16 Sep 2026, the user: "why About,
          Since etc has different font than Header Picture and Profile picture,
          why so much randomness … everything should be standard").
          They were right and it was a half-finished edit of mine: fixing the
          labels' legibility, I introduced a SECOND, larger heading style and
          then used it on two blocks out of five. Two species of heading in one
          form is not a hierarchy, it is an accident. A form gets ONE label
          tier — the small tracked caps every app uses for this — and grouping
          comes from the order and the spacing, not from a second typeface. */}
﻿      {/* ⚠ THE PICTURES LEFT THIS SHEET (20 Sep 2026, the user: "edit profile
          for studio not consistent with how its done for Artist and users").
          They arrived here on 16 Sep, when the ask was "the update image option
          should be inside the edit profile" — and then a person's moved OUT
          again on 19-20 Sep, to a ⊕ on the disc and a ⊕ on the posters rail on
          Home, and a studio's stayed. Two kinds of account editing the same two
          pictures two different ways is the drift this file has been asked about
          three times, so a studio's are the same two controls in the same two
          places now (`StudioPictures.tsx`).
          ⚠ WHAT MOVED WITH THEM IS THE DRAFT. The posters are still staged and
          still committed by Save, because ✕ on one is a DELETION and Cancel has
          to be able to mean nothing happened — this is the very screen where a
          Cancel once destroyed four of a studio's pictures. The disc still
          commits on upload, because replacing is not destroying. */}

      {/* ⚠ EVERY LABEL BELOW IS A SIBLING OF ITS CONTROL, NOT ITS WRAPPER
          (16 Sep 2026). These five were `<label style={fieldLabel}>` around the
          input, and `text-transform` inherits while Tailwind's preflight gives
          form controls `font: inherit` — so the studio's own About paragraph,
          its phone number and every pasted URL rendered UPPERCASE at weight
          800. The explicit aria-label on each control is NOT optional: the
          wrapper was what gave these fields their accessible name, and the e2e
          suite finds three of them by it. */}
      <div style={fieldLabel}>Name</div>
      <input aria-label="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={isStudio ? "The studio's name" : "Your page's name"} style={fieldInput} />
      {/* ⚠ NO ABOUT FIELD, AND NO COLUMN BEHIND IT (20 Sep 2026: "Remove bio from
          all profiles", then "about and bio for profiles need to go away"). For
          one day the column stayed and was read but never written; it is dropped
          now, so there is nothing to keep and nothing to pass back. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={fieldLabel}>Since</div>
          <select aria-label="Since" value={founded} onChange={(e) => setFounded(e.target.value)} style={fieldInput}>
            <option value="">Not shown</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div>
          {/* "Phone (Call button)" until 16 Sep 2026 — the parenthetical told
              the owner what the number is FOR, which the public page already
              shows them, at the cost of being the longest label on the form */}
          <div style={fieldLabel}>Phone</div>
          <input aria-label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" style={fieldInput} />
        </div>
      </div>
      {/* THE MAIL BUTTON'S ADDRESS (19 Sep 2026, the user: "Mail for all except
          users") — beside the number the Call button dials, saved through the
          same door; an empty box clears it */}
      <div style={fieldLabel}>Email</div>
      <input aria-label="Email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hello@studio.example" style={fieldInput} />

      {/* ⚠ THE DANCE STYLES LEFT THIS SHEET TOO (21 Sep 2026, the user: "make
          sure all profile types have similar ways to edit the profile, the
          segments like social media, dance styles, pictures and posters"). They
          were the last of the four segments still edited here — a row of chips
          and a `<select>` — while a person's have been a ＋ on the band since
          19 Sep and this studio's LINKS moved out on 20 Sep for exactly this
          reason. `StudioStylesRow` on the studio's own home is where they are,
          and it uses the same editor a person's ＋ opens.
          ⚠ THE VALUE IS STILL SENT BY THIS SHEET, UNCHANGED, because
          `update_business_profile` takes the whole profile and a save that
          omitted it would empty a column the same RPC then refuses. Taking a
          field off a form must never silently delete what it held — the 16 Sep
          lesson, and the reason `styles` is still read into state above. */}

﻿      {/* ⚠ THE LINKS LEFT THIS SHEET (20 Sep 2026, the user: "edit profile for
          studio not consistent with how its done for Artist and users. for
          social media links, photos etc."). A person's links are a row in the
          band on HOME with a ＋ beside them and have been since 19 Sep; a
          studio's were a block halfway down this form. They are that same row
          now — `StudioLinksRow` on the studio's own home — so the two kinds of
          account are edited the same way, in the same place, with the same
          sheets behind the same chips. */}

      {/* ── WHERE IT IS (11 Sep 2026) ──────────────────────────────────────────
          The one field the business never had. Until an owner moves this pin
          their studio sits on its city's centroid, along with every other
          studio in that city, and Discover's "2.4 km away" is the same 2.4 km
          for all of them. Saved on its own, immediately, rather than with the
          rest of the sheet: it is a different kind of edit — a map gesture,
          not a form field — and pressing Save to commit a pin somebody has
          already visibly placed reads like it did not take. */}
      <div style={fieldLabel}>Where it is</div>
      <LocationPicker
        value={{ lat: tenant.lat, lng: tenant.lng, area: tenant.area }}
        /* the business already has a point; the centre is only the fallback for
           one that does not, so its own coordinates are the honest opening */
        centre={tenant.lat != null && tenant.lng != null ? { lat: tenant.lat, lng: tenant.lng } : null}
        onChange={savePlace}
      />
      {/* a failure must not be the faintest text on the screen */}
      <div style={{ fontSize: 10.5, color: placeNote && placeNote.startsWith("Could not") ? "#F87171" : SUB, marginTop: 6, lineHeight: 1.45 }}>
        {placeNote ?? "This is what Discover measures from when somebody looks for studios near them."}
      </div>

      {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 10 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={onClose} style={sheetBtn(false)}>
          Cancel
        </button>
        {/* ⚠ PLAIN "Save" AGAIN (20 Sep 2026) — it used to count the picture
            changes ("Save · 2 picture changes") because this sheet committed
            them; the posters have their own Save on their own sheet now, and
            this one commits words. */}
        <button type="button" disabled={pending} onClick={save} style={sheetBtn(true)}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </Sheet>
    {/* ⚠ NO LIGHTBOX HERE ANY MORE — nothing in this sheet is a picture to open.
        Pressing the disc on the studio's home opens its picture, and pressing a
        poster opens that poster, which is where those gestures belong. */}
    </Portal>
  );
}

/** The owner's Edit control (10613) and the sheet behind it, in one client
 *  island. Two dresses: the cell in the public page's action row, and — since
 *  15 Sep 2026 — the pencil on the hero's corner of a studio's own home, the
 *  same chip the Profile tab's Edit wears. */
export function BusinessEditButton({
  tenant,
  corner = false,
}: {
  tenant: PublicTenant;
  corner?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {corner ? (
        <button type="button" aria-label="Edit studio" onClick={() => setOpen(true)} style={{ ...cornerChip, border: "1.5px solid rgba(255,255,255,.28)" }}>
          <PencilIcon />
        </button>
      ) : (
        <button type="button" aria-label="Edit business" onClick={() => setOpen(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, height: 38, borderRadius: 11, cursor: "pointer", fontWeight: 800, fontSize: 11, boxSizing: "border-box", padding: "0 4px", background: CARD, color: INK, border: `1.5px solid ${LINE}`, fontFamily: "inherit" }}>
          Edit
        </button>
      )}
      {open ? <BusinessEditSheet tenant={tenant} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
