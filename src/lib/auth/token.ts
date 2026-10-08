import { SignJWT, jwtVerify } from "jose";

/**
 * Edge-safe session token helpers (used by both middleware and server code).
 * Kept free of Node-only imports so middleware can run on the edge runtime.
 */

export const SESSION_COOKIE = "hp_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** uid: user, oid: active organisation, sv: the user's session version when issued. */
export type SessionPayload = { uid: string; oid: string; sv: number };

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (min 32 chars)");
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.uid !== "string" || typeof payload.oid !== "string" || payload.typ !== undefined) return null;
    // Tokens issued before session versions existed count as version 0.
    return { uid: payload.uid, oid: payload.oid, sv: typeof payload.sv === "number" ? payload.sv : 0 };
  } catch {
    return null;
  }
}

/**
 * Short-lived proof that the password was right for a user who still has to
 * enter their two-factor code. Typed "2fa" and missing `oid`, so it can never
 * pass as a session.
 */
export const PENDING_2FA_COOKIE = "hp_2fa";
export const PENDING_2FA_TTL_SECONDS = 5 * 60;

export type Pending2faPayload = { uid: string; sv: number };

export async function signPending2fa(payload: Pending2faPayload): Promise<string> {
  return new SignJWT({ ...payload, typ: "2fa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${PENDING_2FA_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifyPending2fa(token: string | undefined): Promise<Pending2faPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.typ !== "2fa" || typeof payload.uid !== "string" || typeof payload.sv !== "number") return null;
    return { uid: payload.uid, sv: payload.sv };
  } catch {
    return null;
  }
}
