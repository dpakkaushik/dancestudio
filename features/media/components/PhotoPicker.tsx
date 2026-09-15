"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addMyGalleryPhotoAction, setCrewPhotoAction, setMyAvatarAction, setTenantPhotoAction } from "@/features/media/server-actions/photos";
import { PHOTO_TYPES, photoPath, whyNotAPhoto, type PhotoOwner, MEDIA_BUCKET } from "@/lib/media/photo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DOS_UI, INK, LINE, SUB } from "@/lib/design/tokens";

/** "📁 Browse device gallery" (prototype 3829) — the one control that changes a
 *  photo, wherever a photo is drawn.
 *
 *  The FILE goes straight from this browser to Storage with the person's own
 *  session, so a 5 MB image never travels through a server action and the
 *  path-scoped storage policy is what decides. Only the resulting PATH is sent
 *  to the server, where the RPC checks the same authority again.
 *
 *  Not the prototype's cropper (PosterCropper 6604, the crop-and-frame flow): a
 *  square is drawn with `object-fit: cover`, which is what every one of these
 *  places wanted from a crop. The cropper is on the backlog with the poster
 *  uploads it belongs to.
 *
 *  Three shapes: the chip with its Remove (the Edit sheet), the ＋ on the corner
 *  of the hero square (`overlay`), and since 14 Sep 2026 the dashed square that
 *  ends an artist's gallery rail (`tile`) — the prototype's "＋ Add" tile on the
 *  Photos rail (10979), the size of the square it sits in. */

const setter = (owner: PhotoOwner, path: string | null) =>
  owner.kind === "avatar"
    ? setMyAvatarAction({ path })
    : owner.kind === "tenant"
      ? setTenantPhotoAction({ tenantId: owner.id, path })
      : owner.kind === "gallery"
        ? path
          ? addMyGalleryPhotoAction({ path })
          : Promise.resolve({ error: "A gallery photo is removed from its own corner." })
        : setCrewPhotoAction({ crewId: owner.id, path });

export function PhotoPicker({
  owner,
  hasPhoto,
  label = "Change photo",
  onLight = false,
  overlay = false,
  tile = false,
  onSaved,
}: {
  owner: PhotoOwner;
  hasPhoto: boolean;
  label?: string;
  /** drawn on the entity's own colour rather than on the page */
  onLight?: boolean;
  /** the ＋ on the corner of the profile square (prototype 10600) — one round
   *  control, absolutely placed inside a relative parent; errors show as a toast */
  overlay?: boolean;
  /** the whole square as a dashed "＋ Add" tile — fills its relative parent;
   *  `label` is what it says and what it is called */
  tile?: boolean;
  /** ONBOARDING'S CASE (U2): the page it sits on redirects the moment a profile
   *  exists, so a refresh there would end the flow. A caller that passes this
   *  is told the path instead of the page being reloaded. */
  onSaved?: (path: string | null) => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    const bad = whyNotAPhoto(file);
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = photoPath(owner, file);
      const up = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) {
        setError(up.error.message);
        return;
      }
      const out = await setter(owner, path);
      if (out.error) {
        /* the row would not take it, so the orphan file goes back out — the
           storage policy allows exactly this person to delete exactly this path */
        await supabase.storage.from(MEDIA_BUCKET).remove([path]);
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

  /* the hero's controls sit inside a clipped square, so their error is a toast */
  const toast = error ? (
    <span role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: "1.5px solid #F87171", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 390, textAlign: "center", zIndex: 650, fontFamily: DOS_UI }}>
      {error}
    </span>
  ) : null;

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
            gap: 8,
            cursor: busy ? "default" : "pointer",
            background: "rgba(0,0,0,.28)",
            border: "1.5px dashed rgba(255,255,255,.6)",
            color: "#fff",
            boxSizing: "border-box",
            fontFamily: DOS_UI,
            opacity: busy ? 0.7 : 1,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 40, lineHeight: 1, fontWeight: 300 }}>
            {busy ? "…" : "＋"}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>{busy ? "Uploading" : label}</span>
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
          style={{ position: "absolute", bottom: 8, right: 8, width: 28, height: 28, borderRadius: 14, background: "rgba(0,0,0,.62)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", fontSize: 14, border: "1.5px solid rgba(255,255,255,.35)", opacity: busy ? 0.6 : 1 }}
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
    border: `1px solid ${onLight ? "rgba(255,255,255,.5)" : LINE}`,
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
    </span>
  );
}
