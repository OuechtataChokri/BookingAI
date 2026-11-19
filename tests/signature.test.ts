import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSignature, safeEqual, verifyWhatsAppSignature } from "../lib/whatsapp/signature.ts";
import { normalizePhone } from "../lib/utils.ts";

describe("WhatsApp webhook signature verification", () => {
  const secret = "test-app-secret-123";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("accepts a valid X-Hub-Signature-256 header", () => {
    const sig = computeSignature(body, secret);
    assert.equal(verifyWhatsAppSignature(body, sig, secret), true);
  });

  it("rejects tampered body, wrong secret, or missing header", () => {
    const sig = computeSignature(body, secret);
    assert.equal(verifyWhatsAppSignature(body + " ", sig, secret), false);
    assert.equal(verifyWhatsAppSignature(body, sig, "wrong-secret"), false);
    assert.equal(verifyWhatsAppSignature(body, null, secret), false);
    assert.equal(verifyWhatsAppSignature(body, "sha256=deadbeef", secret), false);
  });

  it("compares verify tokens safely", () => {
    assert.equal(safeEqual("my-token", "my-token"), true);
    assert.equal(safeEqual("my-token", "my-tokeN"), false);
    assert.equal(safeEqual("short", "longer"), false);
  });
});

describe("phone normalization", () => {
  it("strips spaces, dashes, + and leading 00", () => {
    assert.equal(normalizePhone("+216 20-123 456"), "21620123456");
    assert.equal(normalizePhone("00216 55 000 111"), "21655000111");
  });
});
