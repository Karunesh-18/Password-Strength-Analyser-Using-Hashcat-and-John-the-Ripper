import crypto from "crypto";

// ponytail: no key rotation/versioning - add a key-id prefix to the stored
// payload if VAULT_SECRET ever needs to change without breaking old entries.
const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const secret = process.env.VAULT_SECRET;
  if (!secret) {
    throw new Error(
      "VAULT_SECRET is not set - refusing to store a vault password without encryption"
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/** Encrypts plaintext to a single "iv:authTag:ciphertext" hex string. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

/** Reverses encrypt(). Throws if VAULT_SECRET changed or the payload was tampered with. */
export function decrypt(payload: string): string {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = payload.split(":");
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
