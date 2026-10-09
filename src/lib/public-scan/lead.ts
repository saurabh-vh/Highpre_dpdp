import { z } from "zod";
import { MARKETING_CONSENT, REPORT_ID_PATTERN } from "./constants";

export { MARKETING_CONSENT } from "./constants";

/** Checkbox values from forms ("on") or JSON (true). Anything else, including nothing, means no. */
const optIn = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");

export const scanLeadSchema = z.object({
  reportId: z.string().regex(REPORT_ID_PATTERN, "This report link isn't valid."),
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email address."),
  marketing: optIn,
});

export type ScanLeadInput = z.infer<typeof scanLeadSchema>;

/** The consent record stored on a lead: the choice, when, for what, and the wording shown. */
export function marketingConsentRecord(granted: boolean, at = new Date()) {
  return { granted, at, purpose: MARKETING_CONSENT.purpose, noticeVersion: MARKETING_CONSENT.version, text: MARKETING_CONSENT.text };
}
