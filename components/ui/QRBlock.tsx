"use client";

/** The drawn code square — prototype dosHash (6388) + QRBlock (6460-6477): a
 *  code that LOOKS like the one on the door scanner. Three finder squares, the
 *  rest derived from the code, so a given string always draws the same pattern.
 *
 *  Lifted out of PassSheet at Step 12b because a staff invite wears the same
 *  square: the prototype's invite button offers "QR / mobile / search" (18435),
 *  and the QR is what you hold up for somebody to join. Real scanning arrives
 *  with the camera work later; the code text underneath is always real. */

const dosHash = (str: string): number => {
  let h = 2166136261;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const QR_N = 13;

/* the filled cells for a code — a pure module-level walk, so the component body
   never mutates anything mid-render (this repo's react-hooks/immutability rule) */
const qrCells = (code: string): Array<[number, number]> => {
  let h = dosHash(code) || 1;
  const next = () => {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5;
    h >>>= 0;
    return h;
  };
  const finder = (x: number, y: number) =>
    (x < 4 && y < 4) || (x > QR_N - 5 && y < 4) || (x < 4 && y > QR_N - 5);
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < QR_N; y++) {
    for (let x = 0; x < QR_N; x++) {
      if (finder(x, y)) continue;
      if (next() % 100 < 46) cells.push([x, y]);
    }
  }
  return cells;
};

export function QRBlock({
  code,
  size = 96,
  label = "Entry code",
}: {
  code: string;
  size?: number;
  label?: string;
}) {
  const cell = size / QR_N;
  const N = QR_N;
  const dots = qrCells(code).map(([x, y]) => (
    <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill="#111" />
  ));
  const eye = (cx: number, cy: number) => (
    <g key={`${cx}:${cy}`}>
      <rect
        x={cx * cell}
        y={cy * cell}
        width={cell * 3}
        height={cell * 3}
        fill="none"
        stroke="#111"
        strokeWidth={cell * 0.72}
      />
      <rect x={(cx + 1) * cell} y={(cy + 1) * cell} width={cell} height={cell} fill="#111" />
    </g>
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${label} ${code}`}
      style={{
        background: "#fff",
        borderRadius: 8,
        padding: 3,
        boxSizing: "content-box",
        flexShrink: 0,
        display: "block",
      }}
    >
      {dots}
      {eye(0, 0)}
      {eye(N - 3.5, 0)}
      {eye(0, N - 3.5)}
    </svg>
  );
}
