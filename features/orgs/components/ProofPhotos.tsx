"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addStudioProofPhotoAction, removeStudioProofPhotoAction } from "@/features/tenants/server-actions/studioVerification";
import { INK, LINE, SUB } from "@/lib/design/tokens";
import { PHOTO_TYPES, whyNotAPhoto } from "@/lib/media/photo";
import { PROOF_BUCKET, PROOF_MAX, PROOF_MIN, proofPath, type ProofPhoto } from "@/lib/media/proof";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MUTED = "var(--muted)";

/** R16 (9 Sep 2026) — the five to ten photos of its space a studio shows
 *  DanceOS, on the one strip the verification form and the Media desk draw.
 *
 *  THEY ARE THE STUDIO'S HEADER PICTURES TOO (15 Sep 2026, the user: "a studio
 *  gives these pictures when he submits for verification"). Once the studio is
 *  on Discover they swipe across the top of its page, so the copy says so —
 *  the earlier "nobody else ever sees these" is no longer true and a person
 *  choosing what to upload deserves to know where it goes. Until the studio is
 *  listed, only the organization and a DanceOS admin can read them, exactly as
 *  before.
 *
 *  The file goes straight from this browser into the organization's own folder
 *  in the PRIVATE bucket with its own session; only the path reaches the server.
 *  If the row refuses the path the object is deleted again, so a failure does
 *  not leave a file nothing points at.
 *
 *  THE STRIP OWNS ITS OWN LIST. It is seeded from the server once and then
 *  keeps itself, because during onboarding there is no page to refetch — the
 *  route that draws it redirects the moment the flow is judged finished. A
 *  just-uploaded thumbnail is the browser's own object URL, which is instant
 *  and needs no signed round trip; a later server render replaces it with the
 *  real signed URL.
 *
 *  A HEADER NEVER EMPTIES: the database refuses to remove the last picture,
 *  so the ✕ on the only one is disabled and says why, rather than offering a
 *  press that can only be refused. */
export function ProofPhotos({
  orgId,
  tenantId,
  initialPhotos,
  onCount,
  compact = false,
  refreshRoute = true,
  readOnly = false,
}: {
  /** the owner's own id — the folder in the private bucket a new photo goes
   *  into. Null for somebody who may look but not add (a trainer on the desk). */
  orgId: string | null;
  /** WHICH STUDIO these photos show. A studio is the ONLY subject since
   *  11 Sep 2026 — an organization is asked for no photos at all — so this is
   *  required. The file still goes to `proof/{orgId}/…`, the owner's own
   *  folder, so the bucket's policies were never touched. */
  tenantId: string;
  initialPhotos: ProofPhoto[];
  /** onboarding counts the strip to decide whether Continue is allowed */
  onCount?: (n: number) => void;
  /** on Home the strip sits inside a card and has no heading of its own */
  compact?: boolean;
  /** false during onboarding, where refetching the route would end the flow */
  refreshRoute?: boolean;
  /** the grid alone — no Add tile, no ✕ — for a member who may see but not change */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [list, setList] = useState<ProofPhoto[]>(initialPhotos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const n = list.length;
  const full = n >= PROOF_MAX;
  const enough = n >= PROOF_MIN;
  const canWrite = !readOnly && orgId !== null;

  const settle = (next: ProofPhoto[]) => {
    setList(next);
    if (onCount) onCount(next.length);
    if (refreshRoute) router.refresh();
  };

  const pick = async (files: File[]) => {
    if (!orgId) return;
    setError(null);
    const room = PROOF_MAX - n;
    if (room <= 0) {
      setError(`${PROOF_MAX} pictures is the most a header holds.`);
      return;
    }
    const take = files.slice(0, room);
    if (files.length > room) {
      setError(`Only ${room} more will fit — a header holds ${PROOF_MIN} to ${PROOF_MAX}.`);
    }
    setBusy(true);
    const added: ProofPhoto[] = [];
    try {
      const supabase = createSupabaseBrowserClient();
      for (const file of take) {
        const bad = whyNotAPhoto(file);
        if (bad) {
          setError(bad);
          continue;
        }
        const path = proofPath(orgId, file);
        const up = await supabase.storage.from(PROOF_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) {
          setError(up.error.message);
          continue;
        }
        const out = await addStudioProofPhotoAction({ tenantId, path });
        if (out.error) {
          /* the row would not take it, so the orphan file goes back out */
          await supabase.storage.from(PROOF_BUCKET).remove([path]);
          setError(out.error);
          continue;
        }
        added.push({ id: path, path, url: URL.createObjectURL(file) });
      }
    } finally {
      setBusy(false);
      if (added.length > 0) settle([...list, ...added]);
    }
  };

  const drop = (photo: ProofPhoto) =>
    start(async () => {
      setError(null);
      const supabase = createSupabaseBrowserClient();
      /* a row added in this session is keyed by its path, not by the uuid the
         database gave it — so ask the row for its id before removing it */
      let id = photo.id;
      if (id === photo.path) {
        const { data } = await supabase
          .from("org_proof_photos")
          .select("id")
          .eq("path", photo.path)
          .is("deleted_at", null)
          .maybeSingle();
        id = (data as { id: string } | null)?.id ?? photo.id;
      }
      const out = await removeStudioProofPhotoAction({ id });
      if (out.error) {
        setError(out.error);
        return;
      }
      /* the object goes too — the row was the only thing pointing at it */
      await supabase.storage.from(PROOF_BUCKET).remove([photo.path]);
      settle(list.filter((p) => p.path !== photo.path));
    });

  return (
    <div>
      {compact ? null : (
        <div style={{ fontSize: 13, color: SUB, marginBottom: 14, lineHeight: 1.5 }}>
          Photos of the space you teach in — the floor, the entrance, a class in progress. A DanceOS admin checks them with
          your links to verify the studio, and <b style={{ color: INK }}>once it is on Discover they are its header pictures</b>,
          swiping across the top of its page. Keep at least one.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span
          role="status"
          aria-label={`${n} of ${PROOF_MIN} to ${PROOF_MAX} photos added`}
          style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 6, background: enough ? "#DCFCE7" : "#FEF3C7", color: enough ? "#15803D" : "#92400E" }}
        >
          {n} / {PROOF_MIN}–{PROOF_MAX}
        </span>
        <span style={{ fontSize: 10.5, color: MUTED, lineHeight: 1.4 }}>
          {enough ? "enough for DanceOS to check" : `at least ${PROOF_MIN - n} more to be verified`}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 7 }}>
        {list.map((p, i) => {
          const last = n <= 1;
          return (
            <div key={p.path} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 11, overflow: "hidden", background: "var(--el)", border: `1px solid ${LINE}` }}>
              {p.url ? (
                <Image src={p.url} alt={`Photo ${i + 1} of your space`} fill sizes="90px" style={{ objectFit: "cover" }} unoptimized />
              ) : (
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: MUTED, textAlign: "center", padding: 4 }}>
                  added
                </span>
              )}
              {canWrite ? (
                <button
                  type="button"
                  disabled={pending || busy || last}
                  onClick={() => drop(p)}
                  aria-label={last ? `Photo ${i + 1} is the only one — add another before removing it` : `Remove photo ${i + 1}`}
                  title={last ? "A header keeps at least one picture" : undefined}
                  style={{ position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 10, border: "1.5px solid rgba(255,255,255,.5)", background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 10, fontWeight: 900, cursor: pending || busy || last ? "default" : "pointer", fontFamily: "inherit", lineHeight: 1, padding: 0, opacity: last ? 0.4 : 1 }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          );
        })}

        {full || !canWrite ? null : (
          <label
            aria-disabled={busy}
            style={{ aspectRatio: "1 / 1", borderRadius: 11, border: `1.5px dashed ${enough ? LINE : "#F59E0B"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: busy ? "default" : "pointer", color: enough ? SUB : "#B45309", fontSize: 9.5, fontWeight: 800, textAlign: "center", gap: 2, opacity: busy ? 0.6 : 1 }}
          >
            <span style={{ fontSize: 17 }}>{busy ? "…" : "＋"}</span>
            {busy ? "Uploading" : "Add"}
            <input
              type="file"
              accept={PHOTO_TYPES.join(",")}
              multiple
              aria-label="Add photos of your space"
              disabled={busy}
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void pick(files);
              }}
            />
          </label>
        )}
      </div>

      {error ? <div style={{ fontSize: 10.5, color: "#B42318", marginTop: 8, lineHeight: 1.45 }}>{error}</div> : null}
      {!error && canWrite ? <div style={{ fontSize: 9.5, color: MUTED, marginTop: 8 }}>JPEG, PNG or WebP · up to 5 MB each · pick several at once</div> : null}
    </div>
  );
}
