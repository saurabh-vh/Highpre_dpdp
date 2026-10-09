import { createHash } from "crypto";

/**
 * Content hash for a consent record. Stored with the record at write time and
 * recomputed by the evidence pack: a mismatch means the stored evidence was
 * changed after it was written. Field order is fixed so the hash is stable.
 */
export type HashableConsent = {
  siteId: string;
  principalId: string;
  action: string;
  noticeVersion: number;
  decisions: { purpose?: string | null; granted?: boolean | null }[];
  language?: string | null;
  ageGroup?: string | null;
  parentalConsentId?: string | null;
  /** Form consent fields. Absent on banner records, which then hash exactly as before. */
  source?: string | null;
  formId?: string | null;
  receiptId?: string | null;
  createdAt: Date;
};

export function consentHash(r: HashableConsent): string {
  const fields: unknown[] = [
    r.siteId,
    r.principalId,
    r.action,
    r.noticeVersion,
    r.decisions.map((d) => [d.purpose ?? "", Boolean(d.granted)]),
    r.language ?? "en",
    r.ageGroup ?? "",
    r.parentalConsentId ?? "",
    r.createdAt.toISOString(),
  ];
  // Appended only when present, so records written before form consent still verify.
  if (r.source || r.formId || r.receiptId) fields.push(r.source ?? "", r.formId ?? "", r.receiptId ?? "");
  const canonical = JSON.stringify(fields);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Digest over a sequence of record hashes: one value that pins the whole ledger. */
export function ledgerDigest(hashes: Iterable<string>): string {
  const h = createHash("sha256");
  for (const value of hashes) h.update(value);
  return h.digest("hex");
}
