"use client";

import { useState, type ReactNode } from "react";
import { ColumnCount, columnTab, columnTrack } from "@/components/ui/ColumnTabs";
import { DOS_TOOLS } from "@/features/businesses/components/biz-kit";
import { SUB } from "@/lib/design/tokens";

/** UPCOMING · COMPLETED AS COLUMNS (4 Oct 2026, the user: *"upcoming and
 *  completed as columns under booked and assist classes"*). They were two
 *  sections stacked one over the other, so a long Upcoming list pushed what you
 *  had already danced below the fold. Now they are two columns under Booked and
 *  under Assist, and one list shows at a time.
 *
 *  ⚠ The row is the Inbox's own Received · Sent · Completed switch (C96): two
 *  bordered chips, the chosen one filled in ink, a count badge on each, and
 *  Completed's badge green because nothing in it is waiting on anybody. Using one
 *  row style for both screens keeps "a second row of columns" meaning one thing
 *  across the app.
 *
 *  ⚠ Both lists are rendered on the server in the one pass and handed here as
 *  nodes, so a switch costs no round trip. Like the Inbox's sides it is held in
 *  component state, not the URL: Booked · Assist · Manage above it keep `?show=`,
 *  and a second parameter for a two-way switch would only make that address
 *  harder to read.
 *
 *  ⚠ The test ids are the old sections' (`{id}-upcoming`, `{id}-completed`), on
 *  whichever list is shown, so a probe that looked for a section finds the
 *  column. */
export function WhenColumns({
  id,
  noun,
  upcoming,
  completed,
  nUp,
  nDone,
}: {
  /** "booked" or "assist" — the prefix of every test id below */
  id: string;
  /** what the lists hold, for the accessible names: "bookings", "classes you assist on" */
  noun: string;
  upcoming: ReactNode;
  completed: ReactNode;
  nUp: number;
  nDone: number;
}) {
  const [col, setCol] = useState<"upcoming" | "completed">("upcoming");
  const cols: Array<["upcoming" | "completed", string, number, string]> = [
    ["upcoming", "Upcoming", nUp, DOS_TOOLS.classes.c],
    ["completed", "Completed", nDone, "#22C55E"],
  ];
  const n = col === "upcoming" ? nUp : nDone;
  return (
    <>
      {/* the Classes screen's column look (11 Oct 2026, `ColumnTabs`) */}
      <div role="group" aria-label={`Upcoming or completed ${noun}`} data-testid={`${id}-columns`} style={{ ...columnTrack(), marginBottom: 12 }}>
        {cols.map(([k, label, count]) => {
          const on = col === k;
          return (
            <button key={k} type="button" aria-pressed={on} aria-label={`${label} ${noun} (${count})`} onClick={() => setCol(k)} style={columnTab(on)}>
              {label}
              {count > 0 ? <ColumnCount n={count} on={on} /> : null}
            </button>
          );
        })}
      </div>
      <section data-testid={`${id}-${col}`} aria-label={col === "upcoming" ? "Upcoming" : "Completed"}>
        {n > 0 ? (
          col === "upcoming" ? upcoming : completed
        ) : (
          <div style={{ fontSize: 12, color: SUB, padding: "4px 2px 2px" }}>{col === "upcoming" ? "Nothing coming up." : "Nothing completed yet."}</div>
        )}
      </section>
    </>
  );
}
