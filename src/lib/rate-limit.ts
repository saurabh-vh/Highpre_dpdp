import "server-only";
import { connectDb } from "./db";
import { log } from "./log";
import { RateLimitBucket } from "@/models";

export type RateLimitResult = { allowed: boolean; retryAfter: number };

/**
 * Fixed-window rate limiter backed by MongoDB, so limits hold across every
 * app instance without extra infrastructure. One atomic upsert per call.
 * If the database is unreachable it falls back to a per-process counter
 * rather than failing open.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = new Date();
  try {
    await connectDb();
    const live = { $gt: ["$resetAt", now] };
    // Pipeline update: keep counting inside a live window, otherwise start a new one.
    const doc = await RateLimitBucket.collection.findOneAndUpdate(
      { key },
      [
        {
          $set: {
            count: { $cond: [live, { $add: ["$count", 1] }, 1] },
            resetAt: { $cond: [live, "$resetAt", new Date(now.getTime() + windowMs)] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    const count = (doc?.count as number) ?? 1;
    const resetAt = (doc?.resetAt as Date) ?? now;
    if (count > limit) return { allowed: false, retryAfter: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000)) };
    return { allowed: true, retryAfter: 0 };
  } catch (error) {
    log.warn("rate_limit.fallback", { error: String(error) });
    return rateLimitMemory(key, limit, windowMs);
  }
}

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** In-process limiter: the database fallback, and handy in tests. */
export function rateLimitMemory(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 50_000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    return { allowed: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  return { allowed: true, retryAfter: 0 };
}
