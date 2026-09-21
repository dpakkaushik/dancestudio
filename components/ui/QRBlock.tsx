/** THE CODE SQUARE — A REAL QR SINCE 21 Sep 2026.
 *
 *  The user: *"qr code button should just open qr not link on all profiles code
 *  should look better as well."*
 *
 *  ⚠ WHAT THIS REPLACED WAS NOT A QR CODE. It was the prototype's own
 *  `dosHash` + `QRBlock` (6388, 6460) — three finder squares and a field of
 *  modules derived from a HASH of the string, so it looked like a code and
 *  encoded nothing. Its own comment said "real scanning arrives with the camera
 *  work later", and the camera work arrived on 19 Sep (the people picker's Scan
 *  sheet) while this stayed a drawing: **the one thing that sheet exists to read
 *  was decoration.** That is backlog row R27, and it is why "should look better"
 *  is answered by making it real rather than by restyling it.
 *
 *  `lib/qr/encode.ts` is the encoder, written here rather than taken as a
 *  dependency (its own comment says why, and how far its proof goes).
 *
 *  ⚠ WHAT "LOOKS BETTER" DOES **NOT** MEAN HERE: rounded modules. Readers
 *  locate a code by its three finder patterns and sample module centres, and
 *  every pixel of rounding is contrast taken off a corner the camera is using.
 *  A code that photographs a little prettier and scans a little worse is the
 *  trade this app keeps refusing. What it does mean: a real 4-module quiet zone
 *  (without which many readers simply never see the code), true black on white,
 *  crisp edges, and **contiguous dark modules drawn as ONE rect** — which
 *  removes the hairline seams sub-pixel rendering leaves between neighbours, and
 *  is the one change that is better to look at AND better to scan. */

import { qrMatrix } from "@/lib/qr/encode";

/** the spec's minimum, and it is not decoration: a reader needs the blank
 *  margin to find the code's edge at all */
const QUIET = 4;

/** under about this many CSS pixels a module, a phone camera will not resolve
 *  the code — a 37-module profile link inside 72px is 1.6px a module. The
 *  square is still DRAWN (it is a true code, and a screenshot of it enlarges),
 *  but it stops claiming to be scannable. */
const SCANNABLE_PX_PER_MODULE = 3;

export function QRBlock({
  code,
  size = 96,
  label = "Entry code",
}: {
  code: string;
  size?: number;
  label?: string;
}) {
  let matrix: { size: number; modules: boolean[][] } | null = null;
  try {
    matrix = qrMatrix(code);
  } catch {
    /* over capacity, or something unencodable — never take a page down over a
       picture of a link. The text is always printed beside this by its caller. */
    matrix = null;
  }

  if (!matrix) {
    return (
      <div
        role="img"
        aria-label={`${label} ${code}`}
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          background: "var(--card)",
          border: "1px dashed var(--el)",
          display: "grid",
          placeItems: "center",
          fontSize: 10.5,
          fontWeight: 800,
          color: "var(--muted)",
          textAlign: "center",
          padding: 8,
          boxSizing: "border-box",
          flexShrink: 0,
        }}
      >
        Too long for a code
      </div>
    );
  }

  const n = matrix.size;
  const span = n + QUIET * 2;
  const perModule = size / span;

  /* ⚠ ONE RECT PER RUN, NOT PER MODULE. Two rects sharing an edge at a
     fractional pixel leave a seam the camera reads as a lighter module; merged,
     the run is one shape with one edge. It also cuts the node count by roughly
     half on a version-10 code. */
  const runs: Array<{ x: number; y: number; w: number }> = [];
  for (let y = 0; y < n; y++) {
    let start = -1;
    for (let x = 0; x <= n; x++) {
      const on = x < n && matrix.modules[y][x];
      if (on && start < 0) start = x;
      else if (!on && start >= 0) {
        runs.push({ x: start, y, w: x - start });
        start = -1;
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      role="img"
      aria-label={`${label} ${code}`}
      data-qr-modules={n}
      data-qr-scannable={perModule >= SCANNABLE_PX_PER_MODULE ? "yes" : "small"}
      shapeRendering="crispEdges"
      style={{
        background: "#fff",
        borderRadius: 12,
        flexShrink: 0,
        display: "block",
      }}
    >
      {/* the quiet zone is part of the code, so it is painted, not left to
          whatever happens to be behind the element */}
      <rect x="0" y="0" width={span} height={span} fill="#fff" />
      {runs.map((r) => (
        <rect key={`${r.y}-${r.x}`} x={r.x + QUIET} y={r.y + QUIET} width={r.w} height={1} fill="#000" />
      ))}
    </svg>
  );
}
