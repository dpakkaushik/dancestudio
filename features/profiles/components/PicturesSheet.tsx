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
import { PlusIcon, pictureChipPaint, Sheet, sheetBtn } from "./profile-kit";

/** THE TWO PICTURES, AND THE TWO CONTROLS THAT CHANGE THEM.
 *
 *  19 Sep 2026, the user: "edit seprate for profile pic and seprate for poster
 *  with multiple photos for all, when clicking on profile pic should open the
 *  profile pic. and same should be for individual poster picks when clicking on
 *  them." Then, 20 Sep: "Profile pic edit should just be a pencil besides and
 *  clciking on photo to view it not together in one. Similarly seprate for
 *  poster photos in profiles."
 *
 *  ⚠ THERE IS NO "YOUR PICTURES" SCREEN ANY MORE, and its removal is the second
 *  ask rather than a reversal of the first. The 19 Sep answer put both pictures
 *  on one screen that SHOWED them and edited neither, with a button per half —
 *  so looking at your own photo meant opening an editor and then opening a
 *  second one. Now each picture is its own control, where it actually is:
 *  pressing the disc opens the disc's picture, the pencil beside it opens the
 *  picker, pressing a poster opens that poster, and the rail's own pencil opens
 *  the grid. The in-between screen had no job left and is gone rather than left
 *  unreachable — a component nothing renders is a lie to the next reader.
 *
 *  The rules each half keeps are unchanged, and they are NOT the same rule:
 *  · the PROFILE PICTURE lands the moment it uploads, because changing it
 *    REPLACES rather than destroys and the result is visible at once;
 *  · the POSTERS are a DRAFT committed by Save, because ✕ on one of them is a
 *    deletion and Cancel has to be able to mean nothing happened (the 16 Sep
 *    destroy-on-cancel lesson, carried through every move since). */
/** THE PROFILE PICTURE, ALONE (19 Sep 2026) — it commits on upload, because
 *  replacing a picture is not destroying one. */
export function ProfilePictureSheet({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const isOrg = profile.role === "org";
  return (
    <Portal>
      <Sheet label={isOrg ? "Logo" : "Profile picture"} onClose={onClose} maxHeight="70vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>{isOrg ? "Logo" : "Profile picture"}</b>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>It changes as soon as you pick one.</div>
        <div style={{ marginTop: 14 }}>
          <PhotoPicker owner={{ kind: "avatar", id: profile.id }} hasPhoto={Boolean(profile.avatarPath)} label="Change your photo" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={sheetBtn(true)}>Done</button>
        </div>
      </Sheet>
    </Portal>
  );
}

/** THE POSTERS, ALONE (19 Sep 2026) — a DRAFT: nothing happens until Save, so
 *  Cancel throws the whole edit away and the pictures are where they were. */
export function HeaderPicturesSheet({
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
      <Sheet label="Posters" onClose={onClose} maxHeight="88vh">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Posters</b>
          {/* ⚠ THE CEILING, SAID OUT LOUD (20 Sep 2026). It used to live on the
              "Your pictures" screen, and taking that screen away took the only
              place a person could read how many they may hold — a rule nobody
              can see is a rule they meet as a refusal. */}
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: MUTED }}>
            {header.length} / {headerMax}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>
          Nothing changes until you press Save.{headerMax === 1 ? " The Artist plan makes it five." : ""}
        </div>
        <div style={{ marginTop: 12 }}>
          <HeaderPictures draft={draft} tiles={tiles} kind="person" canWrite addLabel="Add picture" onOpen={setLightbox} busy={pending} />
        </div>

        {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", marginTop: 8 }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={sheetBtn(false)}>Cancel</button>
          <button type="button" disabled={pending} onClick={save} style={sheetBtn(true)}>
            {pending ? "Saving…" : draft.dirty ? `Save · ${draft.changeCount} ${draft.changeCount === 1 ? "picture change" : "picture changes"}` : "Done"}
          </button>
        </div>
      </Sheet>
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

/** THE DISC ON HOME, AND THE TWO THINGS IT DOES — the `avatarSlot` a server page
 *  hands `IdentityHero`, so the picture is the control without the hero
 *  learning anything about pictures.
 *
 *  ⚠ IT KNOWS NOTHING ABOUT THE POSTERS (20 Sep 2026). It used to take `header`
 *  and `headerMax` and pass them to a screen that carried both halves; that
 *  screen is gone, the rail has its own pencil, and props nothing reads are a
 *  lie to the next reader — so they went with it. */
export function PicturesButton({
  profile,
  grad,
  avatar,
}: {
  profile: Profile;
  grad: [string, string];
  /** the disc's own picture, already resolved to a URL by the page */
  avatar: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  /* ⚠ TWO CONTROLS, TWO JOBS (20 Sep 2026, the user: "Profile pic edit should
     just be a pencil besides and clicking on photo to view it not together in
     one"). Pressing the picture OPENS THE PICTURE — which is what pressing a
     picture means everywhere else in this app and outside it — and the pencil
     beside it is the one way to change it. Until today the disc opened a screen
     that was both at once, so looking at your own photo meant reading an editor.
     A disc with NO picture has nothing to open, so it is not a button at all;
     the pencil is still there, which is how you put one there. */
  const disc = <ProfileDisc name={profile.fullName} grad={grad} photo={avatar} photoAlt={profile.fullName} testId="hero-disc" />;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {avatar ? (
        <button
          type="button"
          aria-label={`${profile.fullName} — profile picture`}
          onClick={() => setViewing(true)}
          style={{ display: "block", padding: 0, border: "none", background: "none", cursor: "pointer", lineHeight: 0, fontFamily: "inherit" }}
        >
          {disc}
        </button>
      ) : (
        disc
      )}
      <button
        type="button"
        aria-label="Change profile picture"
        onClick={() => setEditing(true)}
        style={{
          position: "absolute",
          right: -4,
          bottom: -4,
          width: 28,
          height: 28,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          /* the same paint the posters' ⊕ wears, three files over (22 Sep 2026) */
          ...pictureChipPaint,
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
        }}
      >
        <PlusIcon light />
      </button>
      {viewing && avatar ? (
        <PhotoLightbox
          shots={[{ key: "avatar", src: avatar, alt: `${profile.fullName} — profile picture`, signed: false }]}
          index={0}
          onIndex={() => {}}
          onClose={() => setViewing(false)}
          label={profile.fullName}
        />
      ) : null}
      {editing ? (
        <ProfilePictureSheet profile={profile} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}

/** THE PENCIL BESIDE THE POSTERS — the rail's own editor, handed to
 *  `IdentityHero` as `headerEdit` so pressing a poster can go on meaning
 *  "show me that poster" (20 Sep 2026). */
export function HeaderEditButton({
  profile,
  header = [],
  headerMax = 0,
}: {
  profile: Profile;
  header?: HeaderPhoto[];
  headerMax?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Edit posters"
        onClick={() => setOpen(true)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          ...pictureChipPaint,
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
        }}
      >
        <PlusIcon light />
      </button>
      {open ? (
        <HeaderPicturesSheet profile={profile} header={header} headerMax={headerMax} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** ⚠ A PLUS, NOT A PENCIL (20 Sep 2026, the user: "edit button for photos should
 *  be a plus sign how it is for instagram").
 *
 *  They are right about the gesture as well as the glyph. A pencil says "change
 *  the thing that is here", and on the DISC that is true — but on the posters
 *  rail the commonest act by a distance is ADDING one, and on an empty rail
 *  there is nothing to edit at all. Instagram's ⊕ on the avatar is the same
 *  reading. Both controls keep their accessible NAMES, so every locator and
 *  every screen reader still says what the button does rather than what it looks
 *  like — the glyph is decoration, the name is the control. */
/* the glyph itself moved into `profile-kit` on 21 Sep, when a crew's controls
   were about to declare it a third time; the reasoning above is still this
   control's, and is why the NAME rather than the glyph is what anything reads */
