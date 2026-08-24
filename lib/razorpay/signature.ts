import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 hex digest — the primitive under every Razorpay signature. */
export function hmacSha256Hex(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Constant-time hex comparison; a length mismatch is simply false. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** Webhook deliveries sign the RAW request body with the webhook secret. */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string
): boolean {
  if (!signature) {
    return false;
  }
  return safeEqualHex(hmacSha256Hex(rawBody, webhookSecret), signature);
}

/** The checkout handshake signs `order_id|payment_id` with the key secret. */
export function verifyCheckoutSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
  keySecret: string
): boolean {
  return safeEqualHex(hmacSha256Hex(`${razorpayOrderId}|${razorpayPaymentId}`, keySecret), signature);
}
