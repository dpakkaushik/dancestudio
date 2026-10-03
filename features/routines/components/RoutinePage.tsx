"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFace, ToolFacts, ToolHead, toolBtn } from "@/components/ui/ToolCard";
import { FigureHead } from "@/components/ui/FigureHead";
import { DeskBody, DeskTop } from "@/components/ui/DeskSections";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { deleteRoutineAction } from "@/features/routines/server-actions/routines";
import type { Routine, RoutineClass, RoutineStudent } from "@/repositories/routines";
import { RoutineMediaButton } from "./routine-kit";

/** ONE ROUTINE, AND WHAT IT HAS BEEN USED FOR (19 Sep 2026; re-cut 3 Oct 2026,
 *  the user: *"better designed inside routine detail page according to new design
 *  according to routine cards. better placement of buttons for it"*).
 *
 *  ⚠ IT IS THE ROUTINE CARD, OPENED. The same three bands the card on the desk
 *  has — whoever made it at a profile's size, then the routine in its style's
 *  colour with its three figures, then the Song and the Video on the card's own
 *  action bar — so pressing a card and landing here reads as one object getting
 *  bigger, not a second screen about the same thing. Under it, the two lists the
 *  figures count (the prototype's S_routinedetail, 17215):
 *   · TAUGHT IN — the classes it is on, each with its sessions and dancers;
 *   · DANCERS WHO LEARNED IT — the people CHECKED IN, never the people who
 *     booked (Step 25's rule).
 *
 *  ⚠ BUTTON PLACEMENT, which is half of the ask: the two you reach for (the
 *  song, the video) are on the bar under the figures, where the card has them;
 *  the one you rarely want and cannot undo (Delete) is alone at the foot,
 *  behind a confirm, in danger ink — never beside the media. */

const panel: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: "13px 14px", marginBottom: 12 };
const head: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED };
const TOOL = DOS_TOOLS.routines.c;

function Section({ title, figure, children }: { title: string; figure: number; children: ReactNode }) {
  return (
    <div style={panel}>
      <FigureHead margin="0 0 8px" title={<span style={head}>{title}</span>} figure={<span style={{ ...head, fontVariantNumeric: "tabular-nums" }}>{figure}</span>} />
      {children}
    </div>
  );
}

/** a thin bar rounded at the data end — how a row compares with the busiest */
function Bar({ value, max, tint }: { value: number; max: number; tint: string }) {
  const w = max > 0 ? Math.max(value > 0 ? 6 : 0, Math.round((value / max) * 100)) : 0;
  return (
    <span aria-hidden="true" style={{ display: "block", height: 6, borderRadius: 999, background: "var(--el)", overflow: "hidden", marginTop: 6 }}>
      <span style={{ display: "block", width: `${w}%`, height: "100%", borderRadius: 999, background: tint }} />
    </span>
  );
}

export function RoutinePage({
  routine,
  classes,
  students,
  maker,
}: {
  routine: Routine;
  classes: RoutineClass[];
  students: RoutineStudent[];
  /** WHO MADE IT — the profile the routine is linked to, as on its card */
  maker: { userId: string; name: string; photoPath: string | null };
}) {
  const router = useRouter();
  const col = dosStyleColor(routine.style);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const songHref = routine.songUrl ? (routine.songIsFile ? photoUrl(routine.songUrl) : routine.songUrl) : null;
  /* the sessions that have run, over every class it is on */
  const sessions = classes.reduce((n, c) => n + c.sessions, 0);
  const classMax = Math.max(1, ...classes.map((c) => c.sessions));
  const dancerMax = Math.max(1, ...students.map((s) => s.sessions));
  const live = routine.status !== "draft";

  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      {/* ⚠ THE TOP SECTION (C116) holds the card itself — the routine IS what
          chooses everything below it */}
      <DeskTop style={{ margin: "0 0 12px", paddingBottom: 2 }}>
        <ToolCard testId="routine-detail">
          <ToolHead
            tint={TOOL}
            name={maker.name}
            photoPath={maker.photoPath}
            href={`/person/${maker.userId}`}
            hrefLabel={`${maker.name} — profile`}
            eyebrow="Your routine"
            size={52}
            right={<ToolChip word={live ? "LIVE" : "DRAFT"} fg={live ? "#22C55E" : SUB} bg={live ? "#22C55E1c" : "var(--el)"} />}
          />
          <ToolBody>
            {/* the routine itself — its style as a pill in the style's own colour */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontWeight: 900, padding: "4px 10px", borderRadius: 999, background: `linear-gradient(135deg, ${col}, ${col}bb)`, color: "#fff" }}>{routine.style}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: "var(--el)", color: SUB }}>{DOS_LEVEL_LABEL[routine.level] ?? routine.level}</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase", marginBottom: 3 }}>Routine</div>
            {/* the page's own <h1> — the chrome prints no drill page's name (28 Sep) */}
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: -0.4, lineHeight: 1.2, overflowWrap: "anywhere" }}>{routine.title}</h1>
            {routine.songTitle ? <div style={{ fontSize: 11.5, color: SUB, marginTop: 4 }}>♪ {routine.songTitle}</div> : null}
            <ToolFacts
              tint={col}
              style={{ marginTop: 12 }}
              items={[
                { label: classes.length === 1 ? "Class" : "Classes", value: classes.length, testId: "routine-classes" },
                { label: "Sessions held", value: sessions, testId: "routine-sessions" },
                { label: students.length === 1 ? "Dancer" : "Dancers", value: students.length, testId: "routine-dancers" },
              ]}
            />
            <div style={{ fontSize: 10.5, color: SUB, lineHeight: 1.5, marginTop: 8 }}>Sessions that have ended, and the people checked in to them — not the people who booked.</div>
          </ToolBody>
          <ToolActions>
            <RoutineMediaButton kind="song" href={songHref} word={routine.songTitle ? "Play song" : routine.songIsFile ? "Play MP3" : "Song"} title={routine.title} col={col} />
            <RoutineMediaButton kind="video" href={routine.videoUrl} word="Watch video" title={routine.title} col={col} />
          </ToolActions>
        </ToolCard>
      </DeskTop>

      <DeskBody style={{ margin: 0 }}>
        <Section title="TAUGHT IN" figure={classes.length}>
          {classes.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB, padding: "4px 0", lineHeight: 1.5 }}>Not on a class yet. Open a class you take and add it from the class&rsquo;s own page.</div>
          ) : (
            classes.map((c) => (
              <Link key={c.classId} href={`/c/${c.shareSlug}`} aria-label={`Open ${c.style} · ${DOS_LEVEL_LABEL[c.level] ?? c.level}`} style={{ display: "block", padding: "9px 0", borderBottom: "1.5px solid var(--el)", textDecoration: "none", color: INK }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: "block", fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.style} · {DOS_LEVEL_LABEL[c.level] ?? c.level}
                    </b>
                    <span style={{ display: "block", color: SUB, fontSize: 10.5, marginTop: 1 }}>{c.businessName}</span>
                  </span>
                  <span style={{ flexShrink: 0, textAlign: "right", fontSize: 11, color: SUB, fontVariantNumeric: "tabular-nums" }}>
                    <b style={{ color: INK }}>{c.sessions}</b> {c.sessions === 1 ? "session" : "sessions"}
                    <span style={{ display: "block", fontSize: 10.5 }}>
                      {c.students} {c.students === 1 ? "dancer" : "dancers"}
                    </span>
                  </span>
                </span>
                <Bar value={c.sessions} max={classMax} tint={col} />
              </Link>
            ))
          )}
        </Section>

        <Section title="DANCERS WHO LEARNED IT" figure={students.length}>
          {students.length === 0 ? (
            <div style={{ fontSize: 11.5, color: SUB, padding: "4px 0", lineHeight: 1.5 }}>Nobody has danced it yet. A dancer appears here once they are checked in to a session taught from it.</div>
          ) : (
            students.map((s) => (
              <Link key={s.userId} href={`/person/${s.userId}`} aria-label={`Open ${s.name}'s profile`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1.5px solid var(--el)", textDecoration: "none", color: INK }}>
                <ToolFace name={s.name} photoPath={s.avatarPath} tint={col} size={36} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</b>
                    <span style={{ flexShrink: 0, fontSize: 11, color: SUB, fontVariantNumeric: "tabular-nums" }}>
                      <b style={{ color: INK }}>{s.sessions}</b> {s.sessions === 1 ? "session" : "sessions"}
                    </span>
                  </span>
                  {s.city ? <span style={{ display: "block", fontSize: 10.5, color: SUB, marginTop: 1 }}>{s.city}</span> : null}
                  <Bar value={s.sessions} max={dancerMax} tint={col} />
                </span>
              </Link>
            ))
          )}
        </Section>

        {/* ── THE ONE THING THAT CANNOT BE UNDONE, ALONE AT THE FOOT ── */}
        {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", margin: "0 2px 8px" }}>{err}</div> : null}
        {confirm ? (
          <div role="alertdialog" aria-label="Delete this routine?" style={{ ...panel, borderColor: "rgba(239,68,68,.35)" }}>
            <b style={{ fontSize: 15 }}>Delete this routine?</b>
            <div style={{ fontSize: 11.5, color: SUB, margin: "5px 0 12px", lineHeight: 1.5 }}>
              {routine.title} · on {classes.length} {classes.length === 1 ? "class" : "classes"}. The classes keep running; the routine comes off them.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setConfirm(false)} style={toolBtn("secondary", col)}>
                Keep it
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const out = await deleteRoutineAction({ routineId: routine.id });
                    if (out.error) {
                      setErr(out.error);
                      setConfirm(false);
                      return;
                    }
                    router.push("/routines");
                  })
                }
                style={toolBtn("primary", "#DC2626", { flex: "1.3 1 0" })}
              >
                {pending ? "Deleting…" : "Delete routine"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 4 }}>
            <button type="button" onClick={() => setConfirm(true)} style={toolBtn("danger", col, { flex: "0 0 auto", padding: "9px 18px", fontSize: 11.5 })}>
              Delete routine
            </button>
          </div>
        )}
      </DeskBody>
    </div>
  );
}
