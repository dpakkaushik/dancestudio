"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { CityPicker } from "@/features/geo/components/CityPicker";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import { MUTED } from "@/lib/design/tokens";
import type { Profile } from "@/types/profile";
import { Sheet, fieldInput, fieldLabel, sheetBtn } from "./profile-kit";

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
  isArtist = false,
  onClose,
  onSaved,
}: {
  profile: Profile;
  /** the plan's word — an artist's page can dial their number, so an artist gets the switch */
  isArtist?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isOrg = profile.role === "org";
  const [d, setD] = useState({ fullName: profile.fullName, city: profile.city ?? "", age: profile.age, dob: profile.dob ?? "", phone: profile.phone ?? "", email: profile.contactEmail ?? "", phonePublic: profile.phonePublic });
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
      {/* ⚠ NO PICTURES IN THIS SHEET (19 Sep 2026) — both sections live behind
          the disc on Home, which is the one place they are changed */}
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
