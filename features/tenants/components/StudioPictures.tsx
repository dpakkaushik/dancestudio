"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { commitHeaderDraft, commitWords, studioPorts } from "@/features/media/commitHeaderDraft";
import { HeaderPictures, headerTiles } from "@/features/media/components/HeaderPictures";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { useHeaderDraft } from "@/features/media/headerDraft";
import { ProfileDisc } from "@/features/profiles/components/HeroRail";
import { PlusIcon, pictureChipPaint, Sheet, sheetBtn } from "@/features/profiles/components/profile-kit";
import { MUTED, SUB } from "@/lib/design/tokens";
import { PROOF_MAX, type ProofPhoto } from "@/lib/media/proof";

/** A STUDIO'S TWO PICTURES, WHERE A PERSON'S ARE (20 Sep 2026).
 *
 *  The user: *"edit profile for studio not consistent with how its done for
 *  Artist and users. for social media links, photos etc."* They are right, and
 *  the difference was total rather than cosmetic:
 *
 *    · a USER or an ARTIST changes their picture with the ⊕ on the disc on HOME
 *      and their posters with the ⊕ on the rail, and `Settings → Edit profile`
 *      holds only words — name, mobile, email, location, date of birth;
 *    · a STUDIO had every one of those things in ONE sheet behind a pencil.
 *
 *  So the same two controls, in the same two places, doing the same two things —
 *  this file is `PicturesSheet.tsx` with a studio's doors instead of a person's.
 *
 *  ⚠ THE TWO HALVES KEEP THEIR DIFFERENT RULES, and they are the same rules they
 *  have kept since 16 Sep 2026:
 *   · the DISC commits the moment a picture uploads, because replacing a picture
 *     REPLACES rather than destroys and the result is on screen at once;
 *   · the POSTERS are a DRAFT committed by Save, because ✕ on one of them is a
 *     DELETION — and this is the very screen where a Cancel once destroyed four
 *     of a studio's pictures. `useHeaderDraft` makes Cancel free by doing no
 *     network work at all until Save; `commitHeaderDraft` keeps the remove-then-
 *     add ordering that holds at both the floor and the ceiling.
 *
 *  ⚠ AND THE FLOOR IS ONE, NOT ZERO. A studio's posters ARE the photos it showed
 *  DanceOS for its badge, and `remove_studio_photo` refuses the last one — so
 *  `min: 1` here is the database's rule said on the screen rather than a press
 *  that can only be refused. A person's floor is 0 and theirs says so. */

/** the disc's own editor — one picker, and it lands as soon as you choose */
export function StudioPictureSheet({ tenantId, tenantName, hasPhoto, onClose }: { tenantId: string; tenantName: string; hasPhoto: boolean; onClose: () => void }) {
  return (
    <Portal>
      <Sheet label="Profile picture" onClose={onClose} maxHeight="70vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Profile picture</b>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>{tenantName} — it changes as soon as you pick one.</div>
        <div style={{ marginTop: 14 }}>
          {/* the owner OR a trainer, which is the pair the storage policy on
              `tenants/{id}` admits and `set_business_profile_photo` re-checks */}
          <PhotoPicker owner={{ kind: "tenant", id: tenantId }} hasPhoto={hasPhoto} label="Change the photo" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={sheetBtn(true)}>Done</button>
        </div>
      </Sheet>
    </Portal>
  );
}

/** the posters, as a draft — nothing happens until Save */
export function StudioPostersSheet({
  tenantId,
  tenantName,
  ownerId,
  photos = [],
  onClose,
}: {
  tenantId: string;
  tenantName: string;
  /** the OWNER's id — the folder in the private bucket a new picture goes into */
  ownerId: string;
  photos?: ProofPhoto[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const draft = useHeaderDraft({
    initial: photos.map((p) => ({ id: p.id, path: p.path, url: p.url, signed: true })),
    min: 1,
    max: PROOF_MAX,
  });
  const tiles = headerTiles(draft, tenantName);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const save = () => {
    start(async () => {
      setErr(null);
      if (draft.dirty) {
        const result = await commitHeaderDraft(draft.items, studioPorts(tenantId, ownerId));
        draft.applyCommit(result);
        if (result.failures.length > 0) {
          /* the sheet STAYS OPEN wearing the database's own sentence, and Save
             again retries only what is left — `applyCommit` has folded in
             whatever landed, so nothing is uploaded or removed twice */
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
          {/* the ceiling, said where it can be read rather than met as a refusal */}
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: MUTED }}>
            {photos.length} / {PROOF_MAX}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>
          Photos of your space — the same ones DanceOS checked. Nothing changes until you press Save, and one always stays.
        </div>
        <div style={{ marginTop: 12 }}>
          <HeaderPictures draft={draft} tiles={tiles} kind="studio" canWrite addLabel="Add photos of your space" onOpen={setLightbox} busy={pending} />
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
          label={tenantName}
        />
      ) : null}
    </Portal>
  );
}

/** THE DISC ON A STUDIO'S HOME — the `avatarSlot` the page hands `IdentityHero`,
 *  so the picture is the control without the hero learning anything about
 *  pictures. Pressing it OPENS the picture; the ⊕ beside it changes it.
 *
 *  ⚠ FOR SOMEBODY WHO MAY NOT CHANGE IT, THE ⊕ IS NOT DRAWN AT ALL — a trainer
 *  may look at a studio's pictures and not write them, and a control that exists
 *  only to be refused is noise. The picture still opens for them. */
export function StudioPicturesButton({
  tenantId,
  tenantName,
  grad,
  avatar,
  canEdit,
}: {
  tenantId: string;
  tenantName: string;
  grad: [string, string];
  avatar: string | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const disc = <ProfileDisc name={tenantName} grad={grad} photo={avatar} photoAlt={tenantName} testId="hero-disc" />;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {avatar ? (
        <button
          type="button"
          aria-label={`${tenantName} — profile picture`}
          onClick={() => setViewing(true)}
          style={{ display: "block", padding: 0, border: "none", background: "none", cursor: "pointer", lineHeight: 0, fontFamily: "inherit" }}
        >
          {disc}
        </button>
      ) : (
        disc
      )}
      {canEdit ? (
        <button
          type="button"
          aria-label="Change profile picture"
          onClick={() => setEditing(true)}
          style={{ position: "absolute", right: -4, bottom: -4, width: 28, height: 28, borderRadius: 999, display: "grid", placeItems: "center", ...pictureChipPaint, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
        >
          <PlusIcon light />
        </button>
      ) : null}
      {viewing && avatar ? (
        <PhotoLightbox
          shots={[{ key: "avatar", src: avatar, alt: `${tenantName} — profile picture`, signed: false }]}
          index={0}
          onIndex={() => {}}
          onClose={() => setViewing(false)}
          label={tenantName}
        />
      ) : null}
      {editing ? <StudioPictureSheet tenantId={tenantId} tenantName={tenantName} hasPhoto={Boolean(avatar)} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

/** the ⊕ at the posters rail's corner — the owner's alone, because a new picture
 *  goes into the OWNER's folder in the private bucket and nobody else may write
 *  there */
export function StudioPostersButton({ tenantId, tenantName, ownerId, photos = [] }: { tenantId: string; tenantName: string; ownerId: string; photos?: ProofPhoto[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Edit posters"
        onClick={() => setOpen(true)}
        style={{ width: 32, height: 32, borderRadius: 999, display: "grid", placeItems: "center", ...pictureChipPaint, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
      >
        <PlusIcon light />
      </button>
      {open ? <StudioPostersSheet tenantId={tenantId} tenantName={tenantName} ownerId={ownerId} photos={photos} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/* the ⊕ moved into `profile-kit` on 21 Sep, when a crew's controls were about to
   declare it a third time */
