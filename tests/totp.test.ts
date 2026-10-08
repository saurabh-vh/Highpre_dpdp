import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  formatTotpKey,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  isRecoveryCodeFormat,
  otpauthUrl,
  totpCode,
  totpStep,
  verifyTotp,
} from "@/lib/auth/totp";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// RFC 6238 Appendix B, SHA-1 column: ASCII "12345678901234567890", 8 digits, 30 s steps.
const RFC_KEY = Buffer.from("12345678901234567890", "ascii");
const RFC_VECTORS: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(RFC_VECTORS)("matches the SHA-1 test vector at T=%i", (seconds, expected) => {
    expect(hotp(RFC_KEY, totpStep(seconds * 1000), 8)).toBe(expected);
  });

  it("produces 6-digit codes from a Base32 secret (last 6 digits of the RFC vector)", () => {
    const secret = base32Encode(RFC_KEY);
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(secret, 59_000)).toBe("287082");
    expect(totpCode(secret, 1111111109_000)).toBe("081804");
  });

  it("accepts one step either side for clock drift, and no further", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_015_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, now), { now })).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), { now })).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, now + 30_000), { now })).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, now - 60_000), { now })).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, now + 60_000), { now })).toBeNull();
  });

  it("refuses a code from a step that was already used (replay)", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_015_000;
    const code = totpCode(secret, now);
    const used = verifyTotp(secret, code, { now })!;
    expect(verifyTotp(secret, code, { now, lastStep: used })).toBeNull();
    // An older (still in-window) code is refused once a newer step was used.
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), { now, lastStep: used })).toBeNull();
    // The next step's code still works.
    expect(verifyTotp(secret, totpCode(secret, now + 30_000), { now: now + 30_000, lastStep: used })).toBe(used + 1);
  });

  it("rejects malformed and wrong codes", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_015_000;
    const right = totpCode(secret, now);
    const wrong = String((Number(right) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyTotp(secret, wrong, { now })).toBeNull();
    expect(verifyTotp(secret, "12345", { now })).toBeNull();
    expect(verifyTotp(secret, "abcdef", { now })).toBeNull();
    expect(verifyTotp(secret, `${right.slice(0, 3)} ${right.slice(3)}`, { now })).toBe(totpStep(now));
  });
});

describe("Base32", () => {
  it("round-trips random bytes and matches RFC 4648 vectors", () => {
    for (let i = 0; i < 50; i++) {
      const bytes = Buffer.from(Array.from({ length: i }, (_, j) => (j * 37 + i) & 255));
      expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
    }
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb-oi======").toString()).toBe("foobar");
    expect(() => base32Decode("MZXW1")).toThrow();
  });

  it("generates 160-bit secrets and groups the key in fours", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(formatTotpKey("ABCDEFGHIJKL")).toBe("ABCD EFGH IJKL");
  });

  it("builds an otpauth link authenticator apps accept", () => {
    const link = otpauthUrl({ secret: "JBSWY3DPEHPK3PXP", account: "a@b.in" });
    expect(link.startsWith("otpauth://totp/HighPre%3Aa%40b.in?")).toBe(true);
    const url = new URL(link);
    expect(url.searchParams.get("secret")).toBe("JBSWY3DPEHPK3PXP");
    expect(url.searchParams.get("issuer")).toBe("HighPre");
  });
});

describe("recovery codes", () => {
  it("generates ten distinct codes and hashes them tolerantly", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) {
      expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
      expect(isRecoveryCodeFormat(c)).toBe(true);
      expect(hashRecoveryCode(c.toUpperCase().replace("-", " "))).toBe(hashRecoveryCode(c));
    }
    expect(isRecoveryCodeFormat("123456")).toBe(false);
    expect(hashRecoveryCode(codes[0])).not.toBe(hashRecoveryCode(codes[1]));
  });

  // Single use against the database is covered in two-factor-login.test.ts.
});

describe("encrypted secrets", () => {
  it("round-trips, uses a fresh IV and detects tampering", () => {
    const secret = generateTotpSecret();
    const a = encryptSecret(secret);
    const b = encryptSecret(secret);
    expect(a).not.toBe(b);
    expect(a).not.toContain(secret);
    expect(decryptSecret(a)).toBe(secret);
    const parts = a.split(".");
    const data = Buffer.from(parts[3], "base64url");
    data[0] ^= 1;
    parts[3] = data.toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
