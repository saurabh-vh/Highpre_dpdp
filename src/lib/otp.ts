import "server-only";
import { randomInt, timingSafeEqual } from "crypto";
import { sha256 } from "./crypto";
import { rateLimit } from "./rate-limit";
import { Otp } from "@/models";

export type OtpPurpose = "rights" | "parental";

const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

// The purpose is part of the hash, so a code issued for one flow can't be used in another.
const hashCode = (purpose: OtpPurpose, siteKey: string, email: string, code: string) => sha256(`${purpose}:${siteKey}:${email}:${code}`);

/** Creates a fresh 6-digit code (replacing earlier ones) or returns null when this email has asked too often. */
export async function issueOtp(purpose: OtpPurpose, siteKey: string, email: string): Promise<string | null> {
  if (!(await rateLimit(`otp-email:${purpose}:${email}`, 3, TTL_MS)).allowed) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await Otp.deleteMany({ email, siteKey, purpose });
  await Otp.create({ email, siteKey, purpose, codeHash: hashCode(purpose, siteKey, email, code), expiresAt: new Date(Date.now() + TTL_MS) });
  return code;
}

export type OtpCheck = "ok" | "expired" | "wrong";

/** Checks a code in constant time. A correct code is consumed; wrong guesses count towards a lockout. */
export async function verifyOtp(purpose: OtpPurpose, siteKey: string, email: string, code: string): Promise<OtpCheck> {
  const otp = await Otp.findOne({ email, siteKey, purpose, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
  if (!otp || otp.attempts >= MAX_ATTEMPTS) return "expired";
  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(purpose, siteKey, email, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    otp.attempts += 1;
    await otp.save();
    return "wrong";
  }
  await otp.deleteOne();
  return "ok";
}
