"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { INK, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { addClassRoutineAction, removeClassRoutineAction } from "@/features/routines/server-actions/routines";
import type { Routine } from "@/repositories/routines";

/** THE ROUTINES ON A CLASS (19 Sep 2026, the user: "Artist should be able to add
 *  Routines from the class detail page and should be visible").
 *
 *  The prototype picks a routine on the class page rather than typing one
 *  (12334-12343: "a routine is a thing you already made, in Routines — it is
 *  chosen here, never typed"), and that is the rule here: the picker offers
 *  YOUR OWN routines, and the database refuses anybody else's. Who may change
 *  this is the class's confirmed artist or the business's owner; everybody who
 *  can read the class reads the song and the video. */

const box: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1.5px solid var(--el)" };
const chipLink = (tint: string): CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, background: `${tint}1c`, border: `1.5px solid ${tint}44`, color: tint, fontSize: 9.5, fontWeight: 800, textDecoration: "none", whiteSpace: "nowrap" });

export function ClassRoutines({
  classId,
  shareSlug,
  col,
  routines,
  mine,
  canEdit,
}: {
  classId: string;
  shareSlug: string;
  col: string;
  /** what is on the class now — anybody who can read the class reads these */
  routines: Routine[];
  /** the caller's own routines, for the picker; empty for everybody else */
  mine: Routine[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pick, setPick] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const on = new Set(routines.map((r) => r.id));
  const offered = mine.filter((r) => !on.has(r.id));

  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => {
      setErr(null);
      const out = await fn();
      if (out.error) {
        setErr(out.error);
        return;
      }
      setPick(false);
      router.refresh();
    });

  return (
    <>
      {routines.map((r) => {
        const songHref = r.songUrl ? (r.songIsFile ? photoUrl(r.songUrl) : r.songUrl) : null;
        return (
          <div key={r.id} style={box}>
            <span aria-hidden="true" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 10, background: `${col}22`, color: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
              ▶
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                {songHref ? (
                  <a href={songHref} target="_blank" rel="noreferrer" aria-label={`Open the song for ${r.title}`} style={chipLink("#22C55E")}>
                    ♪ {r.songTitle ?? (r.songIsFile ? "MP3" : "Song")}
                  </a>
                ) : null}
                {r.videoUrl ? (
                  <a href={r.videoUrl} target="_blank" rel="noreferrer" aria-label={`Open the video for ${r.title}`} style={chipLink("#8B5CF6")}>
                    ▶ Video
                  </a>
                ) : null}
              </span>
            </span>
            {canEdit ? (
              <button type="button" disabled={pending} aria-label={`Take ${r.title} off this class`} onClick={() => run(() => removeClassRoutineAction({ classId, routineId: r.id, shareSlug }))} style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: SUB, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Remove
              </button>
            ) : null}
          </div>
        );
      })}

      {routines.length === 0 && !canEdit ? <div style={{ fontSize: 11, color: "var(--muted)", padding: "6px 0" }}>No routine on this class.</div> : null}

      {canEdit ? (
        pick ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, color: "var(--muted)", marginBottom: 6 }}>WHICH ROUTINE?</div>
            {offered.length === 0 ? (
              <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5 }}>
                {mine.length === 0 ? "You have no routines yet — " : "All of your routines are already on this class — "}
                <Link href="/routines" style={{ color: col, fontWeight: 800 }}>
                  make one in Routines ›
                </Link>
              </div>
            ) : (
              offered.map((r) => (
                <button key={r.id} type="button" disabled={pending} onClick={() => run(() => addClassRoutineAction({ classId, routineId: r.id, shareSlug }))} aria-label={`Put ${r.title} on this class`} style={{ display: "flex", width: "100%", alignItems: "center", gap: 9, textAlign: "left", padding: "9px 10px", marginBottom: 6, borderRadius: 12, background: "var(--el)", border: "none", cursor: "pointer", fontFamily: "inherit", color: INK }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 800 }}>{r.title}</span>
                    <span style={{ display: "block", fontSize: 10, color: SUB }}>
                      {r.style} · {DOS_LEVEL_LABEL[r.level]}
                    </span>
                  </span>
                  <span aria-hidden="true" style={{ color: col, fontSize: 11, fontWeight: 900 }}>
                    Add
                  </span>
                </button>
              ))
            )}
            <button type="button" onClick={() => setPick(false)} style={{ fontSize: 10.5, fontWeight: 800, color: SUB, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 0" }}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setPick(true)} aria-label="Add a routine to this class" style={{ display: "block", width: "100%", marginTop: 8, padding: "10px", borderRadius: 12, border: "1.5px dashed var(--el)", background: "none", color: col, fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            ＋ Add a routine
          </button>
        )
      ) : null}

      {err ? (
        <div role="alert" style={{ fontSize: 10.5, color: "#F87171", marginTop: 7 }}>
          {err}
        </div>
      ) : null}
    </>
  );
}
