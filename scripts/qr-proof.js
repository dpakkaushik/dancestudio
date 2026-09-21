/* PROOF FOR `lib/qr/encode.ts` — 21 Sep 2026.
 *
 * ⚠ READ THIS BEFORE TRUSTING A GREEN RUN. The proof a QR encoder really wants
 * is a DECODE, and this machine cannot give one: `BarcodeDetector` is undefined
 * in Chromium on Windows (probed — the same gap that makes the app's Scan sheet
 * say "this browser cannot"), and there is no decoder in node_modules. So the
 * checks below split into two kinds, and the difference matters:
 *
 *   INDEPENDENT (1-4) — measured against something other than my own code: the
 *   published generator-polynomial table, the spec's own worked example, and the
 *   BCH remainder a format block must leave. If my field arithmetic, my bit
 *   packing or my format encoding is wrong, these fail.
 *
 *   SELF-CONSISTENT (5-7) — the matrix read back out. These catch an asymmetric
 *   slip (placed one way, read another) and CANNOT catch a rule I have misread
 *   the same way twice. A green here is not "it scans".
 *
 * The ground truth is a phone. Check 8 writes the code to a PNG for exactly that.
 *
 * Run: node scripts/qr-proof.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { qrMatrix, __forProof } = require(path.join(__dirname, "..", "lib", "qr", "encode.ts"));
const { generator, codewordsFor, versionFor, formatBits, EC_M, LOG } = __forProof;

let pass = 0;
let fail = 0;
const ok = (name, good, detail = "") => {
  if (good) {
    pass++;
    console.log(`-- ok   ${name}${detail ? " :: " + detail : ""}`);
  } else {
    fail++;
    console.log(`-- FAIL ${name}${detail ? " :: " + detail : ""}`);
  }
};

/* ── 1 · the generator polynomials, against the published table ──────────────
   ISO/IEC 18004's generator polynomials are universally published as ALPHA
   EXPONENTS. If GF(256) is built on the wrong primitive polynomial, or the
   generator is multiplied out wrongly, these do not match. */
const PUBLISHED = {
  7: [0, 87, 229, 146, 149, 238, 102, 21],
  10: [0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45],
  13: [0, 74, 152, 176, 100, 86, 100, 106, 104, 130, 218, 206, 140, 78],
  16: [0, 120, 104, 107, 109, 102, 161, 76, 3, 91, 191, 147, 169, 182, 194, 225, 120],
  18: [0, 215, 234, 158, 94, 184, 97, 118, 170, 79, 187, 152, 148, 252, 179, 5, 98, 96, 153],
};
for (const [n, expected] of Object.entries(PUBLISHED)) {
  const got = Array.from(generator(Number(n))).map((c) => LOG[c]);
  ok(`1 · generator for ${n} EC codewords matches the published exponents`, JSON.stringify(got) === JSON.stringify(expected), got.join(" "));
}

/* ── 2 · the bit stream, against the spec's own worked example ───────────────
   "HELLO WORLD" in byte mode at version 1 fills exactly the 13 data codewords
   of level Q with no padding, and the encoding is the one every published
   walk-through of the standard prints. We encode at level M here, so the
   codewords are followed by this version's padding — the FIRST THIRTEEN are the
   thing being checked, and they exercise the mode indicator, the 8-bit count,
   the byte packing and the four-zero terminator. */
{
  const EXPECTED = [0x40, 0xb4, 0x84, 0x54, 0xc4, 0xc4, 0xf2, 0x05, 0x74, 0xf5, 0x24, 0xc4, 0x40];
  const cw = codewordsFor(new TextEncoder().encode("HELLO WORLD"), 1);
  const head = Array.from(cw.slice(0, 13));
  ok("2 · the bit stream for HELLO WORLD matches the worked example", JSON.stringify(head) === JSON.stringify(EXPECTED), head.map((b) => b.toString(16).padStart(2, "0")).join(" "));
}

/* ── 3 · the padding is the spec's two codewords, alternating ──────────────── */
{
  const cw = codewordsFor(new TextEncoder().encode("HELLO WORLD"), 1);
  const tail = Array.from(cw.slice(13, 16)); // v1-M holds 16 data codewords
  ok("3 · padding alternates 0xEC / 0x11 to the end", JSON.stringify(tail) === JSON.stringify([0xec, 0x11, 0xec]), tail.map((b) => b.toString(16)).join(" "));
}

/* ── 4 · the format block leaves a zero BCH remainder ────────────────────────
   A format block is 5 data bits (2 for the level, 3 for the mask) followed by
   10 BCH(15,5) check bits, the whole XORed with 0b101010000010010. Undo the
   XOR, divide by the generator 0b10100110111, and a correct block leaves
   nothing. This is arithmetic the reader performs, so it is a real check. */
{
  let allZero = true;
  const remainders = [];
  for (let mask = 0; mask < 8; mask++) {
    let rem = formatBits(mask) ^ 0b101010000010010;
    const data = rem >> 10;
    for (let i = 4; i >= 0; i--) if ((rem >> (10 + i)) & 1) rem ^= 0b10100110111 << i;
    remainders.push(rem);
    if (rem !== 0) allZero = false;
    /* and the five data bits must say level M (00) and this mask */
    if (data !== ((0b00 << 3) | mask)) allZero = false;
  }
  ok("4 · every mask's format block is valid BCH and says level M", allZero, `remainders ${remainders.join(",")}`);
}

/* ── 5 · the fixed patterns are where the spec puts them (self-consistent) ─── */
{
  const ALIGN_CENTRES = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  let good = true;
  const notes = [];
  for (let v = 1; v <= 10; v++) {
    const bytes = new TextEncoder().encode("v" + v + "-" + "z".repeat(Math.max(0, v * 18 - 10)));
    let m;
    try {
      m = qrMatrix(new TextDecoder().decode(bytes));
    } catch {
      continue; // too long for this version; the shorter cases already covered it
    }
    const { size, modules } = m;
    const version = (size - 17) / 4;
    /* the three finders, each with its blank separator */
    for (const [ox, oy] of [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ]) {
      if (!modules[oy][ox] || !modules[oy + 6][ox + 6] || modules[oy + 1][ox + 1]) good = false;
    }
    /* the timing lines */
    for (let i = 8; i < size - 8; i++) if (modules[6][i] !== (i % 2 === 0) || modules[i][6] !== (i % 2 === 0)) good = false;
    /* the always-dark module */
    if (!modules[size - 8][8]) good = false;
    /* one alignment centre, where there is one */
    const c = ALIGN_CENTRES[version - 1];
    if (c.length >= 2) {
      const cx = c[1];
      const cy = c[1];
      if (!modules[cy][cx] || modules[cy][cx + 1] || !modules[cy - 2][cx - 2]) good = false;
    }
    notes.push("v" + version);
  }
  ok("5 · finders, timing, dark module and alignment are placed correctly", good, notes.join(" "));
}

/* ── 6 · the data reads back out (SELF-CONSISTENT — see the header) ──────────
   The walk below is written from the spec text rather than by calling place()
   in reverse, so a transposition in one is not cancelled by the other. It is
   still my reading of the spec on both sides. */
function readBack(size, modules) {
  /* rebuild the map of what is structural, the same way the encoder reserves it */
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (x, y) => {
    if (x >= 0 && y >= 0 && x < size && y < size) fixed[y][x] = true;
  };
  for (const [ox, oy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ])
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) mark(ox + x, oy + y);
  for (let i = 0; i < size; i++) {
    mark(i, 6);
    mark(6, i);
  }
  const version = (size - 17) / 4;
  const ALIGN_CENTRES = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  for (const cy of ALIGN_CENTRES[version - 1])
    for (const cx of ALIGN_CENTRES[version - 1]) {
      if ((cx <= 8 && cy <= 8) || (cx >= size - 9 && cy <= 8) || (cx <= 8 && cy >= size - 9)) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) mark(cx + x, cy + y);
    }
  for (let i = 0; i <= 8; i++) {
    mark(i, 8);
    mark(8, i);
  }
  for (let i = 0; i < 8; i++) {
    mark(size - 1 - i, 8);
    mark(8, size - 1 - i);
  }
  if (version >= 7)
    for (let i = 0; i < 18; i++) {
      mark(Math.floor(i / 3), (i % 3) + size - 11);
      mark((i % 3) + size - 11, Math.floor(i / 3));
    }

  /* which mask was used? read the format block back and undo the XOR */
  let fmt = 0;
  for (let i = 0; i < 15; i++) {
    let on;
    if (i < 6) on = modules[i][8];
    else if (i === 6) on = modules[7][8];
    else if (i === 7) on = modules[8][8];
    else if (i === 8) on = modules[8][7];
    else on = modules[8][14 - i];
    if (on) fmt |= 1 << i;
  }
  const mask = (fmt ^ 0b101010000010010) >> 10 & 0b111;

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  /* the zigzag, from the bottom-right, two columns at a time */
  const bits = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (let c = 0; c < 2; c++) {
        const x = right - c;
        if (fixed[y][x]) continue;
        let on = modules[y][x];
        if (MASKS[mask](x, y)) on = !on;
        bits.push(on ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const codewords = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    codewords.push(b);
  }
  /* de-interleave back into blocks and take the data half */
  const [ecPer, g1, d1, g2, d2] = EC_M[version - 1];
  const blocks = [];
  for (let i = 0; i < g1 + g2; i++) blocks.push([]);
  const widest = Math.max(d1, d2);
  let at = 0;
  for (let i = 0; i < widest; i++)
    for (let b = 0; b < blocks.length; b++) {
      const size_b = b < g1 ? d1 : d2;
      if (i < size_b) blocks[b].push(codewords[at++]);
    }
  void ecPer;
  const data = [].concat(...blocks);
  /* and unpack the bit stream */
  const dbits = [];
  for (const b of data) for (let i = 7; i >= 0; i--) dbits.push((b >> i) & 1);
  const take = (n, from) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | dbits[from + i];
    return v;
  };
  const mode = take(4, 0);
  const countBits = version >= 10 ? 16 : 8;
  const count = take(countBits, 4);
  if (mode !== 0b0100) return { error: `mode ${mode.toString(2)}` };
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = take(8, 4 + countBits + i * 8);
  return { text: new TextDecoder().decode(out), mask };
}

{
  const cases = ["HELLO", "https://dancestudio-orcin.vercel.app/person/2a9f1c34-5b6d-4e7f-8a90-1b2c3d4e5f60", "Bounce Dance Academy · Pune", "x".repeat(213)];
  let good = true;
  const notes = [];
  for (const text of cases) {
    const { size, modules } = qrMatrix(text);
    const back = readBack(size, modules);
    if (back.text !== text) {
      good = false;
      notes.push(`v${(size - 17) / 4} MISMATCH ${back.error ?? JSON.stringify(back.text ?? "").slice(0, 40)}`);
    } else notes.push(`v${(size - 17) / 4}/mask${back.mask}`);
  }
  ok("6 · every string reads back out of its own matrix", good, notes.join(" "));
}

/* ── 7 · the mask chosen is the one that scores lowest ──────────────────────── */
{
  /* two strings that differ by one character should not always pick mask 0 —
     if they do, the penalty scoring is not being consulted at all */
  const masks = new Set();
  for (let i = 0; i < 24; i++) {
    const { size, modules } = qrMatrix("https://dancestudio-orcin.vercel.app/person/" + String(i).padStart(4, "0"));
    masks.add(readBack(size, modules).mask);
  }
  ok("7 · the penalty scoring really picks between masks", masks.size > 1, `${masks.size} distinct masks over 24 strings: ${[...masks].sort().join(",")}`);
}

/* ── 8 · THE GROUND TRUTH: a PNG to point a phone at ─────────────────────────
   Everything above is arithmetic. Only a camera settles it. */
{
  const text = "https://dancestudio-orcin.vercel.app/person/2a9f1c34-5b6d-4e7f-8a90-1b2c3d4e5f60";
  const { size, modules } = qrMatrix(text);
  const quiet = 4;
  const scale = 8;
  const dim = (size + quiet * 2) * scale;
  /* a minimal uncompressed PNG, so nothing is taken on for a test fixture */
  const raw = [];
  for (let y = 0; y < dim; y++) {
    raw.push(0); // filter: none
    for (let x = 0; x < dim; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < size && my < size && modules[my][mx];
      raw.push(dark ? 0 : 255, dark ? 0 : 255, dark ? 0 : 255);
    }
  }
  const zlib = require("node:zlib");
  const idat = zlib.deflateSync(Buffer.from(raw));
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0);
  ihdr.writeUInt32BE(dim, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
  const out = path.join(process.env.TEMP || ".", "danceos-qr-proof.png");
  fs.writeFileSync(out, png);
  ok("8 · a PNG is written for a phone to settle it", fs.statSync(out).size > 200, out);
  console.log(`\n   POINT A PHONE AT IT. It should open:\n   ${text}\n`);
}

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
