"use client";

import { addMyGalleryPhotoAction, removeMyGalleryPhotoAction } from "@/features/media/server-actions/photos";
import { addStudioProofPhotoAction, removeStudioProofPhotoAction } from "@/features/tenants/server-actions/studioVerification";
import { MEDIA_BUCKET, photoPath, photoUrl } from "@/lib/media/photo";
import { PROOF_BUCKET, PROOF_MAX, proofPath } from "@/lib/media/proof";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DraftItem, StoredPicture } from "./headerDraft";

/** WHAT SAVE ACTUALLY DOES — and why the ORDER is the whole design (16 Sep 2026).
 *
 *  The obvious commit is "add everything, then remove everything", and it is
 *  wrong. The database re-checks its own rules on EVERY call, against the live
 *  count at that instant:
 *
 *    `remove_org_proof_photo`  refuses when `v_live <= 1`  (a studio keeps one)
 *    `add_studio_proof_photo`  refuses when `v_live >= 10`
 *    `add_my_gallery_photo`    refuses at 1 for a plain user, 10 for an artist
 *
 *  So add-first breaks the swap AT THE CEILING — a studio holding ten, or a
 *  user holding their one, cannot add the replacement before making room — and
 *  remove-first breaks the swap AT THE FLOOR: a studio holding one cannot
 *  remove it before the replacement exists. A fixed order fails at one end or
 *  the other, always.
 *
 *  The rule that holds at both ends is one line long: **while there is work,
 *  remove if that leaves us at or above the floor, otherwise add if that leaves
 *  us at or below the ceiling.** It keeps the live count inside [min, max] at
 *  every single instant, so no call is ever made that the database would refuse
 *  for a reason the draft could have known. Four cases, checked by hand:
 *
 *    studio at 1, swapping     → live=1, cannot remove (floor) → add (2) → remove (1) ✓
 *    studio at 10, swapping    → live=10, remove (9) → add (10) ✓
 *    user at 1, swapping       → live=1, min is 0 so remove (0) → add (1) ✓
 *    four removals             → remove, remove, remove, remove ✓
 *
 *  And it is why the deleted instruction — "to replace your only picture, add
 *  the new one first" — is not lost but made unnecessary: the sheet now does
 *  that ordering itself, which is the right home for a rule nobody should have
 *  had to read.
 *
 *  ROW BEFORE OBJECT on every removal, so a refusal leaves the picture whole
 *  rather than pointing a live row at bytes that are gone. OBJECT BEFORE ROW on
 *  every addition (the file has to exist for the RPC to record a path), and a
 *  refused row takes its just-uploaded object back out — which is what
 *  `PhotoPicker` and the old grid already did.
 *
 *  A half-failed Save is reported, never swallowed: the caller keeps the sheet
 *  open, shows the database's own words, and pressing Save again retries only
 *  what is left, because `applyCommit` has already folded in what landed. */

export interface CommitPorts {
  bucket: string;
  pathFor: (file: File) => string;
  urlFor: (path: string) => string | null;
  signed: boolean;
  add: (path: string) => Promise<{ error: string | null; id?: string | null }>;
  remove: (id: string) => Promise<{ error: string | null }>;
  min: number;
  max: number;
}

export interface CommitResult {
  added: Array<{ key: string; row: StoredPicture }>;
  removed: string[];
  failures: Array<{ key: string; reason: string }>;
}

export async function commitHeaderDraft(items: DraftItem[], ports: CommitPorts): Promise<CommitResult> {
  const supabase = createSupabaseBrowserClient();
  const removals = items.filter((i): i is Extract<DraftItem, { kind: "stored" }> => i.kind === "stored" && i.removed);
  const additions = items.filter((i): i is Extract<DraftItem, { kind: "new" }> => i.kind === "new");
  const out: CommitResult = { added: [], removed: [], failures: [] };

  /* what the database holds right now — every stored row, marked or not */
  let live = items.filter((i) => i.kind === "stored").length;
  let r = 0;
  let a = 0;

  /** ⚠ A REFUSED REMOVAL IS NOT NECESSARILY A PERMANENT ONE (found by review,
   *  16 Sep 2026). `ports.min` models the floor this code KNOWS about — a
   *  studio keeps one — but `remove_org_proof_photo` has a SECOND floor nobody
   *  outside it can see: it also refuses while `v_live <= 5` and a verification
   *  request is pending ("DanceOS is checking these now — add a replacement
   *  before you remove one"). A studio at five, under review, swapping a
   *  picture, would therefore be told to add a replacement in the same breath
   *  as having added exactly that. So a refusal is parked, and tried once more
   *  after the additions have run and made room. Only then is it a failure. */
  const parked: Array<{ key: string; id: string; path: string }> = [];

  /* the interleave; see the header for why a fixed order cannot work */
  while (r < removals.length || a < additions.length) {
    if (r < removals.length && live - 1 >= ports.min) {
      const item = removals[r];
      r += 1;
      const res = await ports.remove(item.row.id);
      if (res.error) {
        parked.push({ key: item.key, id: item.row.id, path: item.row.path });
        continue;
      }
      /* the row first, then the bytes — a refusal above leaves the picture whole */
      await supabase.storage.from(ports.bucket).remove([item.row.path]);
      out.removed.push(item.key);
      live -= 1;
      continue;
    }
    if (a < additions.length && live + 1 <= ports.max) {
      const item = additions[a];
      a += 1;
      const path = ports.pathFor(item.file);
      const up = await supabase.storage.from(ports.bucket).upload(path, item.file, { contentType: item.file.type, upsert: false });
      if (up.error) {
        out.failures.push({ key: item.key, reason: up.error.message });
        continue;
      }
      const res = await ports.add(path);
      if (res.error || !res.id) {
        /* the row would not take it, so the orphan goes back out */
        await supabase.storage.from(ports.bucket).remove([path]);
        out.failures.push({ key: item.key, reason: res.error ?? "That picture could not be recorded." });
        continue;
      }
      out.added.push({ key: item.key, row: { id: res.id, path, url: ports.urlFor(path), signed: ports.signed } });
      live += 1;
      continue;
    }
    /* neither move is legal — the remainder cannot be done in this shape, and
       saying so is better than making a call the database will refuse */
    if (r < removals.length) {
      out.failures.push({ key: removals[r].key, reason: `A header keeps at least ${ports.min}. Add a replacement first.` });
      r += 1;
      continue;
    }
    if (a < additions.length) {
      out.failures.push({ key: additions[a].key, reason: `${ports.max} pictures is the most a header holds.` });
      a += 1;
    }
  }

  /* the second try, now that every addition that could land has landed */
  for (const item of parked) {
    if (live - 1 < ports.min) {
      out.failures.push({ key: item.key, reason: `A header keeps at least ${ports.min}. Add a replacement first.` });
      continue;
    }
    const res = await ports.remove(item.id);
    if (res.error) {
      out.failures.push({ key: item.key, reason: res.error });
      continue;
    }
    await supabase.storage.from(ports.bucket).remove([item.path]);
    out.removed.push(item.key);
    live -= 1;
  }
  return out;
}

/** WHAT TO SAY WHEN A SAVE ONLY HALF LANDED (16 Sep 2026).
 *
 *  ⚠ "Press Save to try the rest" is only true if there IS a rest to try. A
 *  refused REMOVAL comes back unmarked — the database has said no and saying no
 *  again would be the same answer — so after one the draft can be clean, and
 *  pressing Save would just close the sheet. Promising a retry that does
 *  nothing is how a message stops being believed. */
export function commitWords(result: CommitResult, attempted: number): string {
  const done = result.added.length + result.removed.length;
  const why = result.failures[0].reason;
  /* only a staged ADD survives a failure as something to retry */
  const retryable = result.failures.length > result.removed.length && done < attempted;
  const head = done > 0 ? `${done} of ${attempted} picture changes saved — ` : "";
  return retryable ? `${head}${why} Press Save to try the rest.` : `${head}${why} The picture was left where it was.`;
}

/** A STUDIO's header pictures are the photos it showed DanceOS: the private
 *  proof bucket, the OWNER's own folder, and the floor the database keeps. */
export const studioPorts = (tenantId: string, ownerId: string): CommitPorts => ({
  bucket: PROOF_BUCKET,
  pathFor: (file) => proofPath(ownerId, file),
  /* a private object has no public URL; the page re-reads and signs one */
  urlFor: () => null,
  signed: true,
  add: (path) => addStudioProofPhotoAction({ tenantId, path }),
  remove: (id) => removeStudioProofPhotoAction({ id }),
  min: 1,
  max: PROOF_MAX,
});

/** A PERSON's are their own, in the public bucket. `remove_my_gallery_photo`
 *  has NO minimum — a person may hold none — so the floor is 0, not 1. */
export const personPorts = (userId: string, max: number): CommitPorts => ({
  bucket: MEDIA_BUCKET,
  pathFor: (file) => photoPath({ kind: "gallery", id: userId }, file),
  urlFor: (path) => photoUrl(path),
  signed: false,
  add: (path) => addMyGalleryPhotoAction({ path }),
  remove: (id) => removeMyGalleryPhotoAction({ id }),
  min: 0,
  max,
});
