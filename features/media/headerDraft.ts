"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { whyNotAPhoto } from "@/lib/media/photo";

/** THE EDIT SHEET IS ONE TRANSACTION (16 Sep 2026).
 *
 *  The user pressed the ✕ on four header pictures, pressed CANCEL, and lost all
 *  four: *"i clicked over the cross but didnt save but canceled the edit form
 *  but still i lost the 4 header images why? This isnt how apps behave."*
 *
 *  They were right, and this is not a taste call — it is the PROTOTYPE'S OWN
 *  RULE being broken. Its Edit profile sheet (DanceOSApp.jsx 11364-11400) is a
 *  DRAFT editor: opening it copies the record into `editDraft`, every field
 *  writes to that copy, **Cancel is `setEditOpen(false)` and nothing else**
 *  (11394), and Save copies the draft onto the record (11395-11397). The app
 *  honoured that for About, Since, the phone and the links — all of them plain
 *  `useState` committed in `save()` — and broke it for the pictures alone,
 *  because the picture controls were lifted out of a screen that had no Save
 *  button and dropped into one that does.
 *
 *  And what they broke was not recoverable. The ✕ ran TWO phases: the row was
 *  soft-deleted through `remove_org_proof_photo`, and then the OBJECT was
 *  deleted out of the bucket. The row could in principle come back — there is
 *  no un-delete function in any migration, but the column is `deleted_at` — and
 *  the bytes could not. That asymmetry is why this is staging and not undo: an
 *  undo window can only ever be as honest as the thing it restores.
 *
 *  So this hook holds the WHOLE picture set as a draft and touches nothing
 *  durable. No network call happens in this file at all — not one import from
 *  Supabase — which is the property that makes Cancel free. Adding is staged
 *  for the same reason removing is: an upload that commits while a removal
 *  waits would make "Cancel" mean two different things on one screen, and it
 *  would break the only way a person on the one-picture plan can ever change
 *  their header (`commitHeaderDraft` explains why the order matters).
 *
 *  A REMOVED STORED PICTURE IS MARKED, NEVER SPLICED. Its position in the array
 *  is what keeps the grid from resequencing under the finger, and it is what
 *  makes ↩ possible. */

/** One picture that is already on the record. */
export interface StoredPicture {
  id: string;
  path: string;
  /** a public URL, a signed one, or null when neither could be made */
  url: string | null;
  /** a signed private-bucket URL must skip the Next image optimizer */
  signed: boolean;
}

export type DraftItem =
  | { kind: "stored"; key: string; row: StoredPicture; removed: boolean; failed?: string }
  | { kind: "new"; key: string; file: File; previewUrl: string; failed?: string };

const keyOf = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${performance.now()}`;

export interface HeaderDraft {
  items: DraftItem[];
  /** what the grid draws: every new picture, and every stored one not marked */
  visible: DraftItem[];
  /** how many pictures the record would hold if this draft were saved */
  keeping: number;
  /** how many stored rows the DATABASE holds right now — the commit's starting count */
  liveCount: number;
  dirty: boolean;
  changeCount: number;
  /** the floor this owner's database enforces: 1 for a studio, 0 for a person */
  min: number;
  max: number;
  error: string | null;
  setError: (m: string | null) => void;
  stage: (files: File[]) => void;
  /** mark a stored picture for removal, or drop a staged one outright */
  unstage: (key: string) => void;
  undoLast: () => void;
  /** whether anything is still marked — Undo is not offered otherwise */
  canUndo: boolean;
  canRemove: (item: DraftItem) => boolean;
  canAdd: boolean;
  /** replace the draft with what actually landed, so a retry never repeats work */
  applyCommit: (result: { added: Array<{ key: string; row: StoredPicture }>; removed: string[]; failures: Array<{ key: string; reason: string }> }) => void;
  disposeAll: () => void;
}

export function useHeaderDraft({ initial, min, max }: { initial: StoredPicture[]; min: number; max: number }): HeaderDraft {
  const [items, setItems] = useState<DraftItem[]>(() =>
    initial.map((row) => ({ kind: "stored" as const, key: row.id, row, removed: false }))
  );
  const [error, setError] = useState<string | null>(null);
  /* every object URL this draft ever made, so not one leaks on unmount — the
     old grid created them and revoked none */
  const urls = useRef<Set<string>>(new Set());
  /* the order removals were marked in, so ↩ undoes the last one */
  const marked = useRef<string[]>([]);

  const visible = useMemo(() => items.filter((i) => i.kind === "new" || !i.removed), [items]);
  const keeping = visible.length;
  const liveCount = useMemo(() => items.filter((i) => i.kind === "stored").length, [items]);
  const changeCount = useMemo(
    () => items.filter((i) => i.kind === "new" || i.removed).length,
    [items]
  );

  const disposeAll = useCallback(() => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current.clear();
  }, []);

  /* Cancel, the backdrop, the system BACK gesture and a plain unmount all land
     here, so every way out of the sheet discards identically */
  useEffect(() => disposeAll, [disposeAll]);

  const stage = useCallback(
    (files: File[]) => {
      setError(null);
      setItems((prev) => {
        const room = max - prev.filter((i) => i.kind === "new" || !i.removed).length;
        if (room <= 0) {
          setError(`${max} pictures is the most a header holds.`);
          return prev;
        }
        const take = files.slice(0, room);
        if (files.length > room) {
          setError(`Only ${room} more will fit.`);
        }
        const fresh: DraftItem[] = [];
        take.forEach((file) => {
          const bad = whyNotAPhoto(file);
          if (bad) {
            setError(bad);
            return;
          }
          const previewUrl = URL.createObjectURL(file);
          urls.current.add(previewUrl);
          fresh.push({ kind: "new", key: keyOf(), file, previewUrl });
        });
        return fresh.length ? [...prev, ...fresh] : prev;
      });
    },
    [max]
  );

  const unstage = useCallback((key: string) => {
    setError(null);
    setItems((prev) => {
      const item = prev.find((i) => i.key === key);
      if (!item) return prev;
      if (item.kind === "new") {
        /* never uploaded, so there is nothing anywhere to undo — it just goes */
        URL.revokeObjectURL(item.previewUrl);
        urls.current.delete(item.previewUrl);
        return prev.filter((i) => i.key !== key);
      }
      if (item.removed) {
        /* pressing ↩ */
        marked.current = marked.current.filter((k) => k !== key);
        return prev.map((i) => (i.key === key ? { ...i, removed: false, failed: undefined } : i));
      }
      marked.current = [...marked.current, key];
      return prev.map((i) => (i.key === key ? { ...i, removed: true } : i));
    });
  }, []);

  /** ⚠ UNDO MUST ONLY EVER UNMARK (found by review, 16 Sep 2026).
   *
   *  The first cut read the last key off `marked` and handed it to `unstage`,
   *  which decides what to do from the item's CURRENT state — so once that key
   *  was stale, Undo did the opposite of its name. Concretely: mark A and B,
   *  stage C, press Save; A commits, B is refused and comes back UNMARKED, C
   *  fails. `marked` still says ["A","B"], so pressing Undo took "B", found it
   *  unmarked, and MARKED IT FOR DELETION. A button labelled Undo staging a
   *  removal is the same class of mistake as the bug this whole slice exists to
   *  fix. So: the stack is reconciled against the items on every read, and this
   *  never calls the toggling path. */
  const undoLast = useCallback(() => {
    setError(null);
    setItems((prev) => {
      const stillMarked = (k: string) => prev.some((i) => i.key === k && i.kind === "stored" && i.removed);
      marked.current = marked.current.filter(stillMarked);
      const key = marked.current[marked.current.length - 1];
      if (!key) return prev;
      marked.current = marked.current.slice(0, -1);
      return prev.map((i) => (i.key === key ? { ...i, removed: false, failed: undefined } : i));
    });
  }, []);

  /** is there anything left for Undo to undo? */
  const canUndo = items.some((i) => i.kind === "stored" && i.removed);

  /** The floor is the database's, checked against the DRAFT rather than the
   *  record: `remove_org_proof_photo` refuses a studio's last live picture, so
   *  offering a press that can only be refused is worse than not offering it.
   *  A picture already marked always keeps its control, because that control is
   *  the way back. */
  const canRemove = useCallback((item: DraftItem) => (item.kind === "stored" && item.removed ? true : keeping > min), [keeping, min]);

  const applyCommit: HeaderDraft["applyCommit"] = useCallback((result) => {
    setItems((prev) => {
      const addedByKey = new Map(result.added.map((a) => [a.key, a.row]));
      const removed = new Set(result.removed);
      const failure = new Map(result.failures.map((f) => [f.key, f.reason]));
      /* a key that has been committed or refused is no longer something Undo
         could act on — leaving it on the stack is what made Undo re-mark */
      marked.current = marked.current.filter((k) => !removed.has(k) && !failure.has(k));
      return prev
        /* a removal that went through leaves the draft entirely */
        .filter((i) => !(i.kind === "stored" && removed.has(i.key)))
        .map((i) => {
          if (i.kind === "new") {
            const row = addedByKey.get(i.key);
            if (row) {
              /* it is on the record now — a retry must not upload it twice */
              URL.revokeObjectURL(i.previewUrl);
              urls.current.delete(i.previewUrl);
              return { kind: "stored" as const, key: row.id, row, removed: false };
            }
            return { ...i, failed: failure.get(i.key) };
          }
          /* a REFUSED removal comes straight back into the grid, wearing the
             database's own sentence — never silently still marked */
          const why = failure.get(i.key);
          return why ? { ...i, removed: false, failed: why } : i;
        });
    });
  }, []);

  return {
    items,
    visible,
    keeping,
    liveCount,
    dirty: changeCount > 0,
    changeCount,
    min,
    max,
    error,
    setError,
    stage,
    unstage,
    undoLast,
    canUndo,
    canRemove,
    canAdd: keeping < max,
    applyCommit,
    disposeAll,
  };
}
