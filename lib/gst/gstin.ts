/** A GST NUMBER, AS DANCEOS CHECKS IT TODAY (11 Sep 2026).
 *
 *  The user: *"GST verification will be by API — right now just make a dummy:
 *  if in format 3 alphabets, 5 numbers then the Verify button will answer
 *  verified, else not."*
 *
 *  So the accepted format is **ABC12345** — three letters, five digits — and
 *  that is all. It is a PLACEHOLDER, and it is written as one on purpose:
 *  somebody testing the app can type eight characters and get on with it,
 *  which a real 15-character GSTIN with a mod-36 check digit makes impossible.
 *
 *  WHERE THE REAL CHECK WILL GO: `verify_gstin` in the database is the single
 *  door — the server action calls it, nothing else writes the column, and a
 *  trigger refuses every other hand. When the government API is wired it goes
 *  inside that function, between the format check and the stamp; this module
 *  changes its regex on the same day and nothing else in the app moves.
 *
 *  The real GSTIN anatomy (2-digit state code, 10-character PAN, entity code,
 *  Z, check character) is still what `public.gstin_shape` accepts as a second
 *  valid shape, so numbers already stored stay valid. It is deliberately NOT
 *  implemented here: an unused validator is a thing that rots. */

/** three letters, then five digits */
export const GSTIN_SHAPE = /^[A-Z]{3}[0-9]{5}$/;
export const GSTIN_LENGTH = 8;
export const GSTIN_EXAMPLE = "ABC12345";

/** What a person types is rarely what the register holds: spaces, lower case,
 *  a pasted label. Everything that is not a letter or a digit is dropped. */
export function normalizeGstin(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export type GstinVerdict = { ok: true; gstin: string } | { ok: false; reason: string };

/** The judgement, with the reason a person can act on — the same words the
 *  database raises, so the answer does not change depending on which one got
 *  there first. */
export function checkGstin(raw: string): GstinVerdict {
  const gstin = normalizeGstin(raw);
  if (gstin.length === 0) {
    return { ok: false, reason: "Enter the GST number." };
  }
  if (!GSTIN_SHAPE.test(gstin)) {
    return { ok: false, reason: `That is not a GST number — it is three letters then five digits, like ${GSTIN_EXAMPLE}.` };
  }
  return { ok: true, gstin };
}
