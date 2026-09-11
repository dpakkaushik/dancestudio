/**
 * Proves lib/gst/gstin.ts against numbers whose verdict is known (11 Sep 2026).
 * Node 24 strips TypeScript types on import, so this runs with no build:
 *
 *     node scripts/gstin-proof.mjs
 *
 * The checksum cases use GSTINs published as worked examples of the algorithm;
 * everything else is constructed so the reason for its verdict is obvious.
 */
import { checkGstin, gstinCheckCharacter, gstinChecksumOk, normalizeGstin, sampleGstin } from "../lib/gst/gstin.ts";

let failed = 0;
const check = (ok, what) => {
  console.log(`  ${ok ? "ok " : "FAIL"} ${what}`);
  if (!ok) failed++;
};

/* shape */
check(checkGstin("27ABCDE1234F1Z5").ok === true, "a well-formed GSTIN passes the shape check");
check(checkGstin(" 27abcde1234f1z5 ").ok === true, "lowercase and spaces are normalised before checking");
check(normalizeGstin("27-ABCDE 1234F/1Z5") === "27ABCDE1234F1Z5", "punctuation is dropped, not refused");
check(checkGstin("").ok === false && checkGstin("").reason === "Enter the GST number.", "empty says so");
check(checkGstin("ABC123456").ok === false && /15 characters/.test(checkGstin("ABC123456").reason), "the wrong length says how long it should be");
check(checkGstin("27ABCDE1234F1X5").ok === false && /shape/.test(checkGstin("27ABCDE1234F1X5").reason), "the 14th character must be Z");
check(checkGstin("27ABCD11234F1Z5").ok === false, "the PAN must be 5 letters, 4 digits, 1 letter");
check(checkGstin("27ABCDE1234F0Z5").ok === false, "entity code 0 does not exist");
check(checkGstin("00ABCDE1234F1Z5").ok === false && /state code/.test(checkGstin("00ABCDE1234F1Z5").reason), "state code 00 is refused by name");
check(checkGstin("45ABCDE1234F1Z5").ok === false, "state code 45 does not exist");
check(checkGstin("97ABCDE1234F1Z5").ok === true && checkGstin("99ABCDE1234F1Z5").ok === true, "97 (other territory) and 99 (centre) are real codes");
const good = checkGstin("27ABCDE1234F1Z5");
check(good.ok && good.stateCode === "27" && good.pan === "ABCDE1234F", "the verdict carries the state code and the PAN");

/* checksum — published worked examples */
check(gstinChecksumOk("27AAPFU0939F1ZV"), "27AAPFU0939F1ZV: a published valid GSTIN passes the checksum");
check(gstinChecksumOk("29AAACC1206D1Z" + gstinCheckCharacter("29AAACC1206D1Z")), "a check character the function computes is one the function accepts");
check(!gstinChecksumOk("27AAPFU0939F1ZW"), "one character off fails the checksum");
check(gstinCheckCharacter("27AAPFU0939F1Z") === "V", "the check character is computed, not looked up");
check(checkGstin("27ABCDE1234F1Z5", { checksum: true }).ok === false, "with checksum on, the help-text-shaped number is refused…");
check(checkGstin(sampleGstin(), { checksum: true }).ok === true, `…and sampleGstin() (${sampleGstin()}) passes every check`);
check(checkGstin("27ABCDE1234F1Z5").ok === true, "by default the checksum is NOT enforced — the bypass the user asked for");

console.log(failed ? `\n${failed} GSTIN CHECK(S) FAILED` : "\nALL GSTIN CHECKS PASSED");
process.exit(failed ? 1 : 0);
