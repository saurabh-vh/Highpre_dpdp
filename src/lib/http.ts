import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "./env";
import { rateLimit } from "./rate-limit";
import { sha256 } from "./crypto";

/** CORS headers for endpoints called by the widget from customer websites. */
export const PUBLIC_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

export const preflight = () => new NextResponse(null, { status: 204, headers: PUBLIC_CORS });

export function json(data: unknown, init: { status?: number; cors?: boolean; headers?: HeadersInit } = {}) {
  const headers = new Headers(init.headers);
  if (init.cors) for (const [k, v] of Object.entries(PUBLIC_CORS)) headers.set(k, v);
  return NextResponse.json(data, { status: init.status ?? 200, headers });
}

/**
 * The caller's IP, read only from the header your proxy sets (CLIENT_IP_HEADER),
 * so clients can't spoof their way around rate limits.
 */
export function clientIp(req: NextRequest | Request | { headers: { get(name: string): string | null } }): string {
  const value = req.headers.get(env().CLIENT_IP_HEADER);
  return value?.split(",")[0]?.trim() || "unknown";
}

/** Salted hash so raw IP addresses are never stored. */
export const hashIp = (ip: string) => sha256(`${env().IP_HASH_SALT}:${ip}`);

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export async function limitOrNull(req: Request, scope: string, limit: number, windowMs: number, cors = false) {
  const { allowed, retryAfter } = await rateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  if (allowed) return null;
  return json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, cors, headers: { "Retry-After": String(retryAfter) } },
  );
}
