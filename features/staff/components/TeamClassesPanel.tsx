"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

import { FigureHead } from "@/components/ui/FigureHead";
import { ToolChip, ToolFace, ToolFacts } from "@/components/ui/ToolCard";
import { INK, MUTED, SUB } from "@/lib/design/tokens";
import type { TeamMemberClass } from "@/repositories/teamMemberWork";

/** THEIR CLASSES HERE, REHAULED (4 Oct 2026, the user: *"Classes section in team-
 *  filter to view class - Artist wise, Studio wise, Dance Style Wise with details
 *  for class and bar for room full %. detail to view difference between classes
 *  created by Studio or artist. difference according to role in class for that
 *  particular team. give classes a rehaul. should only show classes relevant to
 *  that particular team in this section."*).
 *
 *  ONE LIST, THREE WAYS TO GROUP IT — by who takes the class, by the studio it is
 *  held at, by its dance style. Every class says the three things that tell it
 *  apart at a glance: WHO MADE IT (this business, or the member's own artist
 *  page holding it here), THEIR ROLE ON IT (teaches / assists), and HOW FULL
 *  THE ROOM IS, as a bar. Everything else is behind its <details>.
 *
 *  ⚠ The grouping is a state, not the URL: it narrows rows already on the page
 *  and reads nothing (the Inbox's filters, 3 Oct 2026). */

type GroupBy = "artist" | "studio" | "style";
const GROUPS: ReadonlyArray<readonly [GroupBy, string]> = [
  ["artist", "Artist"],
  ["studio", "Studio"],
  ["style", "Dance style"],
];

const panel: CSSProperties = { background: "var(--card)", border: "1.5px solid var(--el)", borderRadius: 18, padding: "13px 14px", marginBottom: 12 };
const head: CSSProperties = { fontSize: 10, fontWeight: 900, letterSpacing: 1, color: MUTED };
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const pctTint = (p: number | null, good = 75, ok = 50) => (p == null ? MUTED : p >= good ? "#22C55E" : p >= ok ? "#F59E0B" : "#F87171");
/* a session's DATE and TIME as two answers (4 Oct 2026, the user: "next/ last
   should be date and Time"), both in IST */
const dateWords = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  /* short enough for a box: the year only when it is not this one */
  const year = (x: Date) => x.toLocaleDateString("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" });
  const sameYear = year(d) === year(new Date());
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "Asia/Kolkata" });
};
const timeWords = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
};

/** the room-full bar — booked seats over capacity, with the figure beside it */
function FillBar({ c }: { c: TeamMemberClass }) {
  const p = pct(c.fillBooked, c.fillSeats);
  const tint = pctTint(p, 70, 40);
  const words = p == null ? "No session yet" : `${p}% full${c.fillBasis === "upcoming" ? " so far" : ""}`;
  return (
    <div data-testid="team-class-fill" style={{ display: "flex", alignItems: "center", gap: 10 }} title={p == null ? "No session to measure" : `${c.fillBooked} of ${c.fillSeats} seats booked`}>
      <span style={{ width: 66, flexShrink: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: 0.5, color: MUTED }}>ROOM FULL</span>
      <span aria-hidden="true" style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--el)", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${Math.min(100, p ?? 0)}%`, height: "100%", borderRadius: 999, background: tint }} />
      </span>
      <span style={{ flexShrink: 0, minWidth: 74, textAlign: "right", fontSize: 11, fontWeight: 800, color: p == null ? MUTED : INK, fontVariantNumeric: "tabular-nums" }}>{words}</span>
    </div>
  );
}

export function TeamClassesPanel({
  classes,
  tint,
  memberName,
  businessName,
  isStudio,
}: {
  classes: TeamMemberClass[];
  tint: string;
  memberName: string;
  businessName: string;
  /** a studio says "the studio"; an artist page says its own name */
  isStudio: boolean;
}) {
  const [by, setBy] = useState<GroupBy>("artist");
  /* the groups OPENED — every group starts closed, and the set is cleared when
     the way in changes, so a new grouping is closed too */
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
        Not on a class here yet. Put them on one from the class form or the class page.
      </div>
    );
  }

  const first = memberName.split(/\s+/)[0] || memberName;
  const madeHere = classes.filter((c) => c.origin === "business").length;
  const theirs = classes.length - madeHere;
  const takes = classes.filter((c) => c.kind === "artist").length;
  const assists = classes.length - takes;
  const madeByWords = (c: TeamMemberClass) => (c.origin === "member" ? `Created by ${memberName}` : isStudio ? "Created by the studio" : `Created by ${businessName}`);

  /* the groups for the chosen way in, biggest first */
  const keyOf = (c: TeamMemberClass) => (by === "artist" ? c.artistUserId ?? "none" : by === "studio" ? c.venueName ?? "none" : c.style);
  const groups = new Map<string, TeamMemberClass[]>();
  for (const c of classes) groups.set(keyOf(c), [...(groups.get(keyOf(c)) ?? []), c]);
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  return (
    <>
      {/* WHAT KIND OF CLASSES THESE ARE, counted once — by who made them and by their role */}
      {/* ⚠ The "who made it" split is a STUDIO's alone (4 Oct 2026): a member's own
          artist-page classes can only be held in a studio's rooms. On an artist page
          every class is the page's own, and the page usually carries the artist's
          name — so the row read "By Deepak Kaushik · By Deepak", one person twice. */}
      <div style={panel}>
        {isStudio ? (
          <ToolFacts
            tint={tint}
            style={{ marginBottom: 6 }}
            items={[
              { label: "By the studio", value: madeHere, testId: "team-classes-business" },
              { label: `By ${first}`, value: theirs, testId: "team-classes-member" },
            ]}
          />
        ) : null}
        <ToolFacts
          tint={tint}
          items={[
            { label: "Teaches", value: takes, testId: "team-classes-takes" },
            { label: "Assists", value: assists, testId: "team-classes-assists" },
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
              data-testid={`team-class-by-${k}`}
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
        const title =
          by === "artist" ? lead.artistName ?? "No artist on record" : by === "studio" ? lead.venueName ?? "Their own place" : lead.style;
        const booked = list.reduce((n, c) => n + c.fillBooked, 0);
        const seats = list.reduce((n, c) => n + c.fillSeats, 0);
        const fill = pct(booked, seats);
        const open = opened.has(key);
        /* the group's face: a person under Artist, the studio's own picture under
           Studio (it was missing — 4 Oct 2026), nothing under a dance style, whose
           name is the whole of it */
        const face =
          by === "artist" ? (
            <ToolFace name={title} photoPath={lead.artistPhoto} tint={tint} size={30} />
          ) : by === "studio" ? (
            <ToolFace name={title} photoPath={lead.venuePhoto} tint={tint} size={30} />
          ) : null;
        return (
          <div key={key} data-testid="team-class-group" style={panel}>
            {/* ⚠ THE WHOLE GROUP COLLAPSES (4 Oct 2026, the user: "make sure also
                able to collapse overall classes in artist, studio, dance style
                tabs") — the head is the control, and every group starts CLOSED
                ("class section should always have collapses completely closed") */}
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${title} — ${list.length} ${list.length === 1 ? "class" : "classes"}, ${open ? "collapse" : "expand"}`}
              data-testid="team-class-group-toggle"
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
                    {fill == null ? "" : ` · ${fill}% FULL`}
                  </span>
                }
                after={
                  <span aria-hidden="true" style={{ color: MUTED, fontSize: 12, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
                    ▾
                  </span>
                }
              />
            </button>
            {open && list.map((c) => {
              const t = c.dancers == null ? null : pct(c.dancers, c.booked);
              /* ⚠ THE ROLE IS ALWAYS SAID, and a class they are no longer on says
                 WHY beside it — a bare "ENDED" read as "the class is over", which
                 it never meant */
              const role = c.kind === "artist" ? "TEACHES" : "ASSISTS";
              const gone = c.closedWhy === "deleted" ? "CLASS DELETED" : c.closedWhy === "removed" ? "TAKEN OFF IT" : null;
              return (
                <details key={c.classId} data-testid="team-class" data-origin={c.origin} style={{ marginTop: 8, borderRadius: 14, border: "1.5px solid var(--el)", background: `${tint}0a`, opacity: c.closed ? 0.7 : 1 }}>
                  <summary style={{ listStyle: "none", cursor: "pointer", padding: "10px 12px", display: "block" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</b>
                      <ToolChip word={role} fg={c.closed ? SUB : tint} bg={c.closed ? "var(--el)" : `${tint}1c`} testId="team-class-role" />
                      {gone ? <ToolChip word={gone} fg={SUB} bg="var(--el)" testId="team-class-gone" /> : null}
                      <span aria-hidden="true" style={{ color: MUTED, fontSize: 12 }}>▾</span>
                    </span>
                    {/* WHO MADE IT — the one line that tells the two kinds apart; a
                        studio's only, for the reason the summary row gives */}
                    {isStudio ? (
                      <span data-testid="team-class-origin" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, fontSize: 10.5, fontWeight: 800, color: SUB }}>
                        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: c.origin === "member" ? "#A855F7" : tint, flexShrink: 0 }} />
                        {madeByWords(c)}
                      </span>
                    ) : null}
                    <span style={{ display: "block", marginTop: 8 }}>
                      <FillBar c={c} />
                    </span>
                  </summary>
                  {/* ⚠ EVERYTHING UNDER THE BAR IS A BOX WITH A SHORT NAME (4 Oct
                      2026, the user: "all detail in last collapse below the bar should
                      be in boxes with shorter names"). Three to a row, the value over
                      its label; a box with nothing true to say is not drawn.
                      Held · to come and the pay a session left at the user's word. */}
                  <div data-testid="team-class-details" style={{ padding: "2px 12px 12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, borderTop: "1.5px solid var(--el)", paddingTop: 10 }}>
                      {(
                        [
                          /* the chip above already says TEACHES; this box earns its place
                             only when it adds WHO they assist */
                          ["With", c.kind === "assistant" && c.artistName ? c.artistName : null],
                          ["Studio", c.venueName],
                          ["Room", c.room],
                          /* over the sessions held; before any, the seats booked so far.
                             ⚠ A class the member made themselves is theirs: this team
                             reads its seats and never its register, so no check-ins. */
                          ["Booked", String(c.held > 0 ? c.booked : c.fillBasis === "upcoming" ? c.fillBooked : 0)],
                          ["Checked in", c.dancers != null && c.held > 0 ? String(c.dancers) : null],
                          ["Turn-up", c.dancers != null && t != null && c.held > 0 ? `${t}%` : null, t == null ? undefined : pctTint(t)],
                          /* the next session when there is one, else the last */
                          ["Date", (c.nextAt ?? c.lastAt) ? dateWords((c.nextAt ?? c.lastAt) as string) : null],
                          ["Time", (c.nextAt ?? c.lastAt) ? timeWords((c.nextAt ?? c.lastAt) as string) : null],
                          ["Status", c.closedWhy === "deleted" ? "Deleted" : c.closedWhy === "removed" ? "Removed" : null, SUB],
                        ] as Array<[string, string | null, string?]>
                      )
                        .filter((b): b is [string, string, string?] => Boolean(b[1]))
                        .map(([label, value, color]) => (
                          <div key={label} data-testid={`team-class-box-${label.toLowerCase().replace(/\s+/g, "-")}`} style={{ borderRadius: 12, background: `${tint}0f`, border: "1.5px solid var(--el)", padding: "8px 6px 7px", textAlign: "center", minWidth: 0 }}>
                            <div title={value} style={{ fontSize: 12.5, fontWeight: 900, lineHeight: 1.2, color: color ?? INK, fontVariantNumeric: "tabular-nums", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>
                              {value}
                            </div>
                            <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: 0.7, color: MUTED, marginTop: 3, textTransform: "uppercase" }}>{label}</div>
                          </div>
                        ))}
                    </div>
                    <Link
                      href={`/c/${c.shareSlug}`}
                      aria-label={`Open ${c.title}`}
                      data-testid="team-class-open"
                      style={{ display: "inline-flex", alignItems: "center", marginTop: 8, padding: "5px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, textDecoration: "none", color: tint, background: `${tint}14`, border: `1.5px solid ${tint}40` }}
                    >
                      Open class ›
                    </Link>
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
