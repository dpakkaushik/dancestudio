"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HeaderGrid, type GridTile } from "@/features/media/components/HeaderGrid";
import { PhotoLightbox } from "@/features/media/components/PhotoLightbox";
import { addStudioProofPhotoAction, removeStudioProofPhotoAction } from "@/features/tenants/server-actions/studioVerification";
import { GOLD, GREEN, INK, MUTED, SUB } from "@/lib/design/tokens";
import { whyNotAPhoto } from "@/lib/media/photo";
import { PROOF_BUCKET, PROOF_MAX, PROOF_MIN, proofPath, type ProofPhoto } from "@/lib/media/proof";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
 *  press that can only be refused.
 *
 *  ⚠ IT STAYS IMMEDIATE, AND THAT IS THE POINT (16 Sep 2026). The Edit sheets
 *  moved to a staged draft because they have a Cancel button that must mean
 *  something. This strip's two remaining homes do NOT: the Media desk has no
 *  Save at all, and the verification form's Submit files a REVIEW REQUEST whose
 *  gate (`onCount` → `PROOF_MIN`) counts the photos DanceOS can actually see —
 *  a staged photo would let somebody ask to be verified on evidence that does
 *  not exist yet. So the same grid is drawn by the same component here, and
 *  only the timing differs, which is what the timing is for. */
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
  const [lightbox, setLightbox] = useState<number | null>(null);
  /* every preview URL this strip makes, so none leaks on unmount */
  const urls = useRef<Set<string>>(new Set());
  useEffect(() => () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
  }, []);

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
        if (out.error || !out.id) {
          /* the row would not take it, so the orphan file goes back out */
          await supabase.storage.from(PROOF_BUCKET).remove([path]);
          setError(out.error ?? "That photo could not be recorded.");
          continue;
        }
        /* the action hands the ROW's id back now (16 Sep 2026), which is what
           deleted the browser query that used to go looking for it again */
        const preview = URL.createObjectURL(file);
        urls.current.add(preview);
        added.push({ id: out.id, path, url: preview });
      }
    } finally {
      setBusy(false);
      if (added.length > 0) settle([...list, ...added]);
    }
  };

  const drop = (key: string) =>
    start(async () => {
      const photo = list.find((p) => p.id === key);
      if (!photo) return;
      setError(null);
      const out = await removeStudioProofPhotoAction({ id: photo.id });
      if (out.error) {
        setError(out.error);
        return;
      }
      /* the object goes too — the row was the only thing pointing at it */
      await createSupabaseBrowserClient().storage.from(PROOF_BUCKET).remove([photo.path]);
      settle(list.filter((p) => p.path !== photo.path));
    });

  const tiles: GridTile[] = list.map((p, i) => ({
    key: p.id,
    url: p.url,
    alt: `Photo ${i + 1} of your space`,
    signed: true,
    removable: n > 1,
  }));

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
          style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 6, background: enough ? `${GREEN}22` : `${GOLD}22`, color: enough ? GREEN : GOLD }}
        >
          {n} / {PROOF_MIN}–{PROOF_MAX}
        </span>
        <span style={{ fontSize: 10.5, color: SUB, lineHeight: 1.4 }}>
          {enough ? "enough for DanceOS to check" : `at least ${PROOF_MIN - n} more to be verified`}
        </span>
      </div>

      {/* the one grid, shared with the Edit sheets' staged gallery — only the
          TIMING differs between them, and pressing a picture opens it either way */}
      <HeaderGrid
        tiles={tiles}
        canWrite={canWrite}
        busy={busy || pending}
        onOpen={setLightbox}
        onRemove={drop}
        addLabel="Add photos of your space"
        onFiles={(files) => void pick(files)}
        full={full}
      />

      {error ? <div style={{ fontSize: 10.5, color: "#F87171", marginTop: 8, lineHeight: 1.45 }}>{error}</div> : null}
      {!error && canWrite ? <div style={{ fontSize: 9.5, color: MUTED, marginTop: 8 }}>JPEG, PNG or WebP · up to 5 MB each · pick several at once</div> : null}

      {lightbox !== null ? (
        <PhotoLightbox
          shots={tiles.map((t) => ({ key: t.key, src: t.url, alt: t.alt, signed: t.signed }))}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          label="Your space"
        />
      ) : null}
    </div>
  );
}
