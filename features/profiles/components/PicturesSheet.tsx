"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { commitHeaderDraft, commitWords, personPorts } from "@/features/media/commitHeaderDraft";
import { HeaderPictures, headerTiles } from "@/features/media/components/HeaderPictures";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { useHeaderDraft } from "@/features/media/headerDraft";
import { DOS_DISPLAY, MUTED, SUB } from "@/lib/design/tokens";
import type { HeaderPhoto } from "@/repositories/headerPhotos";
import type { Profile } from "@/types/profile";
import { ProfileDisc } from "./HeroRail";
import { Sheet, fieldLabel, sheetBtn } from "./profile-kit";

/** YOUR PICTURES — TWO SECTIONS, TWO EDITORS, AND EACH PICTURE OPENS ITSELF
 *  (19 Sep 2026, the user: "edit seprate for profile pic and seprate for poster
 *  with multiple photos for all, when clicking on profile pic should open the
 *  profile pic. and same should be for individual poster picks when clicking on
 *  them").
 *
 *  ⚠ WHAT CHANGED, AND WHY IT IS NOT A REVERSAL. Since earlier the same day the
 *  disc opened ONE sheet carrying both sections — the profile picture with its
 *  picker and the header grid with its draft. The ask now splits that in two and
 *  puts VIEWING first: pressing a picture shows you the picture, and changing it
 *  is a deliberate second step behind its own button. So the disc opens this
 *  screen, which is the two pictures as pictures; "Change profile picture" opens
 *  the picker alone, and "Edit posters" opens the grid alone.
 *
 *  The rules each half keeps are unchanged, and they are NOT the same rule:
 *  · the PROFILE PICTURE lands the moment it uploads, because changing it
 *    REPLACES rather than destroys and the result is visible at once;
 *  · the POSTERS are a DRAFT committed by Save, because ✕ on one of them is a
 *    deletion and Cancel has to be able to mean nothing happened (the 16 Sep
 *    destroy-on-cancel lesson, carried through every move since). */
export function PicturesSheet({
  profile,
  header = [],
  headerMax = 0,
  avatar,
  grad,
  onClose,
}: {
  profile: Profile;
  header?: HeaderPhoto[];
  headerMax?: number;
  /** the disc's own picture, already resolved to a URL by the page */
  avatar?: string | null;
  grad: [string, string];
  onClose: () => void;
}) {
  const isOrg = profile.role === "org";
  /** which half is being EDITED — null means we are looking, not changing */
  const [editing, setEditing] = useState<null | "avatar" | "posters">(null);
  /** which poster is open full size; -1 is the profile picture itself */
  const [lightbox, setLightbox] = useState<number | null>(null);

  /* a signed URL can be past its half hour, so a poster with no readable URL is
     left out rather than drawn as a broken tile */
  const shots = header
    .filter((h): h is HeaderPhoto & { url: string } => Boolean(h.url))
    .map((h) => ({ key: h.id, src: h.url, alt: `${profile.fullName} — poster`, signed: Boolean(h.signed) }));
  const avatarWord = isOrg ? "Logo" : "Profile picture";

  if (editing === "avatar") return <ProfilePictureSheet profile={profile} onClose={() => setEditing(null)} />;
  if (editing === "posters") return <HeaderPicturesSheet profile={profile} header={header} headerMax={headerMax} onClose={() => setEditing(null)} />;

  return (
    <Portal>
      <Sheet label="Your pictures" onClose={onClose} maxHeight="88vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Your pictures</b>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>Tap a picture to see it full size. Each one is changed on its own.</div>

        {/* ── THE PROFILE PICTURE: pressing it opens the picture (the ask), and
            the button under it is the only way to change it ── */}
        <div style={fieldLabel}>{avatarWord}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            type="button"
            aria-label={`Open ${avatarWord.toLowerCase()}`}
            onClick={() => setLightbox(-1)}
            style={{ padding: 0, border: "none", background: "none", cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}
          >
            <ProfileDisc name={profile.fullName} grad={grad} photo={avatar ?? null} photoAlt={profile.fullName} />
          </button>
          <button type="button" onClick={() => setEditing("avatar")} style={{ ...sheetBtn(false), width: "auto", paddingInline: 16 }}>
            Change {avatarWord.toLowerCase()}
          </button>
        </div>

        {/* ── THE POSTERS: one tile each, each opening ITSELF ── */}
        {headerMax > 0 ? (
          <>
            <div style={{ ...fieldLabel, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span>Posters</span>
              <span style={{ letterSpacing: 0, fontWeight: 700, color: MUTED }}>{header.length} / {headerMax}</span>
            </div>
            {header.length ? (
              <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
                {shots.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    aria-label={`Open poster ${i + 1}`}
                    onClick={() => setLightbox(i)}
                    style={{ position: "relative", flexShrink: 0, width: 84, height: 84, borderRadius: 18, overflow: "hidden", border: "none", padding: 0, cursor: "pointer", background: `linear-gradient(135deg,${grad[0]},${grad[1]})`, color: "#fff", fontFamily: DOS_DISPLAY }}
                  >
                    <Image src={s.src} alt="" fill sizes="84px" style={{ objectFit: "cover" }} unoptimized={Boolean(s.signed)} />
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: SUB, fontWeight: 700 }}>No posters yet.</div>
            )}
            <button type="button" onClick={() => setEditing("posters")} style={{ ...sheetBtn(false), width: "auto", paddingInline: 16, marginTop: 10 }}>
              Edit posters
            </button>
            {headerMax === 1 ? <div style={{ fontSize: 10.5, color: SUB, marginTop: 8 }}>The Artist plan makes it five.</div> : null}
          </>
        ) : (
          <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.5 }}>Posters come with the Artist plan.</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={sheetBtn(true)}>Done</button>
        </div>
      </Sheet>
      {/* a SIBLING of the sheet — see PhotoLightbox's header for why */}
      {lightbox !== null ? (
        <PhotoLightbox
          shots={
            lightbox === -1
              ? [{ key: "avatar", src: avatar ?? "", alt: `${profile.fullName} — ${avatarWord.toLowerCase()}`, signed: false }]
              : shots
          }
          index={lightbox === -1 ? 0 : lightbox}
          onIndex={(i) => setLightbox(lightbox === -1 ? -1 : i)}
          onClose={() => setLightbox(null)}
          label={profile.fullName}
        />
      ) : null}
    </Portal>
  );
}

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
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Posters</b>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>Nothing changes until you press Save.</div>
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

/** THE DISC ON HOME, AND THE SCREEN BEHIND IT — the `avatarSlot` a server page
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
      {open ? (
        <PicturesSheet profile={profile} header={header} headerMax={headerMax} avatar={avatar} grad={grad} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
