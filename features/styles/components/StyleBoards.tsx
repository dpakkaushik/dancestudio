"use client";

import Link from "next/link";
import { useState } from "react";
import { DOS_DISPLAY } from "@/lib/design/tokens";
import type { ChartRow, ChartSegment } from "@/types/stats";

/** COLUMN 2 OF A STYLE'S PAGE — who stands where in THIS style (2 Oct 2026, the
 *  user: "column-2 rankings for that particular dance style"). The prototype's
 *  own Rankings half (9529-9542): Studios · Artists · Crews · Dancers, a place,
 *  a face, the city, the points. ⚠ Every board is `dance_chart` with this
 *  style's name, all four read on the server in one pass, so switching board is
 *  client state and costs nothing. ⚠ Each board says how many it ranked — a
 *  place is only honest with its denominator (Step 25). */
const BOARDS: Array<[ChartSegment, string]> = [
  ["studio", "Studios"],
  ["artist", "Artists"],
  ["crew", "Crews"],
  ["dancer", "Dancers"],
];

const hrefOf = (r: ChartRow): string => (r.kind === "studio" ? `/studio/${r.id}` : r.kind === "crew" ? `/crew/${r.id}` : `/person/${r.id}`);
const initials = (n: string) => n.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

export function StyleBoards({ style, color, boards }: { style: string; color: string; boards: Record<ChartSegment, ChartRow[]> }) {
  const [seg, setSeg] = useState<ChartSegment>(() => BOARDS.find(([k]) => boards[k].length > 0)?.[0] ?? "studio");
  const rows = boards[seg];
  const population = rows[0]?.population ?? 0;
  return (
    <div>
      <div role="group" aria-label="Board" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {BOARDS.map(([k, word]) => {
          const on = seg === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setSeg(k)}
              style={{ flex: 1, padding: "8px 2px", borderRadius: 12, cursor: "pointer", fontSize: 11.5, fontWeight: 800, fontFamily: "inherit", background: on ? "var(--text)" : "var(--card)", color: on ? "var(--solid)" : "var(--sub)", border: `1.5px solid ${on ? "var(--text)" : "var(--el)"}` }}
            >
              {word}
            </button>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 16px", border: "1.5px dashed var(--el)", borderRadius: 16, fontSize: 12.5, color: "var(--sub)" }}>
          Nobody on this board for {style} yet — it fills as sessions in this style are danced.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)", marginBottom: 4 }} data-testid="style-board-count">
            {population} ranked in {style}
          </div>
          {rows.map((r) => (
            <Link key={r.id} href={hrefOf(r)} aria-label={`${r.place}. ${r.name}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: "1.5px solid var(--el)", textDecoration: "none", color: "var(--text)" }}>
              <span style={{ width: 26, textAlign: "center", fontFamily: DOS_DISPLAY, fontWeight: 900, fontSize: r.place <= 3 ? 20 : 15, color: r.place <= 3 ? color : "var(--muted)" }}>{r.place}</span>
              <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 12.5, background: `linear-gradient(135deg, ${color}, #7C3AED)` }}>{initials(r.name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span style={{ display: "block", fontSize: 10.5, color: "var(--sub)" }}>{r.city ?? "—"}</span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 900 }}>
                {r.points}
                <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--muted)" }}> pts</span>
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
