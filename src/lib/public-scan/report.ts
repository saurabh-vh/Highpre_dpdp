import { randomBytes } from "crypto";
import { REPORT_ID_PATTERN, REPORT_TTL_SECONDS } from "./constants";

export { REPORT_TTL_DAYS, REPORT_TTL_SECONDS } from "./constants";

/** Unguessable, URL-safe report id: 16 random bytes, 22 characters. */
export function newReportId(): string {
  return randomBytes(16).toString("base64url");
}

export const isReportId = (value: unknown): value is string => typeof value === "string" && REPORT_ID_PATTERN.test(value);

export function reportExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + REPORT_TTL_SECONDS * 1000);
}

/**
 * The TTL monitor runs about once a minute, so a report can outlive its
 * expiry briefly. Pages check this too, so an expired link never renders.
 */
export function isReportExpired(createdAt: Date, now = new Date()): boolean {
  return reportExpiresAt(createdAt).getTime() <= now.getTime();
}
