import { createECDH, createHmac, createCipheriv, createPrivateKey, randomBytes, sign } from "node:crypto";

/** WEB PUSH, ON NODE'S OWN CRYPTO (3 Oct 2026, the user: "phone push notifications").
 *
 *  Two standards and nothing else:
 *    * RFC 8291 + RFC 8188 — the message is encrypted to the browser's own key
 *      (`aes128gcm`), so the push service in the middle (FCM, Mozilla, Apple)
 *      carries bytes it cannot read;
 *    * RFC 8292 (VAPID) — a short ES256-signed token says which server is
 *      sending, so a push service only takes messages from the key the browser
 *      subscribed with.
 *
 *  ⚠ WRITTEN HERE RATHER THAN TAKEN AS A DEPENDENCY, on this repo's own precedent
 *  (the QR encoder, 21 Sep 2026): it is a few dozen lines of fixed arithmetic over
 *  `node:crypto`, and `scripts/webpush-proof.mjs` checks the encryption against the
 *  RFC 8291 appendix's worked example byte for byte — the only independent check
 *  available, because no script can stand in for a phone receiving a push.
 *
 *  Server-only: it imports `node:crypto` and reads the VAPID private key. */

const b64u = (b: Buffer | Uint8Array): string => Buffer.from(b).toString("base64url");
const fromB64u = (s: string): Buffer => Buffer.from(s, "base64url");

const hmac = (key: Buffer, data: Buffer): Buffer => createHmac("sha256", key).update(data).digest();
/** HKDF-Expand for one block, which is all RFC 8291 ever asks for (<= 32 bytes) */
const expand = (prk: Buffer, info: Buffer, len: number): Buffer => hmac(prk, Buffer.concat([info, Buffer.from([1])])).subarray(0, len);

export interface PushTarget {
  endpoint: string;
  /** the browser's P-256 public key, base64url, uncompressed (65 bytes) */
  p256dh: string;
  /** the browser's 16-byte auth secret, base64url */
  auth: string;
}

/** THE ENCRYPTED BODY (RFC 8291 §3.4 / RFC 8188 §2). `as` and `salt` are only
 *  passed by the proof, to reproduce the RFC's own example; a real send makes
 *  both fresh, every time. */
export function encryptPayload(
  target: Pick<PushTarget, "p256dh" | "auth">,
  plaintext: Buffer,
  fixed?: { asPrivate: Buffer; salt: Buffer }
): Buffer {
  const uaPublic = fromB64u(target.p256dh);
  const authSecret = fromB64u(target.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("not a P-256 push key");
  if (authSecret.length !== 16) throw new Error("not a push auth secret");

  const ecdh = createECDH("prime256v1");
  if (fixed) ecdh.setPrivateKey(fixed.asPrivate);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = fixed ? fixed.salt : randomBytes(16);

  // the key-combining step: the browser's auth secret mixes into the shared secret
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = expand(prkKey, keyInfo, 32);
  // then RFC 8188's content-encryption key and nonce from the salt
  const prk = hmac(salt, ikm);
  const cek = expand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = expand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);

  // ONE record: the message, then the 0x02 delimiter that marks the last record
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  // the header: salt · record size (4096) · key id length · key id (our public key)
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, sealed]);
}

/** THE VAPID TOKEN (RFC 8292): who is sending, signed with our private key, for
 *  the push service at this endpoint's origin, good for twelve hours. */
export function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: string; subject: string }): string {
  const pub = fromB64u(keys.publicKey);
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: keys.privateKey,
    x: b64u(pub.subarray(1, 33)),
    y: b64u(pub.subarray(33, 65)),
  };
  const key = createPrivateKey({ key: jwk, format: "jwk" });
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(
    Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: keys.subject }))
  );
  const unsigned = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64u(signature)}, k=${keys.publicKey}`;
}

export function vapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "https://dancestudio-orcin.vercel.app";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/** Send one push. Returns the push service's status — 201 delivered, and 404 or
 *  410 mean the browser has thrown the subscription away, so the caller drops it. */
export async function sendPush(target: PushTarget, message: unknown, keys: { publicKey: string; privateKey: string; subject: string }): Promise<number> {
  const body = encryptPayload(target, Buffer.from(JSON.stringify(message)));
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(target.endpoint, keys),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(24 * 3600),
      Urgency: "normal",
    },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(8000),
  });
  return res.status;
}
