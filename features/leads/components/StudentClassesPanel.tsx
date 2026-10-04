"use client";

import { useState, type CSSProperties } from "react";

import { ClassDetailButton } from "@/components/ui/ClassDetailButton";
import { FigureHead } from "@/components/ui/FigureHead";
import { ToolChip, ToolFace, ToolFacts } from "@/components/ui/ToolCard";
import { RoutineMediaButton } from "@/features/routines/components/routine-kit";
import { FIRST_FOUR_EMPTY, StyleBadge } from "@/features/staff/components/TeamClassesPanel";
import { DOS_LEVEL_LABEL } from "@/lib/constants/styles";
import { INK, MUTED, SUB } from "@/lib/design/tokens";
import { photoUrl } from "@/lib/media/photo";
import type { StudentClass } from "@/repositories/studentRecord";

/** A STUDENT'S CLASSES HERE, IN THE TEAM PAGE'S SHAPE (4 Oct 2026, the user:
 *  "Student detail page classes section should be handled similarly to how we did
 *  for team members but in this should be relevant according to the student").
 *
 *  The same three ways in — Artist · Studio · Dance style — every group starting
 *  CLOSED, a class opening onto boxes with short names. What is RELEVANT TO A
 *  STUDENT is their own seats, so where the team page draws a room-full bar this
 *  draws their TURN-UP (checked in over checked in + missed), and the boxes are
 *  theirs: booked, checked in, missed, hours, the next or last date and time, and
 *  the routines the class teaches with their song and video.
 *
 *  ⚠ The grouping is a state, not the URL: it narrows rows already on the page. */

type GroupBy = "artist" | "studio" | "style";
const GROUPS: ReadonlyArray<readonly [GroupBy, string]> = [
  ["artist", "Artist"],
  ["studio", "Studio"],
  ["style", "Dance style"],
];

const panel: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: "13px 14px", marginBottom: 12 };
const head: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED };
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const pctTint = (p: number | null) => (p == null ? MUTED : p >= 75 ? "#22C55E" : p >= 50 ? "#F59E0B" : "#F87171");
const hoursWords = (min: number) => {
  const h = min / 60;
  return h === 0 ? "0" : h < 10 ? String(Math.round(h * 10) / 10) : String(Math.round(h));
};
/* short enough for a box: the year only when it is not this one */
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

/** their turn-up on this class — checked in over the sessions that were theirs to come to */
const turnUpOf = (c: StudentClass) => pct(c.sessions, c.sessions + c.missed);

/** the bar under a class: their turn-up, or why there is none yet */
function TurnUpBar({ c }: { c: StudentClass }) {
  const p = turnUpOf(c);
  const words = p == null ? (c.upcoming > 0 ? "First session to come" : "No session held yet") : `${p}% came`;
  return (
    <div data-testid="student-class-turnup" style={{ display: "flex", alignItems: "center", gap: 10 }} title={p == null ? words : `${c.sessions} of ${c.sessions + c.missed} sessions`}>
      <span style={{ width: 54, flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, color: MUTED }}>TURN-UP</span>
      <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--el)", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${Math.min(100, p ?? 0)}%`, height: "100%", borderRadius: 999, background: pctTint(p) }} />
      </span>
      <span style={{ flexShrink: 0, minWidth: 74, textAlign: "right", fontSize: 11, fontWeight: 800, color: p == null ? MUTED : INK, fontVariantNumeric: "tabular-nums" }}>{words}</span>
    </div>
  );
}

export function StudentClassesPanel({ classes, tint, studentName }: { classes: StudentClass[]; tint: string; studentName: string }) {
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
      <div style={{ ...panel, textAlign: "center", border: "1.5px dashed var(--el)", fontSize: 12, color: SUB, lineHeight: 1.5 }}>
        A class appears here once {studentName} books a seat on it.
      </div>
    );
  }

  const booked = classes.reduce((n, c) => n + c.booked, 0);
  const checkedIn = classes.reduce((n, c) => n + c.sessions, 0);
  const missed = classes.reduce((n, c) => n + c.missed, 0);

  const keyOf = (c: StudentClass) => (by === "artist" ? c.artist?.userId ?? "none" : by === "studio" ? c.venueName ?? "none" : c.style);
  const groups = new Map<string, StudentClass[]>();
  for (const c of classes) groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), c]);
  /* most danced first; the "no artist on record" group always last */
  const ordered = [...groups.entries()].sort(
    (a, b) => Number(a[0] === "none") - Number(b[0] === "none") || b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  return (
    <>
      {/* THEIR SEATS HERE, counted once */}
      <div style={panel}>
        <ToolFacts
          tint={tint}
          items={[
            { label: "Booked", value: booked, testId: "student-classes-booked" },
            { label: "Checked in", value: checkedIn, testId: "student-classes-checkedin" },
            { label: "Missed", value: missed, testId: "student-classes-missed", tint: missed > 0 ? "#F87171" : undefined },
          ]}
        />
      </div>

      {/* THE WAY IN — three pills, the one pressed solid */}
      <div role="group" aria-label="Group classes by" style={{ display: "flex", gap: 6, margin: "0 0 12px" }}>
        {GROUPS.map(([k, word]) => {
          const on = by === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              data-testid={`student-class-by-${k}`}
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
        const title = by === "artist" ? lead.artist?.name ?? "No artist on record" : by === "studio" ? lead.venueName ?? "Their own place" : lead.style;
        const sessions = list.reduce((n, c) => n + c.sessions, 0);
        const turnUp = pct(sessions, sessions + list.reduce((n, c) => n + c.missed, 0));
        const open = opened.has(key);
        const face =
          by === "artist" ? (
            <ToolFace name={title} photoPath={lead.artist?.photoPath} tint={tint} size={30} />
          ) : by === "studio" ? (
            <ToolFace name={title} photoPath={lead.venuePhoto} tint={tint} size={30} />
          ) : (
            <StyleBadge style={lead.style} size={30} />
          );
        return (
          <div key={key} data-testid="student-class-group" style={panel}>
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${title} — ${list.length} ${list.length === 1 ? "class" : "classes"}, ${open ? "collapse" : "expand"}`}
              data-testid="student-class-group-toggle"
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
                    {list.length} {list.length === 1 ? "CLASS" : "CLASSES"}
                    {turnUp == null ? "" : ` · ${turnUp}% CAME`}
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
                /* where they stand on it, in one word */
                const status = c.upcoming > 0 ? "BOOKED" : c.sessions > 0 ? "ATTENDED" : c.missed > 0 ? "MISSED" : "BOOKED";
                const statusTint = status === "MISSED" ? "#F87171" : tint;
                const when = c.nextAt ?? c.lastAt;
                const boxes: Array<[string, string | null, string?]> = [
                  /* ⚠ DATE · TIME · STUDIO · ARTIST, ALWAYS THE FIRST FOUR (4 Oct 2026,
                     the user: "Date Time Studio Artist always first 4 in last collapse"),
                     drawn whatever the grouping and with "—" when there is nothing */
                  ["Date", when ? dateWords(when) : FIRST_FOUR_EMPTY],
                  ["Time", when ? timeWords(when) : FIRST_FOUR_EMPTY],
                  ["Studio", c.venueName ?? FIRST_FOUR_EMPTY],
                  ["Artist", c.artist?.name ?? FIRST_FOUR_EMPTY],
                  ["Room", c.room],
                  ["Booked", String(c.booked)],
                  ["Checked in", String(c.sessions)],
                  ["Missed", c.missed > 0 ? String(c.missed) : null, "#F87171"],
                  ["Hours", c.sessions > 0 ? hoursWords(c.minutes) : null],
                ];
                return (
                  <details key={c.classId} data-testid="student-class" style={{ marginTop: 8, borderRadius: 14, border: "1.5px solid var(--el)", background: `${tint}0a` }}>
                    <summary style={{ listStyle: "none", cursor: "pointer", padding: "10px 12px", display: "block" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.style} · {level}
                        </b>
                        <ToolChip word={status} fg={statusTint} bg={`${statusTint}1c`} testId="student-class-status" />
                        <span aria-hidden="true" style={{ color: MUTED, fontSize: 12 }}>▾</span>
                      </span>
                      <span style={{ display: "block", marginTop: 8 }}>
                        <TurnUpBar c={c} />
                      </span>
                    </summary>
                    {/* EVERYTHING UNDER THE BAR IS A BOX WITH A SHORT NAME — the team
                        page's grammar; a box with nothing true to say is not drawn */}
                    <div data-testid="student-class-details" style={{ padding: "2px 12px 12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, borderTop: "1.5px solid var(--el)", paddingTop: 10 }}>
                        {boxes
                          .filter((b): b is [string, string, string?] => Boolean(b[1]))
                          .map(([label, value, color]) => (
                            <div key={label} data-testid={`student-class-box-${label.toLowerCase().replace(/\s+/g, "-")}`} style={{ borderRadius: 12, background: `${tint}0f`, border: "1.5px solid var(--el)", padding: "8px 6px 7px", textAlign: "center", minWidth: 0 }}>
                              <div title={value} style={{ fontSize: 12.5, fontWeight: 900, lineHeight: 1.2, color: value === FIRST_FOUR_EMPTY ? MUTED : color ?? INK, fontVariantNumeric: "tabular-nums", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                                {value}
                              </div>
                              <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, color: MUTED, marginTop: 3, textTransform: "uppercase" }}>{label}</div>
                            </div>
                          ))}
                      </div>
                      {/* THE ROUTINES IT TEACHES — what they learn on it, with the song and the video */}
                      {c.routines.length > 0 ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ ...head, fontSize: 9, marginBottom: 2 }}>ROUTINES</div>
                          {c.routines.map((rt) => {
                            const songHref = rt.songUrl ? (rt.songIsFile ? photoUrl(rt.songUrl) : rt.songUrl) : null;
                            return (
                              <div key={rt.routineId} data-testid="student-class-routine" style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderTop: "1px dashed var(--el)" }}>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rt.title}</span>
                                <RoutineMediaButton kind="song" href={songHref} word={rt.songIsFile && !rt.songTitle ? "MP3" : "Song"} title={rt.title} extra={{ flex: "none", padding: "5px 10px", fontSize: 10.5 }} />
                                <RoutineMediaButton kind="video" href={rt.videoUrl} word="Video" title={rt.title} extra={{ flex: "none", padding: "5px 10px", fontSize: 10.5 }} />
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      <ClassDetailButton href={`/c/${c.shareSlug}`} label={`${c.style} · ${level}`} tint={tint} testId="student-class-open" />
                    </div>
                  </details>
                );
              })}
          </div>
        );
      })}
    </>
  );
}
