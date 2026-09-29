import { createHmac, timingSafeEqual } from "node:crypto";

/** RESEND'S WEBHOOK SIGNATURE, WHICH IS SVIX'S (30 Sep 2026).
 *
 *  Resend delivers through Svix, so the scheme is Svix's and not Resend's own:
 *  three headers, a secret that is base64 AFTER its `whsec_` prefix, and a
 *  signature over `{id}.{timestamp}.{raw body}`.
 *
 *  ⚠ THE RAW BODY, BYTE FOR BYTE. Parsing and re-serialising changes key order
 *  and whitespace and the HMAC no longer matches — the same trap the Cashfree
 *  route documents, and the reason both routes read `await req.text()` before
 *  they read anything else.
 *
 *  ⚠ `svix-signature` CARRIES A LIST, space separated, each `v1,<base64>` —
 *  Svix sends more than one while a secret is being rotated, so matching only
 *  the first would start refusing real deliveries mid-rotation.
 *
 *  ⚠ AND THE TIMESTAMP IS CHECKED, because a signature alone is replayable for
 *  ever. Five minutes either way, which is Svix's own tolerance; the exactly-once
 *  ledger behind this is what makes a replay inside that window harmless anyway.
 */

const TOLERANCE_SECONDS = 5 * 60;

export const isResendWebhookConfigured = (): boolean => Boolean(process.env.RESEND_WEBHOOK_SECRET);

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function verifyResendWebhook(input: {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds?: number;
}): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret || !input.id || !input.timestamp || !input.signature) {
    return false;
  }

  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) {
    return false;
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - sent) > TOLERANCE_SECONDS) {
    return false;
  }

  /* `whsec_<base64>`; a secret pasted without the prefix still works */
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) {
    return false;
  }

  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.rawBody}`)
    .digest("base64");

  return input.signature
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const [version, value] = part.split(",");
      return version === "v1" && Boolean(value) && safeEqual(value, expected);
    });
}
