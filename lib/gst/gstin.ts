/** A GSTIN, CHECKED (11 Sep 2026 — the user: "instead of social media use GST
 *  number. GST verification will be by API; right now bypass — a Verify button:
 *  if it's in format then verified, else reject").
 *
 *  An Indian GSTIN is fifteen characters with a fixed anatomy:
 *
 *      27 ABCDE1234F 1 Z 5
 *      │  │          │ │ └ check character (mod-36 over the first fourteen)
 *      │  │          │ └── always the letter Z
 *      │  │          └──── entity number within the state: 1-9, then A-Z
 *      │  └───────────── the PAN: 5 letters, 4 digits, 1 letter
 *      └──────────────── state code: 01–38, or 97 (other territory), 99 (centre)
 *
 *  Two levels of check live here, deliberately separate:
 *
 *  SHAPE — the anatomy above, including a real state code. This is what the
 *  "bypass" verifies today: a number that could not possibly be a GSTIN is
 *  refused on the spot with the reason, and one that could be is accepted.
 *
 *  CHECKSUM — the last character is arithmetic over the other fourteen, so a
 *  typo is caught before any API is paid for. Implemented and proven, but NOT
 *  enforced by default: a person testing with a made-up number would be
 *  refused for a reason they cannot see, and the government API that arrives
 *  later will enforce it anyway. Turn it on with `{ checksum: true }` the day
 *  that API is wired, so the shape and the checksum are the free pre-check
 *  and the API call is the paid one.
 *
 *  Pure functions, no I/O — the same module runs in a server action and, one
 *  day, in the browser for an instant hint. */

export const GSTIN_LENGTH = 15;

/** the anatomy, as one expression — the same one the database CHECK uses */
export const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** GST state codes in force: the states and union territories 01–38, plus
 *  97 (Other Territory) and 99 (Centre Jurisdiction) */
export const GST_STATE_CODES: ReadonlySet<string> = new Set([
  ...Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, "0")),
  "97",
  "99",
]);

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** What a person types is rarely what the register holds: spaces, lowercase,
 *  a pasted label. Everything that is not a letter or digit is dropped. */
export function normalizeGstin(raw: string): string {
  return raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** The check character for the first fourteen: each position's value (0–35)
 *  is multiplied by 1 or 2 alternately, the product's two base-36 digits are
 *  summed, and the character that brings the total to a multiple of 36 is the
 *  answer. The published GSTIN algorithm. */
export function gstinCheckCharacter(first14: string): string {
  if (first14.length !== 14) {
    throw new Error("a GSTIN check character is computed over exactly fourteen characters");
  }
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = ALPHABET.indexOf(first14[i]!);
    if (value < 0) {
      throw new Error(`not a GSTIN character: ${first14[i]}`);
    }
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return ALPHABET[(36 - (sum % 36)) % 36]!;
}

export function gstinChecksumOk(gstin: string): boolean {
  return gstin.length === GSTIN_LENGTH && gstinCheckCharacter(gstin.slice(0, 14)) === gstin[14];
}

export type GstinVerdict =
  | { ok: true; gstin: string; stateCode: string; pan: string }
  | { ok: false; reason: string };

/** The whole judgement, with the reason a person can act on. */
export function checkGstin(raw: string, opts: { checksum?: boolean } = {}): GstinVerdict {
  const gstin = normalizeGstin(raw ?? "");
  if (gstin.length === 0) {
    return { ok: false, reason: "Enter the GST number." };
  }
  if (gstin.length !== GSTIN_LENGTH) {
    return { ok: false, reason: `A GST number is ${GSTIN_LENGTH} characters — this one is ${gstin.length}.` };
  }
  if (!GSTIN_SHAPE.test(gstin)) {
    return { ok: false, reason: "That is not the shape of a GST number: 2 digits, a 10-character PAN, an entity code, Z, and a check character — like 27ABCDE1234F1Z5." };
  }
  const stateCode = gstin.slice(0, 2);
  if (!GST_STATE_CODES.has(stateCode)) {
    return { ok: false, reason: `${stateCode} is not a GST state code.` };
  }
  if (opts.checksum && !gstinChecksumOk(gstin)) {
    return { ok: false, reason: "The check character does not match — one character is mistyped." };
  }
  return { ok: true, gstin, stateCode, pan: gstin.slice(2, 12) };
}

/** A GSTIN that passes every check here — for help text and for tests, computed
 *  rather than remembered so it can never drift from the algorithm. */
export function sampleGstin(): string {
  const first14 = "27ABCDE1234F1Z";
  return first14 + gstinCheckCharacter(first14);
}
