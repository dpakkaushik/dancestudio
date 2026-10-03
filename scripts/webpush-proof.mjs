// THE WEB PUSH PROOF (3 Oct 2026) — `node scripts/webpush-proof.mjs`.
//
// Imports the REAL `lib/push/webpush.ts` (Node 24 strips the types — a proof
// that runs a COPY of the code proves nothing about the code, 28 Aug 2026) and
// checks it against things it did not write:
//   1. RFC 8291 Appendix A — the spec's own worked example: given the browser's
//      keys, the sender's private key and the salt, the encrypted body must come
//      out byte for byte as published.
//   2. A round trip through a browser-side decryption written here from the RFC's
//      text, with fresh random keys — so a real send (random salt, random key)
//      decrypts to what was sent.
//   3. The VAPID token's signature verifies with the public key it carries.
// ⚠ What it CANNOT prove is that a phone shows the notification: that needs a
// real device, and is the user's to see.
import { createECDH, createDecipheriv, createHmac, generateKeyPairSync, randomBytes, verify } from "node:crypto";
import { encryptPayload, vapidAuthorization } from "../lib/push/webpush.ts";

let ok = 0;
let bad = 0;
const check = (cond, label, extra = "") => {
  cond ? ok++ : bad++;
  console.log(`  ${cond ? "ok  " : "FAIL"} ${label}${extra ? ` — ${extra}` : ""}`);
};
const u = (s) => Buffer.from(s, "base64url");

// 1 · RFC 8291 Appendix A
const A = {
  plaintext: "When I grow up, I want to be a watermelon",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  expected:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};
const got = encryptPayload({ p256dh: A.uaPublic, auth: A.auth }, Buffer.from(A.plaintext), { asPrivate: u(A.asPrivate), salt: u(A.salt) });
check(got.toString("base64url") === A.expected, "1  the RFC 8291 worked example comes out byte for byte", got.toString("base64url").slice(0, 40) + "…");

// 2 · a round trip: decrypt as a browser would, from the RFC's own steps
const ua = createECDH("prime256v1");
ua.generateKeys();
const authSecret = randomBytes(16);
const msg = JSON.stringify({ title: "You are booked", body: "Bollywood · All levels", href: "/c/x" });
const body = encryptPayload({ p256dh: ua.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url") }, Buffer.from(msg));
const salt = body.subarray(0, 16);
const rs = body.readUInt32BE(16);
const idlen = body[20];
const asPublic = body.subarray(21, 21 + idlen);
const sealed = body.subarray(21 + idlen);
const hm = (k, d) => createHmac("sha256", k).update(d).digest();
const ex = (prk, info, n) => hm(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, n);
const shared = ua.computeSecret(asPublic);
const ikm = ex(hm(authSecret, shared), Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]), 32);
const prk = hm(salt, ikm);
const d = createDecipheriv("aes-128-gcm", ex(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16), ex(prk, Buffer.from("Content-Encoding: nonce\0"), 12));
d.setAuthTag(sealed.subarray(sealed.length - 16));
const plain = Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
check(rs === 4096 && idlen === 65, "2a the header is salt · 4096 · 65 · our key", `rs ${rs}, idlen ${idlen}`);
check(plain[plain.length - 1] === 2 && plain.subarray(0, -1).toString() === msg, "2b a fresh send decrypts to exactly what was sent, ending in the last-record mark");
const again = encryptPayload({ p256dh: ua.getPublicKey().toString("base64url"), auth: authSecret.toString("base64url") }, Buffer.from(msg));
check(!again.subarray(0, 16).equals(salt) && !again.subarray(21, 86).equals(asPublic), "2c every send takes a fresh salt and a fresh key");

// 3 · the VAPID token verifies with the key it names
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const pubRaw = Buffer.concat([Buffer.from([4]), u(jwk.x), u(jwk.y)]).toString("base64url");
const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", { publicKey: pubRaw, privateKey: jwk.d, subject: "https://dancestudio-orcin.vercel.app" });
const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
check(Boolean(m) && m[4] === pubRaw, "3a the header carries the token and our public key");
const claims = JSON.parse(Buffer.from(m[2], "base64url").toString());
check(claims.aud === "https://fcm.googleapis.com" && claims.exp > Date.now() / 1000, "3b the token is for the push service's origin and not yet expired", claims.aud);
const verified = verify("sha256", Buffer.from(`${m[1]}.${m[2]}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, u(m[3]));
check(verified, "3c the signature verifies with the public key");

console.log(`\n${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
