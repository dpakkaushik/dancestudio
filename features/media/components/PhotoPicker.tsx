"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addMyGalleryPhotoAction, setCrewPhotoAction, setMyAvatarAction, setTenantPhotoAction, type PhotoActionResult } from "@/features/media/server-actions/photos";
import { addStudioProofPhotoAction } from "@/features/tenants/server-actions/studioVerification";
import { PHOTO_TYPES, photoPath, whyNotAPhoto, type PhotoOwner, MEDIA_BUCKET } from "@/lib/media/photo";
import { PROOF_BUCKET } from "@/lib/media/proof";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DOS_UI, INK, LINE, SUB } from "@/lib/design/tokens";
import { PhotoCropper, frameForOwnerKind } from "./PhotoCropper";

/** "📁 Browse device gallery" (prototype 3829) — the one control that changes a
 *  photo, wherever a photo is drawn.
 *
 *  The FILE goes straight from this browser to Storage with the person's own
 *  session, so a 5 MB image never travels through a server action and the
 *  path-scoped storage policy is what decides. Only the resulting PATH is sent
 *  to the server, where the RPC checks the same authority again.
 *
 *  EVERY PICTURE PASSES THROUGH THE CROPPER FIRST (18 Sep 2026, the user: "every
 *  photo uploaded in the app should have a way to crop and preview it according
 *  to the layout of the photo in the app"). The picked file opens `PhotoCropper`
 *  in the frame this owner's picture is drawn in — the squircle for a person's
 *  or a business's profile picture, a square for a crew's — and what goes up is
 *  the cropped JPEG. Until today a square was drawn with `object-fit: cover`,
 *  which chose the crop for you; now you choose it and see it before it lands.
 *
 *  Three shapes: the chip with its Remove (the Edit sheet), the ＋ on the rim of
 *  the profile disc (`overlay`), and the dashed square that ends a header rail
 *  (`tile`) — the prototype's "＋ Add" tile on the Photos rail (10979), the
 *  size of the square it sits in.
 *
 *  Five owners, two buckets (15 Sep 2026): a person's avatar, a business's
 *  picture, a crew's and a person's header pictures all go to the public
 *  `media` bucket; a STUDIO's header pictures are the photos it showed DanceOS,
 *  so they go into its owner's folder in the private proof bucket, through the
 *  same door the verification form uses. */

const bucketFor = (owner: PhotoOwner) => (owner.kind === "studioHeader" ? PROOF_BUCKET : MEDIA_BUCKET);

const setter = (owner: PhotoOwner, path: string | null): Promise<PhotoActionResult> => {
  switch (owner.kind) {
    case "avatar":
      return setMyAvatarAction({ path });
    case "tenant":
      return setTenantPhotoAction({ tenantId: owner.id, path });
    case "crew":
      return setCrewPhotoAction({ crewId: owner.id, path });
    case "gallery":
      return path ? addMyGalleryPhotoAction({ path }) : Promise.resolve({ error: "A header picture is removed from its own corner." });
    case "studioHeader":
      return path ? addStudioProofPhotoAction({ tenantId: owner.id, path }) : Promise.resolve({ error: "A header picture is removed from its own corner." });
  }
};

export function PhotoPicker({
  owner,
  hasPhoto,
  label = "Change photo",
  onLight = false,
  overlay = false,
  tile = false,
  compact = false,
  cropLabel,
  onSaved,
}: {
  owner: PhotoOwner;
  hasPhoto: boolean;
  label?: string;
  /** drawn on the entity's own colour rather than on the page */
  onLight?: boolean;
  /** the ＋ on the rim of the profile disc (prototype 10600) — one round
   *  control, absolutely placed inside a relative parent; errors show as a toast */
  overlay?: boolean;
  /** the whole square as a dashed "＋ Add" tile — fills its relative parent;
   *  `label` is what it says and what it is called */
  tile?: boolean;
  /** a tile in a 72px grid rather than the 206 hero square — the ＋ and the
   *  word sized to fit it (the Edit-profile sheet's header grid) */
  compact?: boolean;
  /** what the cropper's sheet is headed — "Logo" for an organization's picture;
   *  the owner kind's own word when not given */
  cropLabel?: string;
  /** ONBOARDING'S CASE (U2): the page it sits on redirects the moment a profile
   *  exists, so a refresh there would end the flow. A caller that passes this
   *  is told the path instead of the page being reloaded. */
  onSaved?: (path: string | null) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* the picked file, waiting in the cropper for its crop — the upload starts only
     on "Use this photo" */
  const [cropping, setCropping] = useState<File | null>(null);

  const pick = (file: File) => {
    const bad = whyNotAPhoto(file);
    if (bad) {
      setError(bad);
      return;
    }
    setError(null);
    setCropping(file);
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const bucket = bucketFor(owner);
      const path = photoPath(owner, file);
      const up = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) {
        setError(up.error.message);
        return;
      }
      const out = await setter(owner, path);
      if (out.error) {
        /* the row would not take it, so the orphan file goes back out — the
           storage policy allows exactly this person to delete exactly this path */
        await supabase.storage.from(bucket).remove([path]);
        setError(out.error);
        return;
      }
      if (onSaved) onSaved(path);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    const out = await setter(owner, null);
    setBusy(false);
    if (out.error) {
      setError(out.error);
      return;
    }
    if (onSaved) onSaved(null);
    else router.refresh();
  };

  const input = (aria: string) => (
    <input
      ref={fileRef}
      type="file"
      accept={PHOTO_TYPES.join(",")}
      aria-label={aria}
      disabled={busy}
      style={{ display: "none" }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void pick(f);
      }}
    />
  );

  /* THE CROPPER, IN EVERY SHAPE THIS CONTROL TAKES. It is rendered by all three
     returns below — the first cut hung it on the hero shapes' toast alone, and
     the chip (onboarding, the Edit sheets' disc) set `cropping` and drew nothing,
     which the e2e found within the hour: every onboarding sat on "Add a photo"
     waiting for a dialog that never mounted. */
  const cropper = cropping ? (
    <PhotoCropper
      files={[cropping]}
      frame={frameForOwnerKind(owner.kind)}
      label={cropLabel ?? (owner.kind === "crew" ? "Crew photo" : owner.kind === "tenant" ? "Profile picture" : "Profile photo")}
      onCancel={() => setCropping(null)}
      onDone={([f]) => {
        setCropping(null);
        if (f) void upload(f);
      }}
    />
  ) : null;

  /* the hero's controls sit inside a clipped square, so their error is a toast */
  const toast = (
    <>
      {error ? (
        <span role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: "1.5px solid #F87171", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 390, textAlign: "center", zIndex: 650, fontFamily: DOS_UI }}>
          {error}
        </span>
      ) : null}
      {cropper}
    </>
  );

  if (tile) {
    return (
      <>
        <label
          aria-disabled={busy}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: compact ? 3 : 8,
            cursor: busy ? "default" : "pointer",
            background: "rgba(0,0,0,.28)",
            border: "1.5px dashed rgba(255,255,255,.6)",
            color: "#fff",
            boxSizing: "border-box",
            fontFamily: DOS_UI,
            opacity: busy ? 0.7 : 1,
            padding: compact ? 4 : 0,
            textAlign: "center",
          }}
        >
          <span aria-hidden="true" style={{ fontSize: compact ? 22 : 40, lineHeight: 1, fontWeight: 300 }}>
            {busy ? "…" : "＋"}
          </span>
          <span style={{ fontSize: compact ? 8.5 : 10.5, fontWeight: 800, letterSpacing: compact ? 0.5 : 1.2, textTransform: "uppercase", lineHeight: 1.2 }}>{busy ? "Uploading" : label}</span>
          {input(label)}
        </label>
        {toast}
      </>
    );
  }

  if (overlay) {
    return (
      <>
        <label
          aria-disabled={busy}
          style={{ position: "absolute", bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, background: "rgba(0,0,0,.72)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", fontSize: 14, border: "1.5px solid rgba(255,255,255,.45)", opacity: busy ? 0.6 : 1, zIndex: 2 }}
        >
          {busy ? "…" : "＋"}
          {input(hasPhoto ? label : "Add a photo")}
        </label>
        {toast}
      </>
    );
  }

  const chip: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 999,
    cursor: busy ? "default" : "pointer",
    fontSize: 10.5,
    fontWeight: 800,
    fontFamily: DOS_UI,
    border: `1.5px solid ${onLight ? "rgba(255,255,255,.5)" : LINE}`,
    background: onLight ? "rgba(255,255,255,.2)" : "var(--card)",
    color: onLight ? "#fff" : INK,
    opacity: busy ? 0.6 : 1,
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <label style={chip} aria-disabled={busy}>
          {busy ? "Uploading…" : hasPhoto ? label : "📁 Add a photo"}
          {input(hasPhoto ? label : "Add a photo")}
        </label>
        {hasPhoto ? (
          <button type="button" disabled={busy} aria-label="Remove the photo" onClick={() => void clear()} style={{ ...chip, cursor: busy ? "default" : "pointer" }}>
            Remove
          </button>
        ) : null}
      </span>
      {error ? <span style={{ fontSize: 10, color: "#F87171", maxWidth: 260, lineHeight: 1.4 }}>{error}</span> : null}
      {!error && !hasPhoto ? <span style={{ fontSize: 9.5, color: onLight ? "rgba(255,255,255,.75)" : SUB }}>JPEG, PNG or WebP · up to 5 MB</span> : null}
      {cropper}
    </span>
  );
}
