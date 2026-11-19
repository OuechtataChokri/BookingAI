import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta signs every webhook POST with HMAC-SHA256 of the RAW body using the app
 * secret, sent in the `X-Hub-Signature-256` header as "sha256=<hex>".
 * Pure function (no framework imports) so it is unit tested.
 */
export function computeSignature(rawBody: string | Buffer, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

export function verifyWhatsAppSignature(rawBody: string | Buffer, header: string | null | undefined, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = Buffer.from(computeSignature(rawBody, appSecret));
  const received = Buffer.from(header);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/** Constant-time string comparison for the webhook verify token. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
