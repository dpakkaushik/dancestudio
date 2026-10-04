"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

import { FigureHead } from "@/components/ui/FigureHead";
import { ToolChip, ToolFace, ToolFacts, toolBtn } from "@/components/ui/ToolCard";
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
 *  page holding it here), THEIR ROLE ON IT (takes it / assists), and HOW FULL
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
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const pctTint = (p: number | null, good = 75, ok = 50) => (p == null ? MUTED : p >= good ? "#22C55E" : p >= ok ? "#F59E0B" : "#F87171");
const whenWords = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
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
      <div style={panel}>
        <ToolFacts
          tint={tint}
          items={[
            { label: isStudio ? "By the studio" : `By ${businessName}`, value: madeHere, testId: "team-classes-business" },
            { label: `By ${first}`, value: theirs, testId: "team-classes-member" },
          ]}
        />
        <ToolFacts
          tint={tint}
          style={{ marginTop: 6 }}
          items={[
            { label: "Takes it", value: takes, testId: "team-classes-takes" },
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
              onClick={() => setBy(k)}
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
        return (
          <div key={key} data-testid="team-class-group" style={panel}>
            <FigureHead
              align="center"
              margin="0 0 8px"
              title={
                <>
                  {by === "artist" ? <ToolFace name={title} photoPath={lead.artistPhoto} tint={tint} size={30} /> : null}
                  <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: -0.2, color: INK, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
                </>
              }
              figure={
                <span style={{ ...head, fontVariantNumeric: "tabular-nums" }}>
                  {list.length} {list.length === 1 ? "CLASS" : "CLASSES"}
                  {fill == null ? "" : ` · ${fill}% FULL`}
                </span>
              }
            />
            {list.map((c) => {
              const t = c.dancers == null ? null : pct(c.dancers, c.booked);
              const role = c.closed ? "ENDED" : c.kind === "artist" ? "TAKES IT" : "ASSISTS";
              return (
                <details key={c.classId} data-testid="team-class" data-origin={c.origin} style={{ marginTop: 8, borderRadius: 14, border: "1.5px solid var(--el)", background: `${tint}0a`, opacity: c.closed ? 0.7 : 1 }}>
                  <summary style={{ listStyle: "none", cursor: "pointer", padding: "10px 12px", display: "block" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <b style={{ flex: 1, minWidth: 0, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</b>
                      <ToolChip word={role} fg={c.closed ? SUB : tint} bg={c.closed ? "var(--el)" : `${tint}1c`} testId="team-class-role" />
                      <span aria-hidden="true" style={{ color: MUTED, fontSize: 12 }}>▾</span>
                    </span>
                    {/* WHO MADE IT — the one line that tells the two kinds apart */}
                    <span data-testid="team-class-origin" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, fontSize: 10.5, fontWeight: 800, color: SUB }}>
                      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: c.origin === "member" ? "#A855F7" : tint, flexShrink: 0 }} />
                      {madeByWords(c)}
                    </span>
                    <span style={{ display: "block", marginTop: 8 }}>
                      <FillBar c={c} />
                    </span>
                  </summary>
                  <div style={{ padding: "0 12px 12px" }}>
                    <div style={{ fontSize: 11, color: SUB, lineHeight: 1.55, margin: "2px 0 8px" }}>
                      {c.kind === "artist" ? `${first} takes it` : `${first} assists${c.artistName ? ` ${c.artistName}` : ""}`}
                      {c.venueName ? ` · at ${c.venueName}` : ""}
                      {c.room ? ` · ${c.room}` : ""}
                    </div>
                    <ToolFacts
                      tint={tint}
                      items={[
                        { label: "Held", value: c.held },
                        { label: "To come", value: c.upcoming },
                        { label: "Booked", value: c.booked },
                      ]}
                    />
                    <ToolFacts
                      tint={tint}
                      style={{ marginTop: 6 }}
                      items={[
                        /* ⚠ a class the member made is theirs — this team reads its
                           seats and not its register, so it claims no dancers */
                        { label: "Dancers in", value: c.dancers ?? "—" },
                        { label: "Turn-up", value: t == null ? "—" : `${t}%`, tint: t == null ? undefined : pctTint(t) },
                        { label: "A session", value: c.ratePerSessionInr ? rupees(c.ratePerSessionInr) : "—" },
                      ]}
                    />
                    <div style={{ fontSize: 11, color: SUB, marginTop: 8 }}>
                      {c.nextAt ? <>Next {whenWords(c.nextAt)}</> : c.lastAt ? <>Last {whenWords(c.lastAt)}</> : "No session dated yet"}
                      {c.capacity ? ` · room for ${c.capacity}` : ""}
                    </div>
                    <Link href={`/c/${c.shareSlug}`} aria-label={`Open ${c.title}`} style={{ ...toolBtn("tinted", tint), display: "inline-flex", marginTop: 10, textDecoration: "none" }}>
                      Open the class ›
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
