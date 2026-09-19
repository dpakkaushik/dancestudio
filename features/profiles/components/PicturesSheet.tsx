"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { commitHeaderDraft, commitWords, personPorts } from "@/features/media/commitHeaderDraft";
import { HeaderPictures, headerTiles } from "@/features/media/components/HeaderPictures";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { useHeaderDraft } from "@/features/media/headerDraft";
import { MUTED, SUB } from "@/lib/design/tokens";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { Profile } from "@/types/profile";
import { ProfileDisc } from "./HeroRail";
import { Sheet, fieldLabel, sheetBtn } from "./profile-kit";

/** YOUR PICTURES — BOTH SECTIONS, BEHIND THE DISC ON HOME (19 Sep 2026, the
 *  user: "Profile Pic and Top bar Photo column only editable from home tab and
 *  should be removed from edit profile. should be able to click and view both
 *  pictures sections when clicking on that photo").
 *
 *  So the disc on Home is no longer a door to the public page — it is the door
 *  to the pictures, and the eye in the corner is the public page (the pencil
 *  that stood there went into Settings the same day). One screen carries both:
 *  the profile picture with its own picker, and the header grid with the draft
 *  the Edit sheet used to hold — adding and removing still wait for Save, so
 *  Cancel means what it says (the 16 Sep lesson, moved rather than re-learnt).
 *
 *  Tapping a header tile opens the LIGHTBOX, which is the "view" half of the
 *  ask: the pictures are looked at here as well as changed here. */
export function PicturesSheet({
  profile,
  header = [],
  headerMax = 0,
  onClose,
}: {
  profile: Profile;
  header?: HeaderPhoto[];
  headerMax?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const isOrg = profile.role === "org";
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* a person's floor is 0, not 1: `remove_my_header_photo` has no minimum guard,
     and inventing one here would be a rule nobody wrote */
  const draft = useHeaderDraft({
    initial: header.map((h) => ({ id: h.id, path: h.path, url: h.url, signed: h.signed })),
    min: 0,
    max: headerMax,
  });
  const tiles = headerTiles(draft, profile.fullName);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const save = () => {
    start(async () => {
      setErr(null);
      if (headerMax > 0 && draft.dirty) {
        const result = await commitHeaderDraft(draft.items, personPorts(profile.id, headerMax));
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
      <Sheet label="Your pictures" onClose={onClose} maxHeight="88vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Your pictures</b>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>The two pictures your profile is made of. Tap a header picture to see it full size.</div>

        {/* ── THE PROFILE PICTURE — it lands the moment it uploads, because
            changing it REPLACES rather than destroys and the result is visible
            at once (the 16 Sep rule, unchanged) ── */}
        <div style={fieldLabel}>{isOrg ? "Logo" : "Profile picture"}</div>
        <PhotoPicker owner={{ kind: "avatar", id: profile.id }} hasPhoto={Boolean(profile.avatarPath)} label="Change your photo" />

        {/* ── THE HEADER PICTURES — a DRAFT: nothing happens until Save ── */}
        {headerMax > 0 ? (
          <>
            <div style={fieldLabel}>Header pictures</div>
            {headerMax === 1 ? <div style={{ fontSize: 10.5, color: SUB, marginBottom: 8 }}>The Artist plan makes it five.</div> : null}
            <HeaderPictures draft={draft} tiles={tiles} kind="person" canWrite addLabel="Add picture" onOpen={setLightbox} busy={pending} />
          </>
        ) : (
          <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>Header pictures come with the Artist plan.</div>
        )}

        {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 8 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={sheetBtn(false)}>Cancel</button>
          <button type="button" disabled={pending} onClick={save} style={sheetBtn(true)}>
            {pending ? "Saving…" : draft.dirty ? `Save · ${draft.changeCount} ${draft.changeCount === 1 ? "picture change" : "picture changes"}` : "Done"}
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

/** THE DISC ON HOME, AND THE SHEET BEHIND IT — the `avatarSlot` a server page
 *  hands `IdentityHero`, so the picture is the control without the hero
 *  learning anything about pictures. */
export function PicturesButton({
  profile,
  header = [],
  headerMax = 0,
  grad,
  avatar,
}: {
  profile: Profile;
  header?: HeaderPhoto[];
  headerMax?: number;
  grad: [string, string];
  /** the disc's own picture, already resolved to a URL by the page */
  avatar: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Your pictures"
        onClick={() => setOpen(true)}
        style={{ display: "block", flexShrink: 0, padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <ProfileDisc name={profile.fullName} grad={grad} photo={avatar} photoAlt={profile.fullName} testId="hero-disc" />
      </button>
      {open ? <PicturesSheet profile={profile} header={header} headerMax={headerMax} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
