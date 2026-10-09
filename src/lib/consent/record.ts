import "server-only";
import type { Types } from "mongoose";
import type { Lang } from "@/lib/i18n/languages";
import { ConsentRecord } from "@/models";
import { consentHash } from "./hash";

type NewConsent = {
  siteId: Types.ObjectId;
  principalId: string;
  action: "grant" | "update" | "withdraw";
  noticeVersion: number;
  decisions: { purpose: string; granted: boolean }[];
  language: Lang;
  ageGroup?: "adult" | "child";
  parentalConsentId?: Types.ObjectId;
  /** Form consent only; banner records leave these unset. */
  source?: "form";
  formId?: string;
  receiptId?: string;
  pageUrl?: string;
  ipHash?: string;
  userAgent?: string;
};

/** Appends one record to the consent ledger with its content hash. */
export async function appendConsent(input: NewConsent) {
  const createdAt = new Date();
  const hash = consentHash({
    ...input,
    siteId: String(input.siteId),
    parentalConsentId: input.parentalConsentId ? String(input.parentalConsentId) : null,
    createdAt,
  });
  return ConsentRecord.create({ ...input, createdAt, hash });
}
