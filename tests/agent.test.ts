import { describe, expect, it } from "vitest";
import { AGENT_APP_KEYS, AGENT_DATA_TYPE_KEYS } from "@/lib/agent/catalog";
import { alertsSchema, heartbeatSchema } from "@/lib/agent/ingest";
import { withTrailer } from "@/lib/agent/package";
import { createZip } from "@/lib/agent/zip";

describe("agent alert validation", () => {
  const event = { dataType: "card_number", app: "chatgpt", occurredAt: "2026-10-08T10:00:00Z" };

  it("accepts type, app and time", () => {
    expect(alertsSchema.safeParse({ events: [event] }).success).toBe(true);
  });

  it("rejects any extra field, so content can never be stored", () => {
    expect(alertsSchema.safeParse({ events: [{ ...event, text: "4111 1111 1111 1111" }] }).success).toBe(false);
    expect(alertsSchema.safeParse({ events: [event], clipboard: "secret" }).success).toBe(false);
  });

  it("rejects unknown data types and apps", () => {
    expect(alertsSchema.safeParse({ events: [{ ...event, dataType: "4111111111111111" }] }).success).toBe(false);
    expect(alertsSchema.safeParse({ events: [{ ...event, app: "my private doc title" }] }).success).toBe(false);
  });

  it("accepts the extension's source and outcome, only from known values", () => {
    expect(alertsSchema.safeParse({ events: [{ ...event, source: "extension", outcome: "sent_anyway" }] }).success).toBe(true);
    expect(alertsSchema.safeParse({ events: [{ ...event, outcome: "pasted: 4111 1111 1111 1111" }] }).success).toBe(false);
  });

  it("accepts how it was shared and the hidden-details outcome, only from known values", () => {
    for (const via of ["paste", "typed", "drop", "file", "clipboard"]) {
      expect(alertsSchema.safeParse({ events: [{ ...event, source: "extension", outcome: "masked", via }] }).success, via).toBe(true);
    }
    expect(alertsSchema.safeParse({ events: [{ ...event, via: "customers.xlsx" }] }).success).toBe(false);
    expect(alertsSchema.safeParse({ events: [{ ...event, outcome: "hidden" }] }).success).toBe(false);
  });

  it("caps batch size", () => {
    expect(alertsSchema.safeParse({ events: Array(51).fill(event) }).success).toBe(false);
  });

  it("cleans device names", () => {
    const parsed = heartbeatSchema.parse({ hostname: "PRIYA-LAPTOP\u0007\n", osVersion: "Windows 11", agentVersion: "1.0.0" });
    expect(parsed.hostname).toBe("PRIYA-LAPTOP");
  });
});

describe("catalog matches the Go agent", () => {
  it("lists the same keys as agent/detect.go and agent/apps.go", async () => {
    const { readFileSync } = await import("fs");
    const detect = readFileSync("agent/detect.go", "utf8");
    const apps = readFileSync("agent/apps.go", "utf8");
    for (const key of AGENT_DATA_TYPE_KEYS) expect(detect, key).toContain(`add("${key}")`);
    for (const key of AGENT_APP_KEYS) expect(apps, key).toContain(`{"${key}",`);
    for (const key of AGENT_APP_KEYS) expect(apps, key).toContain(`"${key}": "`); // and a label
  });
});

describe("agent packaging", () => {
  it("appends a config trailer the agent can find from the end of the file", () => {
    const config = { apiUrl: "https://app.example.in", token: "hpa_x", orgName: "Acme", userName: "Priya" };
    const out = withTrailer(Buffer.from("MZ-binary"), config);
    expect(out.subarray(-8).toString()).toBe("HPCFG01!");
    const len = out.readUInt32LE(out.length - 12);
    expect(JSON.parse(out.subarray(out.length - 12 - len, out.length - 12).toString())).toEqual(config);
    expect(out.subarray(0, 9).toString()).toBe("MZ-binary");
  });

  it("writes a valid zip with Unix permissions", () => {
    const zip = createZip([
      { name: "HighPre Agent/highpre-agent", data: Buffer.from("binary"), mode: 0o755 },
      { name: "HighPre Agent/config.json", data: Buffer.from("{}"), mode: 0o600 },
    ]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    const central = zip.readUInt32LE(end + 16);
    expect(zip.readUInt32LE(central)).toBe(0x02014b50);
    expect((zip.readUInt32LE(central + 38) >>> 16) & 0o777).toBe(0o755);
  });
});
