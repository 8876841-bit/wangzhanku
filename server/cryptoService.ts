import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive a 32-byte encryption key from the environment.
 * Falls back to a deterministic key derived from OPENAI_API_KEY if no dedicated key is set.
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.OPENAI_API_KEY || "default-dev-key-change-in-production";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string: iv(12) + authTag(16) + ciphertext
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv(12) + authTag(16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64-encoded ciphertext produced by encryptToken.
 */
export function decryptToken(ciphertext: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(ciphertext, "base64");

  const iv = packed.subarray(0, 12);
  const authTag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
