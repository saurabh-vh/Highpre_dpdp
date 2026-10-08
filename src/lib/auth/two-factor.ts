import "server-only";
import { decryptSecret } from "@/lib/crypto";
import { log } from "@/lib/log";
import { User } from "@/models";
import { hashRecoveryCode, isRecoveryCodeFormat, verifyTotp } from "./totp";

export type SecondFactor = "totp" | "recovery";

/**
 * Checks an authenticator code (or, unless `allowRecovery` is false, a
 * recovery code) for a user with two-factor sign-in on, and consumes it.
 * Both updates are conditional, so two requests racing with the same code
 * can't both succeed. Returns which kind of code worked, or null.
 */
export async function checkSecondFactor(userId: string, code: string, { allowRecovery = true } = {}): Promise<SecondFactor | null> {
  const user = await User.findById(userId).select("+totpSecret +totpLastStep twoFactorEnabled").lean();
  if (!user?.twoFactorEnabled || !user.totpSecret) return null;
  const value = code.trim();

  if (/^[\d\s]+$/.test(value)) {
    let secret: string;
    try {
      secret = decryptSecret(user.totpSecret);
    } catch (error) {
      log.error("two_factor.decrypt_failed", { userId, error: String(error) });
      return null;
    }
    const step = verifyTotp(secret, value, { lastStep: user.totpLastStep });
    if (step === null) return null;
    const res = await User.updateOne({ _id: userId, totpLastStep: { $not: { $gte: step } } }, { $set: { totpLastStep: step } });
    return res.modifiedCount === 1 ? "totp" : null;
  }

  if (allowRecovery && isRecoveryCodeFormat(value)) {
    const hash = hashRecoveryCode(value);
    const res = await User.updateOne({ _id: userId, recoveryCodeHashes: hash }, { $pull: { recoveryCodeHashes: hash } });
    return res.modifiedCount === 1 ? "recovery" : null;
  }
  return null;
}

/** Unused recovery codes left for a user. */
export async function recoveryCodesLeft(userId: string): Promise<number> {
  const user = await User.findById(userId).select("+recoveryCodeHashes").lean();
  return user?.recoveryCodeHashes?.length ?? 0;
}
