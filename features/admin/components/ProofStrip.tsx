"use client";

import Image from "next/image";
import { useState } from "react";
import { SUB } from "@/lib/design/tokens";
import { PROOF_MIN, type ProofPhoto } from "@/lib/media/proof";

const MUTED = "var(--muted)";
const EL = "var(--el)";

/** R16 (9 Sep 2026) — the evidence, on the admin's side of it.
 *
 *  Read-only, and read-only on purpose: an admin judges these, it does not
 *  curate them. Every URL here was signed on the server for this admin's own
 *  session and expires in minutes, so a screenshot of the page is not a
 *  permanent handle on somebody's premises.
 *
 *  Tapping one opens it full width in place rather than in a lightbox: the
 *  point is to look closely at a floor or a doorway, and a modal on a 430px
 *  phone frame gives no more room than the card does. */
export function ProofStrip({ photos, orgName }: { photos: ProofPhoto[]; orgName: string }) {
  const [open, setOpen] = useState<string | null>(null);

  if (photos.length === 0) {
    return (
      <div style={{ fontSize: 10.5, color: "#B45309", background: "#FEF3C7", borderRadius: 8, padding: "6px 9px", lineHeight: 1.45 }}>
        No photos of the space. Since 9 Sep 2026 a request needs {PROOF_MIN} — this one was filed before that, or the
        photos have been taken back.
      </div>
    );
  }

  const shown = photos.find((p) => p.path === open) ?? null;

  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: MUTED, marginBottom: 6 }}>
        {photos.length} PHOTO{photos.length === 1 ? "" : "S"} OF THE SPACE
        {photos.length < PROOF_MIN ? <span style={{ color: "#B45309" }}> · under the minimum of {PROOF_MIN}</span> : null}
      </div>

      {shown ? (
        <div style={{ marginBottom: 7 }}>
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label="Close this photo"
            style={{ display: "block", width: "100%", padding: 0, border: `1px solid ${EL}`, borderRadius: 12, overflow: "hidden", background: EL, cursor: "zoom-out" }}
          >
            {shown.url ? (
              <Image src={shown.url} alt={`${orgName}'s space`} width={396} height={297} style={{ width: "100%", height: "auto", display: "block" }} unoptimized />
            ) : (
              <span style={{ display: "block", padding: 30, fontSize: 11, color: SUB }}>That photo could not be opened.</span>
            )}
          </button>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(58px, 1fr))", gap: 5 }}>
        {photos.map((p, i) => (
          <button
            key={p.path}
            type="button"
            onClick={() => setOpen(open === p.path ? null : p.path)}
            aria-label={`Open photo ${i + 1} of ${orgName}'s space`}
            style={{ position: "relative", aspectRatio: "1 / 1", padding: 0, borderRadius: 9, overflow: "hidden", border: `1px solid ${open === p.path ? "var(--text)" : EL}`, background: EL, cursor: "zoom-in" }}
          >
            {p.url ? (
              <Image src={p.url} alt="" fill sizes="70px" style={{ objectFit: "cover" }} unoptimized />
            ) : (
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: MUTED }}>?</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
