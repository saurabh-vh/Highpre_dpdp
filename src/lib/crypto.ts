import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "./env";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** URL-safe random token. */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Short, human-friendly reference code, e.g. "HP-7K2Q9M". Avoids ambiguous characters. */
export function referenceCode(prefix = "HP"): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return `${prefix}-${Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("")}`;
}

// Key for secrets kept in the database (authenticator secrets), derived from
// SESSION_SECRET with a purpose label so it never equals the JWT signing key.
const secretBoxKey = () => createHash("sha256").update(`highpre:secret-box:v1:${env().SESSION_SECRET}`).digest();

/** Encrypts a small secret with AES-256-GCM. Output: "v1.<iv>.<tag>.<ciphertext>" (base64url). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretBoxKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** Reverses `encryptSecret`. Throws if the value was altered or the key changed. */
export function decryptSecret(box: string): string {
  const [version, iv, tag, data] = box.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", secretBoxKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
