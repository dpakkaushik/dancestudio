"use client";

import Image from "next/image";
import { useState } from "react";
import { LINE, MUTED, SUB } from "@/lib/design/tokens";
import { PHOTO_TYPES, whyNotAPhoto } from "@/lib/media/photo";
import { PhotoCropper } from "./PhotoCropper";

/** THE HEADER PICTURES AS A GALLERY (16 Sep 2026).
 *
 *  One grid, drawn in one place. It was copy-pasted in two — `ProofPhotos` and
 *  the person's Edit sheet each had their own literal, already drifting — and
 *  the user asked for a gallery you can open a picture from, which is one more
 *  thing neither copy should learn twice.
 *
 *  The geometry is the one both copies already used and the prototype's album
 *  interior (DanceOSApp.jsx 11100-11122): square tiles on an `auto-fill` grid,
 *  11px corners, a 7px gutter. What is new is that a tile is now a BUTTON —
 *  pressing it opens the picture full size — with the remove control layered
 *  above it, so one tap can never both open and remove.
 *
 *  A TILE MARKED FOR REMOVAL DOES NOT DISAPPEAR. It dims, says REMOVING across
 *  itself, and its ✕ becomes ↩. Nothing has happened to it yet: the Save button
 *  is what removes it and Cancel is what puts it back. That is the whole of the
 *  bug the user found, expressed in the one place they can see it.
 *
 *  The labels here are load-bearing — `Remove photo N`, `Photo N is the only
 *  one — add another before removing it`, and whatever `addLabel` the caller
 *  passes — because the e2e suite and `shoot-hero.js` press them by name. They
 *  are unchanged from the grid this replaces. */

export interface GridTile {
  key: string;
  url: string | null;
  alt: string;
  /** a signed private-bucket URL must skip the Next image optimizer */
  signed: boolean;
  /** staged for removal: dimmed, and its control is the way back */
  marked?: boolean;
  /** false when removing this one would take the header below its floor */
  removable?: boolean;
  /** the database's own words, when this one was refused */
  failed?: string;
}

export function HeaderGrid({
  tiles,
  canWrite,
  busy = false,
  onOpen,
  onRemove,
  addLabel,
  onFiles,
  full = false,
}: {
  tiles: GridTile[];
  canWrite: boolean;
  busy?: boolean;
  onOpen: (index: number) => void;
  onRemove?: (key: string) => void;
  /** the accessible name of the Add tile's file input; no tile without one */
  addLabel?: string;
  onFiles?: (files: File[]) => void;
  /** the header is at its ceiling, so there is nothing to add */
  full?: boolean;
}) {
  /* EVERY HEADER PICTURE IS CROPPED BEFORE IT IS STAGED OR UPLOADED (18 Sep
     2026). This grid owns the one file input every header goes through — the
     Edit sheets' staged draft and the verification form's immediate upload both
     hand it their `onFiles` — so the cropper sits here, once, and both callers
     receive files already cut to the square they draw. A batch steps through
     the cropper one picture at a time; a bad file is refused before it opens. */
  const [cropping, setCropping] = useState<File[] | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const take = (files: File[]) => {
    const bad = files.map(whyNotAPhoto).find(Boolean) ?? null;
    setRefused(bad);
    if (bad) return;
    setCropping(files);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 7 }}>
      {cropping && onFiles ? (
        <PhotoCropper
          files={cropping}
          frame="square"
          label="Header picture"
          onCancel={() => setCropping(null)}
          onDone={(files) => {
            setCropping(null);
            onFiles(files);
          }}
        />
      ) : null}
      {refused ? (
        <div role="alert" style={{ gridColumn: "1 / -1", fontSize: 10.5, color: "#F87171", lineHeight: 1.45 }}>
          {refused}
        </div>
      ) : null}
      {tiles.map((t, i) => {
        const locked = t.removable === false;
        return (
          <div
            key={t.key}
            style={{
              position: "relative",
              aspectRatio: "1 / 1",
              borderRadius: 11,
              overflow: "hidden",
              background: "var(--el)",
              border: t.failed ? "1.5px solid #F87171" : `1px solid ${LINE}`,
            }}
          >
            <button
              type="button"
              aria-label={`Open picture ${i + 1}`}
              onClick={() => onOpen(i)}
              style={{ position: "absolute", inset: 0, padding: 0, border: "none", background: "none", cursor: "zoom-in", zIndex: 0 }}
            >
              {t.url ? (
                <Image src={t.url} alt={t.alt} fill sizes="90px" style={{ objectFit: "cover", opacity: t.marked ? 0.32 : 1 }} unoptimized={t.signed} />
              ) : (
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: MUTED, textAlign: "center", padding: 4 }}>
                  added
                </span>
              )}
            </button>

            {/* what a marked tile says for itself, so the dimming is never a mystery */}
            {t.marked ? (
              <span
                aria-hidden="true"
                style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "3px 0", textAlign: "center", fontSize: 8.5, fontWeight: 900, letterSpacing: 0.8, background: "rgba(0,0,0,.66)", color: "#fff", zIndex: 1 }}
              >
                REMOVING
              </span>
            ) : null}

            {canWrite && onRemove ? (
              <button
                type="button"
                disabled={busy || (locked && !t.marked)}
                onClick={() => onRemove(t.key)}
                aria-label={
                  t.marked
                    ? `Undo removing photo ${i + 1}`
                    : locked
                      ? `Photo ${i + 1} is the only one — add another before removing it`
                      : `Remove photo ${i + 1}`
                }
                title={locked && !t.marked ? "A header keeps at least one picture" : undefined}
                style={{
                  position: "absolute",
                  top: 3,
                  right: 3,
                  zIndex: 2,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  border: "1.5px solid rgba(255,255,255,.5)",
                  background: "rgba(0,0,0,.6)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 900,
                  cursor: busy || (locked && !t.marked) ? "default" : "pointer",
                  fontFamily: "inherit",
                  lineHeight: 1,
                  padding: 0,
                  opacity: locked && !t.marked ? 0.4 : 1,
                }}
              >
                {t.marked ? "↩" : "✕"}
              </button>
            ) : null}
          </div>
        );
      })}

      {canWrite && addLabel && onFiles && !full ? (
        <label
          aria-disabled={busy}
          style={{
            aspectRatio: "1 / 1",
            borderRadius: 11,
            border: `1.5px dashed ${LINE}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: busy ? "default" : "pointer",
            color: SUB,
            fontSize: 9.5,
            fontWeight: 800,
            textAlign: "center",
            gap: 2,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <span style={{ fontSize: 17 }}>{busy ? "…" : "＋"}</span>
          {busy ? "Uploading" : "Add"}
          <input
            type="file"
            accept={PHOTO_TYPES.join(",")}
            multiple
            aria-label={addLabel}
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) take(files);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}
