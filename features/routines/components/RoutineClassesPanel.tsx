"use client";

import { useState, type CSSProperties } from "react";

import { ClassDetailButton } from "@/components/ui/ClassDetailButton";
import { FigureHead } from "@/components/ui/FigureHead";
import { ToolChip, ToolFace } from "@/components/ui/ToolCard";
import { FIRST_FOUR_EMPTY, StyleBadge } from "@/features/staff/components/TeamClassesPanel";
import { DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { INK, MUTED, SUB } from "@/lib/design/tokens";
import type { RoutineClass, RoutineClassFacts, RoutineStudio } from "@/repositories/routines";

/** one class the routine is taught in, with what the page reads beside the RPC */
export type RoutineClassAt = RoutineClass & {
  studio: RoutineStudio | null;
  artist: { userId: string; name: string; photoPath: string | null } | null;
  facts: RoutineClassFacts | null;
};

/** A ROUTINE'S CLASSES, IN THE TEAM AND STUDENT PAGES' SHAPE (4 Oct 2026, the user:
 *  "Classes section to be managed how we did for student detail and team member
 *  detail. make sure to make it according to details relevant for a routine").
 *
 *  The same three ways in, every group starting CLOSED, a class opening onto boxes
 *  with short names. What is RELEVANT TO A ROUTINE is how far it has been TAUGHT:
 *  the bar under a class is its sessions taught out of all it has, and the boxes
 *  are who teaches it, where, how many sessions it was taught in, how many students
 *  learned it there (checked in — Step 25's rule), and the next or last date and
 *  time. The Studios column this replaces is the Studio grouping here. */

type GroupBy = "artist" | "studio" | "style";
const GROUPS: ReadonlyArray<readonly [GroupBy, string]> = [
  ["artist", "Artist"],
  ["studio", "Studio"],
  ["style", "Dance style"],
];

const panel: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: "13px 14px", marginBottom: 12 };
const head: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED };
const dateWords = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const year = (x: Date) => x.toLocaleDateString("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" });
  const sameYear = year(d) === year(new Date());
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "Asia/Kolkata" });
};
const timeWords = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
};

/** the bar under a class: its sessions taught out of all it has */
function TaughtBar({ c, tint }: { c: RoutineClassAt; tint: string }) {
  const total = Math.max(c.facts?.total ?? 0, c.sessions);
  const p = total > 0 ? Math.round((c.sessions / total) * 100) : null;
  const words = total === 0 ? "No session dated yet" : `${c.sessions} of ${total} taught`;
  return (
    <div data-testid="routine-class-taught" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 50, flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, color: MUTED }}>TAUGHT</span>
      <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--el)", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${Math.min(100, p ?? 0)}%`, height: "100%", borderRadius: 999, background: tint }} />
      </span>
      <span style={{ flexShrink: 0, minWidth: 74, textAlign: "right", fontSize: 11, fontWeight: 800, color: total === 0 ? MUTED : INK, fontVariantNumeric: "tabular-nums" }}>{words}</span>
    </div>
  );
}

export function RoutineClassesPanel({ classes, tint }: { classes: RoutineClassAt[]; tint: string }) {
  const [by, setBy] = useState<GroupBy>("artist");
  /* the groups OPENED — every group starts closed, and so does a new grouping */
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (classes.length === 0) {
    return (
      <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 11.5, color: SUB, lineHeight: 1.5 }}>
        Not on a class yet. Open a class you take and add it from the class&rsquo;s own page.
      </div>
    );
  }

  const where = (c: RoutineClassAt) => c.studio?.name ?? c.businessName;
  const keyOf = (c: RoutineClassAt) => (by === "artist" ? c.artist?.userId ?? "none" : by === "studio" ? c.studio?.id ?? `name:${c.businessName}` : c.style);
  const groups = new Map<string, RoutineClassAt[]>();
  for (const c of classes) groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), c]);
  /* most taught first; "no artist on record" last */
  const taughtOf = (l: RoutineClassAt[]) => l.reduce((n, c) => n + c.sessions, 0);
  const ordered = [...groups.entries()].sort(
    (a, b) => Number(a[0] === "none") - Number(b[0] === "none") || taughtOf(b[1]) - taughtOf(a[1]) || a[0].localeCompare(b[0]),
  );

  return (
    <div data-testid="routine-class-list">
      {/* THE WAY IN — three pills, the one pressed solid */}
      <div role="group" aria-label="Group classes by" style={{ display: "flex", gap: 6, margin: "0 0 12px" }}>
        {GROUPS.map(([k, word]) => {
          const on = by === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              data-testid={`routine-class-by-${k}`}
              onClick={() => {
                setBy(k);
                setOpened(new Set());
              }}
              style={{ flex: 1, padding: "9px 10px", borderRadius: 999, fontSize: 12, fontWeight: 900, fontFamily: "inherit", cursor: "pointer", background: on ? "var(--text)" : "var(--card)", color: on ? "var(--solid)" : SUB, border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}` }}
            >
              {word}
            </button>
          );
        })}
      </div>

      {ordered.map(([key, list]) => {
        const lead = list[0];
        const title = by === "artist" ? lead.artist?.name ?? "No artist on record" : by === "studio" ? where(lead) : lead.style;
        const taught = taughtOf(list);
        const open = opened.has(key);
        const face =
          by === "artist" ? (
            <ToolFace name={title} photoPath={lead.artist?.photoPath} tint={tint} size={30} />
          ) : by === "studio" ? (
            <ToolFace name={title} photoPath={lead.studio?.photoPath} tint={tint} size={30} />
          ) : (
            <StyleBadge style={lead.style} size={30} />
          );
        return (
          <div key={key} data-testid="routine-class-group" style={panel}>
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${title} — ${list.length} ${list.length === 1 ? "class" : "classes"}, ${open ? "collapse" : "expand"}`}
              data-testid="routine-class-group-toggle"
              onClick={() => toggle(key)}
              style={{ display: "block", width: "100%", padding: 0, margin: 0, background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit" }}
            >
              <FigureHead
                align="center"
                margin={open ? "0 0 8px" : "0"}
                title={
                  <>
                    {face}
                    <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: -0.2, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                  </>
                }
                figure={
                  <span style={{ ...head, fontVariantNumeric: "tabular-nums" }}>
                    {list.length} {list.length === 1 ? "CLASS" : "CLASSES"} · {taught} TAUGHT
                  </span>
                }
                after={
                  <span aria-hidden="true" style={{ color: MUTED, fontSize: 12, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
                    ▾
                  </span>
                }
              />
            </button>
            {open &&
              list.map((c) => {
                const level = DOS_LEVEL_LABEL[c.level] ?? c.level;
                const f = c.facts;
                /* where the class stands, in one word */
                const status = c.status === "draft" ? "DRAFT" : f?.upcoming ? "RUNNING" : c.sessions > 0 ? "COMPLETED" : "PUBLISHED";
                const statusTint = status === "DRAFT" ? SUB : status === "COMPLETED" ? "#F87171" : "#22C55E";
                const when = f?.nextAt ?? f?.lastAt ?? null;
                const boxes: Array<[string, string | null]> = [
                  /* ⚠ DATE · TIME · STUDIO · ARTIST, ALWAYS THE FIRST FOUR (4 Oct 2026,
                     the user: "Date Time Studio Artist always first 4 in last collapse"),
                     drawn whatever the grouping and with "—" when there is nothing */
                  ["Date", when ? dateWords(when) : FIRST_FOUR_EMPTY],
                  ["Time", when ? timeWords(when) : FIRST_FOUR_EMPTY],
                  ["Studio", where(c) || FIRST_FOUR_EMPTY],
                  ["Artist", c.artist?.name ?? FIRST_FOUR_EMPTY],
                  ["Room", f?.room ?? null],
                  ["Taught", String(c.sessions)],
                  ["Students", String(c.students)],
                  ["To come", f?.upcoming ? String(f.upcoming) : null],
                ];
                return (
                  <details key={c.classId} data-testid="routine-class" style={{ marginTop: 8, borderRadius: 14, border: "1.5px solid var(--el)", background: `${tint}0a`, opacity: c.status === "draft" ? 0.8 : 1 }}>
                    <summary style={{ listStyle: "none", cursor: "pointer", padding: "10px 12px", display: "block" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.style} · {level}
                        </b>
                        <ToolChip word={status} fg={statusTint} bg={status === "DRAFT" ? "var(--el)" : `${statusTint}1c`} testId="routine-class-status" />
                        <span aria-hidden="true" style={{ color: MUTED, fontSize: 12 }}>▾</span>
                      </span>
                      <span style={{ display: "block", marginTop: 8 }}>
                        <TaughtBar c={c} tint={tint} />
                      </span>
                    </summary>
                    <div data-testid="routine-class-details" style={{ padding: "2px 12px 12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, borderTop: "1.5px solid var(--el)", paddingTop: 10 }}>
                        {boxes
                          .filter((b): b is [string, string] => Boolean(b[1]))
                          .map(([label, value]) => (
                            <div key={label} data-testid={`routine-class-box-${label.toLowerCase().replace(/\s+/g, "-")}`} style={{ borderRadius: 12, background: `${tint}0f`, border: "1.5px solid var(--el)", padding: "8px 6px 7px", textAlign: "center", minWidth: 0 }}>
                              <div title={value} style={{ fontSize: 12.5, fontWeight: 900, lineHeight: 1.2, color: value === FIRST_FOUR_EMPTY ? MUTED : INK, fontVariantNumeric: "tabular-nums", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                                {value}
                              </div>
                              <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, color: MUTED, marginTop: 3, textTransform: "uppercase" }}>{label}</div>
                            </div>
                          ))}
                      </div>
                      <ClassDetailButton href={`/c/${c.shareSlug}`} label={`${c.style} · ${level}`} tint={tint} testId="routine-class-open" />
                    </div>
                  </details>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
