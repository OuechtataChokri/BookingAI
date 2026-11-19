import "server-only";
import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption for secrets stored in the database
 * (WhatsApp access tokens). The key comes from TOKEN_ENCRYPTION_KEY.
 * If it is missing we derive one from the service role key so tokens are
 * never stored as plain text – but setting TOKEN_ENCRYPTION_KEY is better.
 */
function getKey(): Buffer {
  const material = env.tokenEncryptionKey || env.supabaseServiceRoleKey;
  if (!material) throw new Error("No encryption key available (set TOKEN_ENCRYPTION_KEY)");
  return createHash("sha256").update(material).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
