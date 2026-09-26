"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { CityPicker } from "@/features/geo/components/CityPicker";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import { MUTED } from "@/lib/design/tokens";
import type { Profile } from "@/types/profile";
import { EditDetailsChip } from "./EditMode";
import { Sheet, fieldInput, fieldLabel, sheetBtn } from "./profile-kit";
import { useRecordListsOptional } from "./RecordLists";

/** EDIT PROFILE (prototype 11364 — "one editor, and it is Edit profile"), in
 *  the order the user asked for on 15 Sep 2026: Name · Mobile · Profile
 *  picture · Header pictures · then where and who. Lifted out of the Profile
 *  tab into a component of its own the same day, because the user opened Home
 *  and asked "where is the edit profile button?" — so the pencil now sits on
 *  Home's hero as well, and both open THIS sheet. Every field lands on the one
 *  record through `update_my_profile`; the pictures land the moment they
 *  upload and the page re-reads.
 *
 *  ⚠ IT IS SETTINGS' FIRST OPTION NOW, AND IT CARRIES NO PICTURES (19 Sep 2026,
 *  the user: "Editing profile should be shifted to settings and should be the
 *  top option, all edit profile options to be removed from home and profile
 *  pages … Profile Pic and Top bar Photo column only editable from home tab and
 *  should be removed from edit profile"). So the pencil is gone from Home's
 *  corner and the Profile tab's, the two picture blocks are gone from this
 *  sheet, and both live behind the DISC on Home (`PicturesSheet`). What is left
 *  here is the words: who you are, how to reach you, where you are, and the bio.
 *
 *  Styles and links are not here either — they are edited on Home's own band
 *  (`HomeBand`, the prototype's sheets 11217 · 11161) — so this save sends them
 *  back exactly as they are.
 *
 *  PUSH 2 (19 Sep 2026), the user's answer: an ARTIST gets a switch under
 *  Mobile — "Show Call on my profile" (`phone_public`, off by default: "Call
 *  is off for artist page by default but should have option to make it
 *  available on profile").
 *
 *  ⚠ THE ORGANIZATION'S PIN BLOCK IS GONE (26 Sep 2026): it wrote `set_my_place`
 *  on the organization LOGIN's profile row, and that login is retired — an
 *  organization is a business a person opens, and its pin is its business
 *  row's, placed from its own Edit sheet like a studio's. `isOrg` here can no
 *  longer be true; the branches that read it are left so the file keeps its
 *  shape until the profile role itself is retired. */

/** THE "EDIT DETAILS" CHIP ON HOME AND THE SHEET IT OPENS (26 Sep 2026) — drawn
 *  beside the name while the home is in edit mode; the words a form still holds
 *  (the name, the date of birth, the city). It is the one client island a
 *  server-rendered Home needs for this sheet. */
export function PersonDetailsEdit({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EditDetailsChip onClick={() => setOpen(true)} />
      {open ? <EditProfileSheet profile={profile} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

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
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isOrg = profile.role === "org";
  /* the styles and the links as the HOME holds them, when this sheet is opened
     from a home being edited (26 Sep 2026) — a style added on the band a moment
     ago is not written back over by a change of city; off the prop elsewhere */
  const home = useRecordListsOptional();
  const lists = home?.lists ?? { styles: profile.styles, socials: profile.socials };
  /* ⚠ NO NUMBER, NO SWITCH, NO EMAIL HERE (26 Sep 2026, the user: "all buttons
     like email, location, phone, message, enquiry on home tab should also be
     like social media and dance style edit style … and those options can be
     removed from edit profile"). They are the ⊕ beside the buttons on Home
     (`ContactEditor`); this save sends all three back exactly as they are. */
  const [d, setD] = useState({ fullName: profile.fullName, city: profile.city ?? "", age: profile.age, dob: profile.dob ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
        socials: lists.socials,
        styles: lists.styles,
        /* unchanged — the contact sheet on Home is where these move */
        phone: profile.phone ?? null,
        contactEmail: profile.contactEmail ?? null,
      });
      if (out.error) {
        setErr(out.error);
        return;
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
      {/* ⚠ NO MOBILE, NO CALL SWITCH, NO EMAIL (26 Sep 2026) — they are the ⊕
          beside the buttons on Home; and NO PICTURES (19 Sep 2026) — both
          sections live behind the disc on Home. This sheet is who you are and
          where you are. */}
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 8 }}>Your number, email and links are edited on Home — press the pencil, then the ⊕ beside the buttons.</div>
      <div style={fieldLabel}>Location</div>
      {/* THE ONE CITY DROPDOWN (19 Sep 2026) — the same control as everywhere else */}
      <CityPicker value={d.city.trim() || null} onChange={(c) => setD((x) => ({ ...x, city: c ?? "" }))} label="" />
      {!d.city.trim() ? <div style={{ fontSize: 10.5, color: "#EF4444", marginTop: 4 }}>Your city is required — it is where Discover and the rankings place you.</div> : null}
      {/* ⚠ no pin block (26 Sep 2026) — a person's row carries none; see the header */}
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
      {/* ⚠ NO BIO FIELD, AND NO COLUMN BEHIND IT (20 Sep 2026: "Remove bio from
          all profiles", then "about and bio for profiles need to go away").
          `profiles.about` and this door's `p_about` argument are both gone; the
          16 paragraphs that existed were copied out before the column dropped. */}
      {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 8 }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button type="button" onClick={onClose} style={sheetBtn(false)}>Cancel</button>
        <button type="button" disabled={pending || !d.city.trim()} onClick={save} style={sheetBtn(true)}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </Sheet>
    </Portal>
  );
}
