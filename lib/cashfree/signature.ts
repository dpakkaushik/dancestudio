import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Cashfree signs every Payment Gateway webhook with the merchant's SECRET KEY
 *  (there is no separate webhook secret):
 *
 *      signedPayload     = x-webhook-timestamp + rawBody
 *      expectedSignature = Base64( HMAC-SHA256( signedPayload, secretKey ) )
 *
 *  The body must be the RAW text as delivered — re-serialising the JSON moves
 *  decimals ("300.00" → 300) and the signature stops matching. */

export function cashfreeWebhookSignature(rawBody: string, timestamp: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(`${timestamp}${rawBody}`).digest("base64");
}

/** Constant-time comparison; a length mismatch is simply false. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function verifyCashfreeWebhook(rawBody: string, timestamp: string | null, signature: string | null, secretKey: string): boolean {
  if (!timestamp || !signature) {
    return false;
  }
  return safeEqual(cashfreeWebhookSignature(rawBody, timestamp, secretKey), signature);
}

/** Cashfree stamps no event id on a delivery, so the ledger keys on the
 *  delivery itself — the timestamp and the raw body hashed together. A retry
 *  with a fresh timestamp gets a fresh id and still lands on RPCs that are
 *  idempotent on the provider's payment / refund id, which is the real guard. */
export function cashfreeEventId(rawBody: string, timestamp: string): string {
  return `cf_${createHash("sha256").update(`${timestamp}${rawBody}`).digest("hex").slice(0, 40)}`;
}
