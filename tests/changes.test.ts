import { describe, expect, it } from "vitest";
import { alertable, detectChanges } from "@/lib/scanner/changes";

const now = new Date("2026-10-09T06:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

const base = {
  url: "https://shop.example.in/",
  score: 80,
  trackers: [{ id: "ga4", name: "Google Analytics" }, { id: "hotjar", name: "Hotjar" }],
  consentTool: "HighPre",
  privacyNoticeUrl: "https://shop.example.in/privacy",
  findings: [{ id: "notice" }, { id: "grievance" }, { id: "https" }],
  security: { certificate: { validTo: days(90), authorized: true } },
};

describe("detectChanges", () => {
  it("finds nothing when nothing changed", () => {
    expect(detectChanges(base, base, now)).toEqual([]);
  });

  it("names new and removed trackers", () => {
    const changes = detectChanges(base, { ...base, trackers: [{ id: "ga4", name: "Google Analytics" }, { id: "meta_pixel", name: "Meta Pixel" }] }, now);
    expect(changes.map((c) => [c.kind, c.severity])).toEqual([
      ["trackers_added", "warning"],
      ["trackers_removed", "info"],
    ]);
    expect(changes[0].message).toContain("Meta Pixel");
    expect(changes[1].message).toContain("Hotjar");
    expect(alertable(changes).map((c) => c.kind)).toEqual(["trackers_added"]);
  });

  it("flags a lost banner, notice link, grievance contact and HTTPS", () => {
    const current = { ...base, url: "http://shop.example.in/", consentTool: undefined, privacyNoticeUrl: undefined, findings: [{ id: "no_notice" }, { id: "no_grievance" }, { id: "no_https" }], security: {} };
    const kinds = detectChanges(base, current, now).map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(["consent_tool_lost", "privacy_notice_lost", "grievance_lost", "https_lost"]));
    expect(detectChanges(base, current, now).slice(0, 3).every((c) => c.severity === "critical")).toBe(true);
  });

  it("reports an expiring or expired certificate on every scan while it lasts", () => {
    const expiring = { ...base, security: { certificate: { validTo: days(10), authorized: true } } };
    expect(detectChanges(expiring, expiring, now)).toEqual([expect.objectContaining({ kind: "ssl_expiring", severity: "warning" })]);
    const expired = { ...base, security: { certificate: { validTo: days(-1), authorized: true } } };
    expect(detectChanges(base, expired, now)).toEqual([expect.objectContaining({ kind: "ssl_expired", severity: "critical" })]);
  });

  it("flags a score drop of 10 points or more, not less", () => {
    expect(detectChanges(base, { ...base, score: 71 }, now)).toEqual([]);
    expect(detectChanges(base, { ...base, score: 70 }, now)).toEqual([expect.objectContaining({ kind: "score_dropped", message: expect.stringContaining("from 80 to 70") })]);
  });
});
