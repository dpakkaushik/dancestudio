/**
 * Proves lib/gst/gstin.ts (11 Sep 2026). Node 24 strips TypeScript types on
 * import, so this runs with no build:
 *
 *     node scripts/gstin-proof.mjs
 *
 * The accepted format is the PLACEHOLDER the user asked for — three letters
 * then five digits — until the government API is wired inside `verify_gstin`.
 */
import { checkGstin, normalizeGstin, GSTIN_EXAMPLE } from "../lib/gst/gstin.ts";

let failed = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "ok " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

check(checkGstin("ABC12345").ok === true, "ABC12345 — three letters then five digits — passes");
check(checkGstin(GSTIN_EXAMPLE).ok === true, `the example the screen shows (${GSTIN_EXAMPLE}) passes`);
check(checkGstin(" abc12345 ").ok === true, "lower case and spaces are normalised before checking");
check(normalizeGstin("abc-123 45") === "ABC12345", "punctuation is dropped, not refused");

check(checkGstin("").ok === false && checkGstin("").reason === "Enter the GST number.", "empty says so");
check(checkGstin("AB12345").ok === false, "two letters is not three");
check(checkGstin("ABCD1234").ok === false, "four letters is not three");
check(checkGstin("ABC1234").ok === false, "four digits is not five");
check(checkGstin("ABC123456").ok === false, "six digits is not five");
check(checkGstin("12345ABC").ok === false, "the digits do not come first");
check(checkGstin("ABC1234E").ok === false, "a letter among the digits is refused");
check(checkGstin("27ABCDE1234F1Z5").ok === false, "a real 15-character GSTIN is NOT the format accepted today");

const bad = checkGstin("XY1");
check(bad.ok === false && /three letters then five digits/.test(bad.reason), `the refusal says what the shape is: "${bad.reason}"`);

console.log(failed ? `\n${failed} GSTIN CHECK(S) FAILED` : "\nALL GSTIN CHECKS PASSED");
process.exit(failed ? 1 : 0);
