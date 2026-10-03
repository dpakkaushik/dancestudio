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
import type { Routine, RoutineClass, RoutineStudent, RoutineStudio } from "@/repositories/routines";
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

type ClassAt = RoutineClass & { studio: RoutineStudio | null };

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

/** ONE STUDIO — its face and name, and a disclosure onto what is danced there.
 *  ⚠ A real `<button aria-expanded>`, so the open state is announced and a
 *  keyboard can reach it; the classes inside stay links of their own. */
function StudioRow({ name, photoPath, href, classes, open, onToggle }: { name: string; photoPath: string | null; href: string | null; classes: ClassAt[]; open: boolean; onToggle: () => void }) {
  const sessions = classes.reduce((n, c) => n + c.sessions, 0);
  const students = classes.reduce((n, c) => n + c.students, 0);
  const styles = [...new Set(classes.map((c) => c.style))];
  const sessionMax = Math.max(1, ...classes.map((c) => c.sessions));
  return (
    <div data-testid="routine-studio" style={{ ...panel, padding: 0, overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${name} — ${classes.length} ${classes.length === 1 ? "class" : "classes"}, ${open ? "hide" : "show"} the detail`}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: `linear-gradient(135deg, ${TOOL}1f, ${TOOL}06 62%, transparent)`, border: "none", cursor: "pointer", fontFamily: "inherit", color: INK, textAlign: "left" }}
      >
        <ToolFace name={name} photoPath={photoPath} tint={TOOL} size={46} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 15, fontWeight: 900, letterSpacing: -0.2, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <span style={{ display: "block", fontSize: 11, color: SUB, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {classes.length} {classes.length === 1 ? "class" : "classes"} · {sessions} {sessions === 1 ? "session" : "sessions"}
          </span>
        </span>
        <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 14, color: SUB, transform: open ? "rotate(90deg)" : "none", transition: "transform .18s" }}>
          ›
        </span>
      </button>
      {open ? (
        <div style={{ padding: "11px 14px 12px", borderTop: "1.5px solid var(--el)" }}>
          {/* the dance styles taught from it here, each in its own colour */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {styles.map((s) => {
              const c = dosStyleColor(s);
              return (
                <span key={s} style={{ fontSize: 10, fontWeight: 900, padding: "3px 9px", borderRadius: 999, background: c, color: inkOn(c) }}>
                  {s}
                </span>
              );
            })}
          </div>
          <ToolFacts
            tint={TOOL}
            items={[
              { label: classes.length === 1 ? "Class" : "Classes", value: classes.length },
              { label: "Sessions held", value: sessions },
              { label: students === 1 ? "Student" : "Students", value: students },
            ]}
          />
          {classes.map((c) => {
            const col = dosStyleColor(c.style);
            return (
              <Link key={c.classId} href={`/c/${c.shareSlug}`} aria-label={`Open ${c.style} · ${DOS_LEVEL_LABEL[c.level] ?? c.level}`} style={{ display: "block", padding: "9px 0 8px", borderBottom: "1.5px solid var(--el)", textDecoration: "none", color: INK }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.style} · {DOS_LEVEL_LABEL[c.level] ?? c.level}
                  </b>
                  <span style={{ flexShrink: 0, fontSize: 11, color: SUB, fontVariantNumeric: "tabular-nums" }}>
                    <b style={{ color: INK }}>{c.sessions}</b> {c.sessions === 1 ? "session" : "sessions"} · <b style={{ color: INK }}>{c.students}</b> {c.students === 1 ? "student" : "students"}
                  </span>
                </span>
                <Bar value={c.sessions} max={sessionMax} tint={col} />
              </Link>
            );
          })}
          {href ? (
            <Link href={href} style={{ ...toolBtn("secondary", TOOL), marginTop: 10, width: "100%", boxSizing: "border-box" }}>
              Studio page
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
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
  show?: "classes" | "studios" | "students";
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

  /* ── THE STUDIOS, each with the classes danced there — keyed on the studio's id
     when it could be read, its name otherwise, so two studios never merge ── */
  const studios: Array<{ key: string; name: string; photoPath: string | null; href: string | null; classes: ClassAt[] }> = [];
  for (const c of classes) {
    const key = c.studio?.id ?? `name:${c.businessName}`;
    let s = studios.find((x) => x.key === key);
    if (!s) {
      s = { key, name: c.studio?.name ?? c.businessName, photoPath: c.studio?.photoPath ?? null, href: c.studio ? `/studio/${c.studio.id}` : null, classes: [] };
      studios.push(s);
    }
    s.classes.push(c);
  }
  /* busiest first; the first one opens on its own, so the column is never a
     wall of closed rows */
  studios.sort((a, b) => b.classes.reduce((n, c) => n + c.sessions, 0) - a.classes.reduce((n, c) => n + c.sessions, 0) || a.name.localeCompare(b.name));
  const [openKey, setOpenKey] = useState<string | null>(studios[0]?.key ?? null);

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
          eyebrow="Your routine"
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
          <RoutineMediaButton kind="song" href={songHref} word={routine.songIsFile && !routine.songTitle ? "MP3" : "Song"} title={routine.title} col={col} />
          <RoutineMediaButton kind="video" href={routine.videoUrl} word="Video" title={routine.title} col={col} />
        </ToolActions>
      </ToolCard>

      {err ? <div role="alert" style={{ fontSize: 12, color: "#F87171", margin: "0 2px 8px" }}>{err}</div> : null}
      {confirm ? (
        <div role="alertdialog" aria-label="Delete this routine?" style={{ ...panel, borderColor: "rgba(239,68,68,.35)", marginBottom: 0 }}>
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
              {pending ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );

  /* ── COLUMN 1: CLASSES (4 Oct 2026, the user: "routine details 1st column
     classes with class list. new column") — every class it is taught in, the
     busiest first, each a door to the class, with where it is danced ── */
  const classMax = Math.max(1, ...classes.map((c) => c.sessions));
  const classesPanel = (
    <div data-testid="routine-class-list">
      {classes.length === 0 ? (
        <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>Not on a class yet. Open a class you take and add it from the class&rsquo;s own page.</div>
      ) : (
        [...classes]
          .sort((a, b) => b.sessions - a.sessions || a.style.localeCompare(b.style))
          .map((c) => {
            const cc = dosStyleColor(c.style);
            const level = DOS_LEVEL_LABEL[c.level] ?? c.level;
            const where = c.studio?.name ?? c.businessName;
            return (
              <ToolCard key={c.classId} testId="routine-class" href={`/c/${c.shareSlug}`} hrefLabel={`Open ${c.style} · ${level}`} edge={cc}>
                <ToolBody style={{ borderTop: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 900, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.style} · {level}
                    </span>
                    {c.status === "draft" ? <ToolChip word="DRAFT" fg={SUB} bg="var(--el)" /> : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6, fontSize: 11.5, color: SUB, minWidth: 0 }}>
                    <ToolFace name={where} photoPath={c.studio?.photoPath ?? null} tint={TOOL} size={20} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{where}</span>
                  </div>
                  <ToolFacts
                    tint={cc}
                    style={{ marginTop: 10 }}
                    items={[
                      { label: "Sessions held", value: c.sessions },
                      { label: c.students === 1 ? "Student" : "Students", value: c.students },
                    ]}
                  />
                  <Bar value={c.sessions} max={classMax} tint={cc} />
                </ToolBody>
              </ToolCard>
            );
          })
      )}
    </div>
  );

  /* ── COLUMN 2: STUDIOS ── */
  const studiosPanel = (
    <div data-testid="routine-studios">
      {studios.length === 0 ? (
        <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>Not on a class yet. Open a class you take and add it from the class&rsquo;s own page.</div>
      ) : (
        studios.map((s) => <StudioRow key={s.key} name={s.name} photoPath={s.photoPath} href={s.href} classes={s.classes} open={openKey === s.key} onToggle={() => setOpenKey(openKey === s.key ? null : s.key)} />)
      )}
    </div>
  );

  /* ── COLUMN 3: STUDENTS ── */
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
          { key: "studios", href: `${base}?show=studios`, label: "Studios", n: studios.length, aria: `Where ${routine.title} is danced` },
          { key: "students", href: `${base}?show=students`, label: "Students", n: students.length, aria: `Who learned ${routine.title}` },
        ]}
        panels={[
          { key: "classes", node: classesPanel },
          { key: "studios", node: studiosPanel },
          { key: "students", node: studentsPanel },
        ]}
      />
    </div>
  );
}
