"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeMyGalleryPhotoAction } from "@/features/media/server-actions/photos";
import { removeStudioProofPhotoAction } from "@/features/tenants/server-actions/studioVerification";
import { MEDIA_BUCKET } from "@/lib/media/photo";
import { PROOF_BUCKET } from "@/lib/media/proof";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DOS_UI, INK } from "@/lib/design/tokens";

/** The ✕ on a header picture's corner (prototype's per-tile × on the Photos
 *  rail, 10979-10981) — the row goes first, then the object, so a refusal
 *  leaves the picture exactly where it was and says why in the database's own
 *  words ("a studio keeps at least one header picture").
 *
 *  Two kinds of header, one control (15 Sep 2026): a PERSON's picture is a
 *  `profile_photos` row in the public bucket; a STUDIO's is one of the photos
 *  it showed DanceOS, in the private one. The storage policy lets exactly this
 *  person delete exactly this path either way. */
export function HeaderRemove({ target, path }: { target: { kind: "person" | "studio"; id: string }; path: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const out = target.kind === "person" ? await removeMyGalleryPhotoAction({ id: target.id }) : await removeStudioProofPhotoAction({ id: target.id });
    if (out.error) {
      setBusy(false);
      setError(out.error);
      setTimeout(() => setError(null), 3200);
      return;
    }
    await createSupabaseBrowserClient()
      .storage.from(target.kind === "person" ? MEDIA_BUCKET : PROOF_BUCKET)
      .remove([path]);
    setBusy(false);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Remove this picture"
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
