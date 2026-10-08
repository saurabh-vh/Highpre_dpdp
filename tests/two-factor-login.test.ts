import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two-factor sign-in end to end through the real server actions, against an
 * in-memory MongoDB (same setup as integration.test.ts). Next's cookie store,
 * request headers and redirect() are replaced with small fakes.
 */
const jar = vi.hoisted(() => new Map<string, string>());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("highpre-2fa-test");
  const { connectDb } = await import("@/lib/db");
  await connectDb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

beforeEach(() => jar.clear());

/** Resolves to the redirect target, or fails if the action returned instead. */
async function redirectOf(run: Promise<unknown>): Promise<string> {
  try {
    const result = await run;
    throw new Error(`Expected a redirect, got ${JSON.stringify(result)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
}

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

async function createUser(email: string, twoFactor: boolean) {
  const { hashPassword } = await import("@/lib/auth/password");
  const { encryptSecret } = await import("@/lib/crypto");
  const { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode } = await import("@/lib/auth/totp");
  const { Organization, User } = await import("@/models");
  const secret = generateTotpSecret();
  const codes = generateRecoveryCodes();
  const user = await User.create({
    name: "Asha",
    email,
    passwordHash: await hashPassword("correct horse battery"),
    ...(twoFactor ? { twoFactorEnabled: true, totpSecret: encryptSecret(secret), recoveryCodeHashes: codes.map(hashRecoveryCode) } : {}),
  });
  await Organization.create({ name: "Clinic", members: [{ userId: user._id, role: "owner" }] });
  return { user, secret, codes };
}

describe("login with two-factor sign-in", () => {
  it("asks for a code before creating a session, and refuses replays", async () => {
    const { loginAction, verifyTwoFactorLoginAction } = await import("@/features/auth/actions");
    const { SESSION_COOKIE, PENDING_2FA_COOKIE, verifySession } = await import("@/lib/auth/token");
    const { totpCode } = await import("@/lib/auth/totp");
    const { user, secret } = await createUser("asha@clinic.in", true);
    const login = () => loginAction({}, form({ email: "asha@clinic.in", password: "correct horse battery", next: "/dashboard/requests" }));

    // Step 1: right password → second step, no session.
    expect(await redirectOf(login())).toBe("/login/two-factor?next=%2Fdashboard%2Frequests");
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(jar.has(PENDING_2FA_COOKIE)).toBe(true);
    // The pending token can't be passed off as a session.
    expect(await verifySession(jar.get(PENDING_2FA_COOKIE))).toBeNull();

    // Wrong code: stays on the second step.
    const code = totpCode(secret);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    const failed = await verifyTwoFactorLoginAction({}, form({ code: wrong, next: "/dashboard/requests" }));
    expect(failed.fieldErrors?.code).toBeTruthy();
    expect(jar.has(SESSION_COOKIE)).toBe(false);

    // Right code: session created, pending cookie gone.
    expect(await redirectOf(verifyTwoFactorLoginAction({}, form({ code, next: "/dashboard/requests" })))).toBe("/dashboard/requests");
    expect((await verifySession(jar.get(SESSION_COOKIE)))?.uid).toBe(String(user._id));
    expect(jar.has(PENDING_2FA_COOKIE)).toBe(false);

    // The same code can't be used again.
    jar.clear();
    await redirectOf(login());
    const replay = await verifyTwoFactorLoginAction({}, form({ code }));
    expect(replay.ok).toBe(false);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("accepts each recovery code once", async () => {
    const { loginAction, verifyTwoFactorLoginAction } = await import("@/features/auth/actions");
    const { SESSION_COOKIE } = await import("@/lib/auth/token");
    const { User } = await import("@/models");
    const { user, codes } = await createUser("ravi@clinic.in", true);
    const login = () => loginAction({}, form({ email: "ravi@clinic.in", password: "correct horse battery" }));

    await redirectOf(login());
    expect(await redirectOf(verifyTwoFactorLoginAction({}, form({ code: codes[0].toUpperCase() })))).toBe("/dashboard");
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    const left = await User.findById(user._id).select("+recoveryCodeHashes").lean();
    expect(left?.recoveryCodeHashes).toHaveLength(9);

    jar.clear();
    await redirectOf(login());
    const reused = await verifyTwoFactorLoginAction({}, form({ code: codes[0] }));
    expect(reused.ok).toBe(false);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("refuses the second step without a pending sign-in or after a password change", async () => {
    const { loginAction, verifyTwoFactorLoginAction } = await import("@/features/auth/actions");
    const { SESSION_COOKIE } = await import("@/lib/auth/token");
    const { totpCode } = await import("@/lib/auth/totp");
    const { User } = await import("@/models");
    const { user, secret } = await createUser("meera@clinic.in", true);

    expect((await verifyTwoFactorLoginAction({}, form({ code: totpCode(secret) }))).ok).toBe(false);

    await redirectOf(loginAction({}, form({ email: "meera@clinic.in", password: "correct horse battery" })));
    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } });
    expect((await verifyTwoFactorLoginAction({}, form({ code: totpCode(secret) }))).ok).toBe(false);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
  });

  it("signs users without two-factor straight in", async () => {
    const { loginAction } = await import("@/features/auth/actions");
    const { SESSION_COOKIE, PENDING_2FA_COOKIE } = await import("@/lib/auth/token");
    await createUser("plain@clinic.in", false);
    expect(await redirectOf(loginAction({}, form({ email: "plain@clinic.in", password: "correct horse battery" })))).toBe("/dashboard");
    expect(jar.has(SESSION_COOKIE)).toBe(true);
    expect(jar.has(PENDING_2FA_COOKIE)).toBe(false);
  });
});
