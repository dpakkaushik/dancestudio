/** A REAL QR CODE, ENCODED HERE (21 Sep 2026).
 *
 *  The user: *"qr code button should just open qr not link on all profiles code
 *  should look better as well."*
 *
 *  ⚠ WHAT WAS THERE WAS NOT A QR CODE AT ALL. `QRBlock` drew a pattern HASHED
 *  from the string (prototype dosHash 6388 + QRBlock 6460) — three finder squares
 *  and a field of modules that look like a code and encode nothing. So it has
 *  never scanned, which is also why the app's own Scan sheet could not read a
 *  DanceOS profile off another phone: the one thing it exists to read was
 *  decoration. That is the standing backlog row R27, and "should look better"
 *  is really "should be a code".
 *
 *  ⚠ WRITTEN HERE RATHER THAN TAKEN AS A DEPENDENCY, on this repo's own
 *  precedent: the map was hand-rolled because "this machine's pnpm store has
 *  broken once already" (11 Sep), and the store has since needed `--force` to
 *  relink 469 packages after a machine move (15 Sep). A QR encoder is a few
 *  hundred lines of well-specified arithmetic with no runtime and no updates;
 *  a package here would be a supply-chain edge on the one screen whose whole
 *  job is to be trusted by a stranger's camera.
 *
 *  Scope, deliberately: BYTE mode, error correction level **M** (~15% recovery,
 *  the level most readers expect), versions 1–10 — up to 213 bytes, where the
 *  longest thing this app encodes is a profile URL of about 70. Anything longer
 *  throws rather than silently drawing a code that cannot be read.
 *
 *  ⚠ HOW IT IS VERIFIED, AND WHAT THAT PROOF IS WORTH. The obvious proof is to
 *  decode it with the browser's own `BarcodeDetector` — the very API the Scan
 *  sheet uses. **That API does not exist in Chromium on Windows** (probed, not
 *  assumed: `BarcodeDetector` is undefined in the bundled HeadlessChrome 151),
 *  which is the same reason the Scan sheet has a "this browser cannot" branch.
 *  So `scripts/qr-proof.js` checks the three things that can be checked against
 *  something OTHER than my own code — the generator polynomials against the
 *  published alpha-exponent table, the bit stream against the spec's own worked
 *  example, and the format block against its BCH remainder — and then reads the
 *  matrix back out. **The read-back is self-consistent, not independent**: it
 *  catches an asymmetric slip and would not catch a rule I have misread in the
 *  same way twice. The ground truth is a phone camera, and the proof writes a
 *  PNG to be pointed at one. Said plainly here because a code that "passes" and
 *  does not scan is worse than the drawn pattern it replaces. */

/* ── the tables, per version, at level M ───────────────────────────────────────
   [ EC codewords per block, group-1 blocks, group-1 data codewords,
     group-2 blocks, group-2 data codewords ] */
const EC_M: Array<[number, number, number, number, number]> = [
  [10, 1, 16, 0, 0], // v1
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44], // v10
];

/** where the alignment patterns' centres sit, per version (none on v1) */
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/** the 18-bit version block, v7 upward only */
const VERSION_BITS: Record<number, number> = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

/* ── GF(256), the field QR does its arithmetic in ── */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** the generator polynomial for n error-correction codewords */
function generator(n: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** the remainder of data ÷ generator — the error-correction codewords */
function ecFor(data: Uint8Array, n: number): Uint8Array {
  const gen = generator(n);
  const rem = new Uint8Array(data.length + n);
  rem.set(data);
  for (let i = 0; i < data.length; i++) {
    const lead = rem[i];
    if (!lead) continue;
    for (let j = 0; j < gen.length; j++) rem[i + j] ^= mul(gen[j], lead);
  }
  return rem.slice(data.length);
}

/** the smallest version (1-10) whose level-M byte capacity holds these bytes */
function versionFor(byteLength: number): number {
  for (let v = 1; v <= 10; v++) {
    const [, g1, d1, g2, d2] = EC_M[v - 1];
    const dataCodewords = g1 * d1 + g2 * d2;
    const countBits = v >= 10 ? 16 : 8;
    if (dataCodewords * 8 - 4 - countBits >= byteLength * 8) return v;
  }
  throw new Error(`QR: ${byteLength} bytes is more than this encoder carries (213 at version 10, level M)`);
}

/* ── the bit stream: mode, length, the bytes, the terminator, the padding ── */
function codewordsFor(bytes: Uint8Array, version: number): Uint8Array {
  const [ecPer, g1, d1, g2, d2] = EC_M[version - 1];
  const dataCodewords = g1 * d1 + g2 * d2;
  const countBits = version >= 10 ? 16 : 8;

  const bits: number[] = [];
  const push = (value: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);
  /* the terminator is up to four zeroes, and only as many as still fit */
  for (let i = 0; i < 4 && bits.length < dataCodewords * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const data = new Uint8Array(dataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    data[i] = b;
  }
  /* the two pad codewords the spec names, alternating to the end */
  for (let i = bits.length / 8, alt = true; i < dataCodewords; i++, alt = !alt) data[i] = alt ? 0xec : 0x11;

  /* split into blocks, error-correct each, then INTERLEAVE — a scratch on the
     code takes one codeword from each block rather than a run from one, which
     is the whole reason a damaged code still reads */
  const blocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let at = 0;
  for (let i = 0; i < g1 + g2; i++) {
    const size = i < g1 ? d1 : d2;
    const block = data.slice(at, at + size);
    at += size;
    blocks.push(block);
    ecBlocks.push(ecFor(block, ecPer));
  }
  const out: number[] = [];
  const widest = Math.max(d1, d2);
  for (let i = 0; i < widest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecPer; i++) for (const b of ecBlocks) out.push(b[i]);
  return new Uint8Array(out);
}

/* ── the matrix ── */
type Grid = { size: number; on: Uint8Array; fixed: Uint8Array };

const idx = (g: Grid, x: number, y: number) => y * g.size + x;
const set = (g: Grid, x: number, y: number, on: boolean, fixed = true) => {
  g.on[idx(g, x, y)] = on ? 1 : 0;
  g.fixed[idx(g, x, y)] = fixed ? 1 : 0;
};

function skeleton(version: number): Grid {
  const size = version * 4 + 17;
  const g: Grid = { size, on: new Uint8Array(size * size), fixed: new Uint8Array(size * size) };

  /* three finder patterns and their separators: a 7×7 ring, a 3×3 core, and a
     one-module blank all the way round (which is what the -1..7 walk draws) */
  const finder = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const px = ox + x;
        const py = oy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const onRing = (x === 0 || x === 6) && y >= 0 && y <= 6;
        const onRing2 = (y === 0 || y === 6) && x >= 0 && x <= 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        set(g, px, py, onRing || onRing2 || core);
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);

  /* the timing lines */
  for (let i = 8; i < size - 8; i++) {
    set(g, i, 6, i % 2 === 0);
    set(g, 6, i, i % 2 === 0);
  }

  /* the alignment patterns, everywhere two centres meet that is not a finder */
  const centres = ALIGN[version - 1];
  for (const cy of centres) {
    for (const cx of centres) {
      const nearFinder = (cx <= 8 && cy <= 8) || (cx >= size - 9 && cy <= 8) || (cx <= 8 && cy >= size - 9);
      if (nearFinder) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(g, cx + x, cy + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
  }

  /* the one module that is always dark */
  set(g, 8, size - 8, true);

  /* reserve the format areas so data never lands there */
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      set(g, i, 8, false);
      set(g, 8, i, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    set(g, size - 1 - i, 8, false);
    if (i < 7) set(g, 8, size - 1 - i, false);
  }

  /* and the version block, v7 upward */
  if (version >= 7) {
    const bits = VERSION_BITS[version];
    for (let i = 0; i < 18; i++) {
      const on = ((bits >> i) & 1) === 1;
      const a = Math.floor(i / 3);
      const b = (i % 3) + size - 11;
      set(g, a, b, on);
      set(g, b, a, on);
    }
  }
  return g;
}

/** the data, walked up and down in two-wide columns from the bottom right */
function place(g: Grid, codewords: Uint8Array) {
  let bit = 0;
  const total = codewords.length * 8;
  let upward = true;
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the timing column is skipped entirely
    for (let step = 0; step < g.size; step++) {
      const y = upward ? g.size - 1 - step : step;
      for (let c = 0; c < 2; c++) {
        const x = right - c;
        if (g.fixed[idx(g, x, y)]) continue;
        const on = bit < total ? ((codewords[bit >> 3] >> (7 - (bit & 7))) & 1) === 1 : false;
        g.on[idx(g, x, y)] = on ? 1 : 0;
        bit++;
      }
    }
    upward = !upward;
  }
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** the four penalty rules — the mask that scores lowest is the one drawn */
function penalty(on: Uint8Array, size: number): number {
  const at = (x: number, y: number) => on[y * size + x] === 1;
  let score = 0;
  /* rule 1: runs of five or more */
  for (let i = 0; i < size; i++) {
    for (const row of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const a = row ? at(j, i) : at(i, j);
        const b = row ? at(j - 1, i) : at(i, j - 1);
        if (a === b) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }
  /* rule 2: any 2×2 of one colour */
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (at(x, y) === at(x + 1, y) && at(x, y) === at(x, y + 1) && at(x, y) === at(x + 1, y + 1)) score += 3;
  /* rule 3: the finder-like run, either way round, in both directions */
  const A = [true, false, true, true, true, false, true, false, false, false, false];
  const B = [false, false, false, false, true, false, true, true, true, false, true];
  const runs = (get: (i: number) => boolean, n: number) => {
    for (let i = 0; i + 11 <= n; i++) {
      let a = true;
      let b = true;
      for (let k = 0; k < 11; k++) {
        if (get(i + k) !== A[k]) a = false;
        if (get(i + k) !== B[k]) b = false;
      }
      if (a || b) score += 40;
    }
  };
  for (let i = 0; i < size; i++) {
    runs((k) => at(k, i), size);
    runs((k) => at(i, k), size);
  }
  /* rule 4: how far the dark share is from half */
  let dark = 0;
  for (let i = 0; i < on.length; i++) dark += on[i];
  const pct = (dark * 100) / on.length;
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/** the 15-bit format block for level M and this mask */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // 00 = level M
  let rem = data << 10;
  for (let i = 4; i >= 0; i--) if ((rem >> (10 + i)) & 1) rem ^= 0b10100110111 << i;
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function writeFormat(g: Grid, mask: number) {
  const bits = formatBits(mask);
  for (let i = 0; i < 15; i++) {
    const on = ((bits >> i) & 1) === 1;
    /* the copy beside the top-left finder */
    if (i < 6) set(g, 8, i, on);
    else if (i === 6) set(g, 8, 7, on);
    else if (i === 7) set(g, 8, 8, on);
    else if (i === 8) set(g, 7, 8, on);
    else set(g, 14 - i, 8, on);
    /* and the copy split across the other two */
    if (i < 8) set(g, g.size - 1 - i, 8, on);
    else set(g, 8, g.size - 15 + i, on);
  }
  set(g, 8, g.size - 8, true); // the always-dark module, restated
}

/** THE ONE DOOR: a string in, a square of booleans out (true = a dark module).
 *  Row-major, `size × size`, with NO quiet zone — the caller draws that, because
 *  how much white sits around a code is a layout decision and four modules is
 *  the minimum a reader needs. */
export function qrMatrix(text: string): { size: number; modules: boolean[][] } {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length);
  const codewords = codewordsFor(bytes, version);

  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = skeleton(version);
    place(g, codewords);
    const masked: Grid = { size: g.size, on: Uint8Array.from(g.on), fixed: g.fixed };
    for (let y = 0; y < g.size; y++) {
      for (let x = 0; x < g.size; x++) {
        if (g.fixed[idx(g, x, y)]) continue;
        if (MASKS[mask](x, y)) masked.on[idx(g, x, y)] ^= 1;
      }
    }
    writeFormat(masked, mask);
    const s = penalty(masked.on, masked.size);
    if (s < bestScore) {
      bestScore = s;
      best = masked;
    }
  }
  const g = best as Grid;
  const modules: boolean[][] = [];
  for (let y = 0; y < g.size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < g.size; x++) row.push(g.on[idx(g, x, y)] === 1);
    modules.push(row);
  }
  return { size: g.size, modules };
}

/** ⚠ FOR `scripts/qr-proof.js` AND NOTHING ELSE. These are checked against
 *  PUBLISHED tables rather than against my own output, which is the only part
 *  of this file whose correctness can be argued from outside it. Nothing in the
 *  app imports this, and nothing should: `qrMatrix` is the door. */
export const __forProof = { generator, ecFor, codewordsFor, versionFor, formatBits, EC_M, LOG, EXP };
