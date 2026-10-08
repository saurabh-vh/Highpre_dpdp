import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { Types } from "mongoose";
import { env } from "@/lib/env";
import { AgentPolicy } from "@/models";
import { AGENT_DATA_TYPE_KEYS, type AgentApp, type AgentDataType } from "./catalog";

export type AgentPolicySettings = {
  dataTypes: AgentDataType[];
  allowedApps: AgentApp[];
  extensionMode: "warn" | "block";
  enrollmentEnabled: boolean;
  enrollKeyVersion: number;
};

const DEFAULTS: AgentPolicySettings = {
  dataTypes: [...AGENT_DATA_TYPE_KEYS],
  allowedApps: [],
  extensionMode: "warn",
  enrollmentEnabled: false,
  enrollKeyVersion: 1,
};

/** The organisation's agent settings, or the defaults (watch everything, approve nothing). */
export async function getAgentPolicy(orgId: Types.ObjectId | string): Promise<AgentPolicySettings> {
  const doc = await AgentPolicy.findOne({ orgId }).lean();
  if (!doc) return { ...DEFAULTS };
  return {
    dataTypes: doc.dataTypes as AgentDataType[],
    allowedApps: doc.allowedApps as AgentApp[],
    extensionMode: doc.extensionMode as "warn" | "block",
    enrollmentEnabled: doc.enrollmentEnabled,
    enrollKeyVersion: doc.enrollKeyVersion,
  };
}

/** The part of the policy every device receives. Nothing identifying. */
export const devicePolicy = (p: AgentPolicySettings) => ({ dataTypes: p.dataTypes, allowedApps: p.allowedApps, extensionMode: p.extensionMode });

/*
 * Company enrolment keys are derived, not stored: hpe_<orgId>.<version>.<mac>.
 * The server recomputes the MAC, so a key can't be forged for another
 * organisation, and rotating (bumping the version) retires every old key.
 */
const mac = (orgId: string, version: number) =>
  createHmac("sha256", env().SESSION_SECRET).update(`agent-enroll|${orgId}|${version}`).digest("base64url").slice(0, 32);

export const enrollKeyFor = (orgId: Types.ObjectId | string, version: number) => `hpe_${String(orgId)}.${version}.${mac(String(orgId), version)}`;

export function parseEnrollKey(key: string): { orgId: string; version: number } | null {
  const m = /^hpe_([a-f0-9]{24})\.(\d{1,6})\.([A-Za-z0-9_-]{32})$/.exec(key);
  if (!m) return null;
  const [, orgId, v, given] = m;
  const version = Number(v);
  const expected = Buffer.from(mac(orgId, version));
  const actual = Buffer.from(given);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? { orgId, version } : null;
}
