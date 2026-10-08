import "server-only";
import { cookies } from "next/headers";
import {
  PENDING_2FA_COOKIE,
  PENDING_2FA_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signPending2fa,
  signSession,
  verifyPending2fa,
  verifySession,
  type Pending2faPayload,
  type SessionPayload,
} from "./token";

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Remembers, for 5 minutes, that the password step passed and a two-factor code is due. */
export async function createPending2fa(payload: Pending2faPayload): Promise<void> {
  const token = await signPending2fa(payload);
  const store = await cookies();
  store.set(PENDING_2FA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_2FA_TTL_SECONDS,
  });
}

export async function readPending2fa(): Promise<Pending2faPayload | null> {
  const store = await cookies();
  return verifyPending2fa(store.get(PENDING_2FA_COOKIE)?.value);
}

export async function clearPending2fa(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_2FA_COOKIE);
}
