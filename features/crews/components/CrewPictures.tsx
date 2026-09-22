"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Portal } from "@/components/ui/Portal";
import { commitHeaderDraft, commitWords, crewPorts } from "@/features/media/commitHeaderDraft";
import { HeaderPictures, headerTiles } from "@/features/media/components/HeaderPictures";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { PhotoPicker } from "@/features/media/components/PhotoPicker";
import { useHeaderDraft } from "@/features/media/headerDraft";
import { ProfileDisc } from "@/features/profiles/components/HeroRail";
import { PlusIcon, pictureChipPaint, Sheet, sheetBtn } from "@/features/profiles/components/profile-kit";
import { SUB } from "@/lib/design/tokens";
import { HEADER_MAX_CREW } from "@/lib/media/photo";
import type { HeaderPhoto } from "@/repositories/headerPhotos";

/** A CREW'S TWO PICTURES, WHERE EVERY OTHER PROFILE'S ARE (21 Sep 2026).
 *
 *  The user: *"make sure all profile types have similar ways to edit the
 *  profile, the segments like social media, dance styles, pictures and
 *  posters."*
 *
 *  ⚠ A CREW WAS THE LAST ONE STILL DOING IT THE OLD WAY — which is the exact
 *  shape the same user had removed from a STUDIO on 20 Sep ("edit profile for
 *  studio not consistent with how its done for Artist and users"). Since then:
 *
 *    · a user, an artist and a studio change their picture with the ⊕ on the
 *      disc on their own home, and their posters with the ⊕ on the rail;
 *    · a CREW had both inside `CrewEditSheet`, behind a pencil, as two fields
 *      called "Update photo" and "Update header" between Name and City.
 *
 *  So this file is `StudioPictures.tsx` with a crew's doors — which is the
 *  point: three kinds of profile now draw the same two controls from the same
 *  kit, and the fourth difference between them is only which RPC they call.
 *
 *  ⚠ THE TWO HALVES KEEP THE RULES THEY ALREADY HAD, and they are the rules
 *  16 Sep 2026 wrote after a Cancel destroyed four of a studio's pictures:
 *   · the DISC commits on upload, because replacing is not destroying;
 *   · the POSTERS are a DRAFT committed by Save, so Cancel costs nothing —
 *     `useHeaderDraft` does no network work at all until then.
 *
 *  ⚠ AND A CREW'S FLOOR IS ZERO, not one. A studio's posters are the photos it
 *  showed DanceOS for its badge and the database refuses the last one; a crew
 *  has no such rule and may hold none, so the sheet must not pretend otherwise.
 *  Five at most — "Artist and Crews 5" (R26). */

/** the disc's own editor — one picker, landing as soon as a picture is chosen */
export function CrewPictureSheet({ crewId, crewName, hasPhoto, onClose }: { crewId: string; crewName: string; hasPhoto: boolean; onClose: () => void }) {
  return (
    <Portal>
      <Sheet label="Profile picture" onClose={onClose} maxHeight="70vh">
        <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Profile picture</b>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>{crewName} — it changes as soon as you pick one.</div>
        <div style={{ marginTop: 14 }}>
          {/* the LEADER's alone, which is what the storage policy on `crews/{id}`
              admits and what `set_crew_photo` re-checks */}
          <PhotoPicker owner={{ kind: "crew", id: crewId }} hasPhoto={hasPhoto} label="Change the crew photo" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={sheetBtn(true)}>Done</button>
        </div>
      </Sheet>
    </Portal>
  );
}

/** the posters, as a draft — nothing happens until Save */
export function CrewPostersSheet({ crewId, crewName, photos = [], onClose }: { crewId: string; crewName: string; photos?: HeaderPhoto[]; onClose: () => void }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const draft = useHeaderDraft({
    initial: photos.map((p) => ({ id: p.id, path: p.path, url: p.url, signed: p.signed })),
    min: 0,
    max: HEADER_MAX_CREW,
  });
  const tiles = headerTiles(draft, crewName);

  const save = () => {
    if (!draft.dirty) return onClose();
    start(async () => {
      setErr(null);
      const result = await commitHeaderDraft(draft.items, crewPorts(crewId));
      draft.applyCommit(result);
      if (result.failures.length > 0) {
        setErr(commitWords(result, draft.changeCount));
        router.refresh();
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <Portal>
      {/* ⚠ "Posters" and "Edit posters", the same words a person's and a studio's
          carry — consistency is the ask, and a control that does the same job
          under a different name is the thing being fixed */}
      <Sheet label="Posters" onClose={onClose} maxHeight="86vh">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <b style={{ fontSize: 16.5, letterSpacing: -0.2 }}>Posters</b>
          <span style={{ fontSize: 11, color: SUB, marginLeft: "auto" }}>
            {draft.liveCount} / {HEADER_MAX_CREW}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: SUB, marginTop: 3 }}>
          The pictures that swipe across the crew&apos;s page. Nothing changes until you press Save.
        </div>
        <div style={{ marginTop: 12 }}>
          <HeaderPictures draft={draft} tiles={tiles} kind="crew" canWrite addLabel="Add a picture" onOpen={setLightbox} busy={pending} />
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
        <PhotoLightbox shots={tiles.map((t) => ({ key: t.key, src: t.url, alt: t.alt, signed: t.signed }))} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} label={crewName} />
      ) : null}
    </Portal>
  );
}

/** THE DISC ON A CREW'S HOME — the `avatarSlot` the page hands `IdentityHero`.
 *  Pressing it opens the picture; the ⊕ on its corner changes it.
 *  ⚠ Only the LEADER gets the ⊕: a member may look at the crew's pictures and
 *  not write them, and a control that exists only to be refused is noise. */
export function CrewPicturesButton({ crewId, crewName, grad, avatar, canEdit }: { crewId: string; crewName: string; grad: [string, string]; avatar: string | null; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState(false);
  const disc = <ProfileDisc name={crewName} grad={grad} photo={avatar} photoAlt={crewName} testId="hero-disc" />;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {avatar ? (
        <button
          type="button"
          aria-label={`${crewName} — crew photo`}
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
        <PhotoLightbox shots={[{ key: "avatar", src: avatar, alt: `${crewName} — crew photo`, signed: false }]} index={0} onIndex={() => {}} onClose={() => setViewing(false)} label={crewName} />
      ) : null}
      {editing ? <CrewPictureSheet crewId={crewId} crewName={crewName} hasPhoto={Boolean(avatar)} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

/** THE ⊕ ON THE POSTERS RAIL — the `headerEdit` slot, drawn bottom-right of the
 *  rail so it reads as a pair with the disc's own. Leader only, same reason. */
export function CrewPostersButton({ crewId, crewName, photos }: { crewId: string; crewName: string; photos: HeaderPhoto[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* the same chip every ⊕ in the app wears — `pictureChipPaint`, one
          declaration since 22 Sep 2026 */}
      <button
        type="button"
        aria-label="Edit posters"
        onClick={() => setOpen(true)}
        style={{ width: 32, height: 32, borderRadius: 999, display: "grid", placeItems: "center", ...pictureChipPaint, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
      >
        <PlusIcon light />
      </button>
      {open ? <CrewPostersSheet crewId={crewId} crewName={crewName} photos={photos} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
