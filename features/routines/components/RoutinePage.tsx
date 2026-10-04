"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { ToolActions, ToolBody, ToolCard, ToolChip, ToolFace, ToolFacts, ToolHead, inkOn, toolBtn } from "@/components/ui/ToolCard";
import { FigureHead } from "@/components/ui/FigureHead";
import { SegmentedPanels } from "@/features/shell/components/SegmentedNav";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { DOS_LEVEL_LABEL, dosStyleColor } from "@/lib/constants/styles";
import { DOS_UI, INK, LILAC, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import { deleteRoutineAction } from "@/features/routines/server-actions/routines";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Routine, RoutineStudent } from "@/repositories/routines";
import { RoutineClassesPanel, type RoutineClassAt } from "./RoutineClassesPanel";
import { RoutineMediaButton } from "./routine-kit";

/** ONE ROUTINE, AND WHAT IT HAS BEEN USED FOR (19 Sep 2026; re-cut 3 Oct 2026 on
 *  the routine card; and again 4 Oct 2026, the user: *"Routine written above
 *  routine name … to be removed, bigger routine name, coloured song and video
 *  buttons, watch Video button should only be Video. Taught in section should be
 *  separate column named Studios with studio profile pic and name in collapsible
 *  detail with dance styles and figures. 2nd column should be Students with list
 *  of students who learned it, remove detail above song and video button …
 *  delete routine button on top right and should just say delete"*).
 *
 *  ⚠ THE STUDIOS COLUMN IS GONE (4 Oct 2026) — its Studio grouping lives inside
 *  Classes now. What follows is the history of the three:
 *  ⚠ IT IS THE ROUTINE CARD, OPENED, and then THREE COLUMNS — CLASSES first
 *  since 4 Oct 2026 (every class it is taught in, a card each), then:
 *   · STUDIOS — where it is danced, a studio per row with its face and name,
 *     each opening onto the styles taught there, its figures and its classes;
 *   · STUDENTS — the people CHECKED IN to a session taught from it, never the
 *     people who booked (Step 25's rule).
 *
 *  ⚠ DELETE IS ON THE CARD'S TOP RIGHT, ONE WORD, behind a confirm in danger
 *  ink — still never beside the Song and the Video, which are what you reach for. */

const panel: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: "13px 14px", marginBottom: 12 };
const head: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED };
const TOOL = DOS_TOOLS.routines.c;

type ClassAt = RoutineClassAt;

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
  show = "classes",
}: {
  routine: Routine;
  classes: ClassAt[];
  students: RoutineStudent[];
  /** WHO MADE IT — the profile the routine is linked to, as on its card */
  maker: { userId: string; name: string; photoPath: string | null };
  /** the column the server opens on, from `?show=` */
  show?: "classes" | "students";
}) {
  const router = useRouter();
  const col = dosStyleColor(routine.style);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const songHref = routine.songUrl ? (routine.songIsFile ? photoUrl(routine.songUrl) : routine.songUrl) : null;
  /* the sessions that have run, over every class it is on */
  const sessions = classes.reduce((n, c) => n + c.sessions, 0);
  const dancerMax = Math.max(1, ...students.map((s) => s.sessions));
  const live = routine.status !== "draft";

  /* ── TOP: THE CARD, OPENED ── */
  const top = (
    <>
      <ToolCard testId="routine-detail">
        <ToolHead
          tint={TOOL}
          name={maker.name}
          photoPath={maker.photoPath}
          href={`/person/${maker.userId}`}
          hrefLabel={`${maker.name} — profile`}
          eyebrow="Routine"
          size={46}
          right={
            <>
              <ToolChip word={live ? "LIVE" : "DRAFT"} fg={live ? "#22C55E" : SUB} bg={live ? "#22C55E1c" : "var(--el)"} />
              {/* ⚠ ONE WORD, TOP RIGHT (4 Oct 2026) — and still behind a confirm */}
              <button type="button" onClick={() => setConfirm(true)} aria-label={`Delete ${routine.title}`} style={toolBtn("danger", col, { flex: "0 0 auto", padding: "5px 11px", fontSize: 11 })}>
                Delete
              </button>
            </>
          }
        />
        <ToolBody>
          {/* the page's own <h1> — the chrome prints no drill page's name (28 Sep);
              ⚠ no "ROUTINE" kicker over it any more (4 Oct 2026) */}
          <h1 style={{ margin: 0, fontSize: 27, fontWeight: 900, letterSpacing: -0.6, lineHeight: 1.15, overflowWrap: "anywhere" }}>{routine.title}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, padding: "4px 10px", borderRadius: 999, background: col, color: inkOn(col) }}>{routine.style}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: "4px 10px", borderRadius: 999, background: "var(--el)", color: SUB }}>{DOS_LEVEL_LABEL[routine.level] ?? routine.level}</span>
            {routine.songTitle ? <span style={{ fontSize: 11.5, color: SUB, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>♪ {routine.songTitle}</span> : null}
          </div>
          {/* ⚠ the figures sit directly over the buttons — the sentence that used to
              explain them is gone (4 Oct 2026); the Students column says it where
              it is the list's own rule */}
          <ToolFacts
            tint={col}
            style={{ marginTop: 12 }}
            items={[
              { label: classes.length === 1 ? "Class" : "Classes", value: classes.length, testId: "routine-classes" },
              { label: "Sessions held", value: sessions, testId: "routine-sessions" },
              { label: students.length === 1 ? "Student" : "Students", value: students.length, testId: "routine-dancers" },
            ]}
          />
        </ToolBody>
        <ToolActions>
          <RoutineMediaButton kind="song" href={songHref} word={routine.songIsFile && !routine.songTitle ? "MP3" : "Song"} title={routine.title} />
          <RoutineMediaButton kind="video" href={routine.videoUrl} word="Video" title={routine.title} />
        </ToolActions>
      </ToolCard>

      {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", margin: "0 2px 8px" }}>{err}</div> : null}
      {/* ⚠ A CENTRED QUESTION (4 Oct 2026, the user: "should confirm before
          deleting a routine") — it was an inline panel under the card, which on a
          phone sat below the fold, so pressing Delete seemed to do nothing */}
      {confirm ? (
        <ConfirmDialog
          title="Delete this routine?"
          body={`${routine.title} · on ${classes.length} ${classes.length === 1 ? "class" : "classes"}. The classes keep running; the routine comes off them.`}
          goWord="Delete"
          busy={pending}
          onKeep={() => setConfirm(false)}
          onGo={() =>
            start(async () => {
              const out = await deleteRoutineAction({ routineId: routine.id });
              if (out.error) {
                setErr(out.error);
                setConfirm(false);
                return;
              }
              /* the dialog spends its own history entry as it closes; the move to
                 the desk is a beat behind it (the 600 ms every sheet here uses) */
              setConfirm(false);
              setTimeout(() => router.replace("/routines"), 600);
            })
          }
        />
      ) : null}
    </>
  );

  /* ── COLUMN 1: CLASSES (4 Oct 2026, the user: "Routine detail - remove studio
     section. Classes section to be managed how we did for student detail and team
     member detail … according to details relevant for a routine") — grouped by
     Artist · Studio · Dance style, every group closed, each class opening onto
     its boxes. The Studios column it replaces is its Studio grouping. ── */
  const classesPanel = <RoutineClassesPanel classes={classes} tint={TOOL} />;

  /* ── COLUMN 2: STUDENTS ── */
  const studentsPanel = (
    <Section title="STUDENTS WHO LEARNED IT" figure={students.length}>
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
  );

  const base = `/routines/${routine.id}`;
  return (
    <div style={{ background: LILAC, color: INK, maxWidth: 430, margin: "0 auto", fontFamily: DOS_UI, minHeight: "100vh", padding: "14px 16px 40px", boxSizing: "border-box" }}>
      <SegmentedPanels
        key={show}
        initial={show}
        label="Show"
        sections
        top={top}
        segments={[
          { key: "classes", href: `${base}?show=classes`, label: "Classes", n: classes.length, aria: `Classes that teach ${routine.title}` },
          { key: "students", href: `${base}?show=students`, label: "Students", n: students.length, aria: `Who learned ${routine.title}` },
        ]}
        panels={[
          { key: "classes", node: classesPanel },
          { key: "students", node: studentsPanel },
        ]}
      />
    </div>
  );
}
