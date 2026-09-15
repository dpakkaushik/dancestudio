"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeMyGalleryPhotoAction } from "@/features/media/server-actions/photos";
import { MEDIA_BUCKET } from "@/lib/media/photo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DOS_UI, INK } from "@/lib/design/tokens";

/** The ✕ on a gallery photo's corner (prototype's per-tile × on the Photos
 *  rail, 10979-10981) — the row goes first, then the object, so a refusal
 *  leaves the picture exactly where it was. */
export function GalleryRemove({ id, path }: { id: string; path: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const out = await removeMyGalleryPhotoAction({ id });
    if (out.error) {
      setBusy(false);
      setError(out.error);
      return;
    }
    /* the storage policy lets exactly this person delete exactly this path */
    await createSupabaseBrowserClient().storage.from(MEDIA_BUCKET).remove([path]);
    setBusy(false);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Remove this photo"
        disabled={busy}
        onClick={() => void remove()}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          borderRadius: 14,
          background: "rgba(0,0,0,.62)",
          color: "#fff",
          border: "1.5px solid rgba(255,255,255,.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          lineHeight: 1,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.6 : 1,
          padding: 0,
        }}
      >
        {busy ? "…" : "✕"}
      </button>
      {error ? (
        <span role="status" style={{ position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", background: "var(--el)", border: "1.5px solid #F87171", color: INK, padding: "11px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, maxWidth: 390, textAlign: "center", zIndex: 650, fontFamily: DOS_UI }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
