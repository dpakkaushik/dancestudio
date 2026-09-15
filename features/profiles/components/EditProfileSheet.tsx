"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { updateMyProfileAction } from "@/features/profiles/server-actions/profile";
import { LINE, MUTED } from "@/lib/design/tokens";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { Profile } from "@/types/profile";
import { HeaderRemove } from "./HeaderRemove";
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
  /** one for a user, ten for an artist, none for an organization */
  headerMax?: number;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isOrg = profile.role === "org";
  const [d, setD] = useState({ fullName: profile.fullName, city: profile.city ?? "", age: profile.age, about: profile.about ?? "", phone: profile.phone ?? "" });
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
      const out = await updateMyProfileAction({
        fullName: d.fullName,
        city: d.city.trim(),
        age: isOrg ? null : d.age,
        about: d.about.trim() || null,
        socials: profile.socials,
        styles: profile.styles,
        phone: d.phone.trim() || null,
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
    <Sheet label="Edit profile" onClose={onClose} maxHeight="88vh">
      <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Edit profile</b>
      <div style={fieldLabel}>Name</div>
      <input aria-label="Name" value={d.fullName} onChange={(e) => setD((x) => ({ ...x, fullName: e.target.value }))} style={fieldInput} />
      {/* the number is the person's to publish and theirs to take down: an
          empty box saves null, and the line under the box says so rather
          than making them guess (N8 — Call, S_profiletab 10879) */}
      <div style={fieldLabel}>Mobile</div>
      <input aria-label="Phone" type="tel" inputMode="tel" value={d.phone} onChange={(e) => setD((x) => ({ ...x, phone: e.target.value }))} placeholder="+91 98765 43210" style={fieldInput} />
      <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>Shown on your public page as Call. Leave it empty and nobody sees a number.</div>
      <div style={fieldLabel}>{isOrg ? "Logo" : "Profile picture"}</div>
      <PhotoPicker owner={{ kind: "avatar", id: profile.id }} hasPhoto={Boolean(profile.avatarPath)} label="Change your photo" />
      {/* THE HEADER PICTURES (15 Sep 2026): an artist has no verification
          step, so this sheet is where theirs are added — up to ten; a user
          has one. Each lands the moment it uploads and the page re-reads;
          the ✕ takes one out again. */}
      {headerMax > 0 ? (
        <>
          <div style={fieldLabel}>Header pictures</div>
          <div style={{ fontSize: 10.5, color: MUTED, marginBottom: 8, lineHeight: 1.45 }}>
            {headerMax === 1 ? "One picture across the top of your page. The Artist plan makes it ten." : `Up to ${headerMax}, swiped across the top of your page in this order.`}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 7 }}>
            {header.map((h, i) => (
              <div key={h.id} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 11, overflow: "hidden", background: "var(--el)", border: `1px solid ${LINE}` }}>
                {h.url ? <Image src={h.url} alt={`Header picture ${i + 1}`} fill sizes="90px" style={{ objectFit: "cover" }} /> : null}
                <HeaderRemove target={{ kind: "person", id: h.id }} path={h.path} />
              </div>
            ))}
            {header.length < headerMax ? (
              <div style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 11, overflow: "hidden", background: "var(--el)" }}>
                <PhotoPicker owner={{ kind: "gallery", id: profile.id }} hasPhoto={false} label="Add picture" tile compact />
              </div>
            ) : null}
          </div>
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
        <button type="button" disabled={pending || !d.city.trim()} onClick={save} style={sheetBtn(true)}>{pending ? "Saving…" : "Save"}</button>
      </div>
    </Sheet>
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
