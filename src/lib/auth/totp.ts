import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { sha256 } from "@/lib/crypto";

/**
 * Time-based one-time passwords (RFC 6238) for authenticator apps, on
 * node:crypto alone: HMAC-SHA1, 6 digits, 30-second steps, accepting one step
 * either side for clock drift. Secrets are Base32 (RFC 4648, no padding).
 */

export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes Base32, ignoring case, spaces, dashes and padding. Throws on other characters. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Invalid Base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, Base32-encoded (32 characters). */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

/** The secret in groups of four, for typing into an app by hand. */
export const formatTotpKey = (secret: string) => secret.replace(/(.{4})(?=.)/g, "$1 ");

/** RFC 4226 HOTP for a counter. `digits` is only varied by the RFC test vectors. */
export function hotp(key: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (now = Date.now()) => Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);

export const totpCode = (secret: string, now = Date.now()) => hotp(base32Decode(secret), totpStep(now));

/**
 * Checks a 6-digit code against the current step ±1. Returns the matching
 * step, or null. Steps at or before `lastStep` are refused, so a code can't be
 * replayed (store the returned step as the new `lastStep`).
 */
export function verifyTotp(secret: string, code: string, opts: { now?: number; lastStep?: number | null } = {}): number | null {
  const candidate = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(candidate)) return null;
  const key = base32Decode(secret);
  const current = totpStep(opts.now);
  let matched: number | null = null;
  // Check every step in the window so timing doesn't reveal which one matched.
  for (let step = current - WINDOW; step <= current + WINDOW; step++) {
    if (timingSafeEqual(Buffer.from(hotp(key, step)), Buffer.from(candidate)) && matched === null) matched = step;
  }
  if (matched === null || (opts.lastStep != null && matched <= opts.lastStep)) return null;
  return matched;
}

/** Link authenticator apps understand, usually shown as a QR code. */
export function otpauthUrl(opts: { secret: string; account: string; issuer?: string }): string {
  const issuer = opts.issuer ?? "HighPre";
  const label = encodeURIComponent(`${issuer}:${opts.account}`);
  const params = new URLSearchParams({ secret: opts.secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}

// Recovery codes avoid look-alike characters (0/o, 1/l/i) and read as "xxxxx-xxxxx".
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Ten single-use recovery codes. Show them once; store only `hashRecoveryCode` values. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** Hash of a recovery code, tolerant of case, spaces and a missing dash. */
export const hashRecoveryCode = (code: string) => sha256(`recovery:${code.toLowerCase().replace(/[\s-]/g, "")}`);

/** Looks like a recovery code rather than an authenticator code. */
export const isRecoveryCodeFormat = (code: string) => /^[a-z0-9]{10}$/i.test(code.replace(/[\s-]/g, "")) && !/^\d+$/.test(code.replace(/[\s-]/g, ""));
