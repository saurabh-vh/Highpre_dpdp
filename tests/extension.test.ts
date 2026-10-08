import { readFileSync } from "fs";
import { createRequire } from "module";
import { describe, expect, it } from "vitest";
import { AGENT_APP_KEYS, AGENT_DATA_TYPE_KEYS, EXTENSION_SITES } from "@/lib/agent/catalog";
import { extensionCatalog, extensionManifest, iconPng } from "@/lib/agent/extension";

const { detect } = createRequire(import.meta.url)("../extension/detect.js") as { detect: (text: string, options?: { bare?: boolean }) => string[] };

describe("browser extension detection", () => {
  const cases = JSON.parse(readFileSync("agent/testdata/detect_cases.json", "utf8")) as { name: string; text: string; want: string[] }[];

  // The same cases run against agent/detect.go, so both detectors agree.
  it.each(cases)("$name", ({ text, want }) => {
    expect(detect(text)).toEqual(want);
  });

  it("finds bulk contact lists", () => {
    const list = Array.from({ length: 12 }, (_, i) => `customer${String.fromCharCode(97 + i)}@mail.in`).join(", ");
    expect(detect(list)).toEqual(["bulk_personal_data"]);
  });

  it("skips the lone-password check for typed messages", () => {
    expect(detect("Thanks2u!")).toEqual(["password"]);
    expect(detect("Thanks2u!", { bare: false })).toEqual([]);
    expect(detect("my password: hunter2!x", { bare: false })).toEqual(["password"]);
  });

  it("only reports data types the server accepts", () => {
    const source = readFileSync("extension/detect.js", "utf8");
    const pushed = [...source.matchAll(/found\.push\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(new Set(pushed)).toEqual(new Set(AGENT_DATA_TYPE_KEYS));
  });
});

describe("extension package", () => {
  const config = { apiUrl: "https://app.example.in", token: "hpa_x", orgName: "Acme Clinic", userName: "Priya" };

  it("runs only on the protected sites and talks only to HighPre", () => {
    const manifest = extensionManifest(config);
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.host_permissions).toEqual(["https://app.example.in/*"]);
    expect(manifest.permissions).toEqual(["storage", "alarms"]);
    expect(manifest.content_scripts[0].matches).toHaveLength(Object.keys(EXTENSION_SITES).length);
    expect(manifest.content_scripts[0].matches.every((m: string) => m.startsWith("https://") && !m.includes("*."))).toBe(true);
  });

  it("maps every site to a known app and has labels for every key", () => {
    const catalog = extensionCatalog();
    for (const app of Object.values(catalog.sites)) expect(AGENT_APP_KEYS).toContain(app);
    for (const key of AGENT_DATA_TYPE_KEYS) expect(catalog.data[key]).toBeTruthy();
  });

  it("reports only keys, never page text", () => {
    const background = readFileSync("extension/background.js", "utf8");
    // The event the extension sends is built from these fields only.
    expect(background).toMatch(/\{ dataType: k, app: msg\.app, occurredAt: at, source: "extension", outcome: msg\.outcome \}/);
    const content = readFileSync("extension/content.js", "utf8");
    expect(content).toMatch(/sendMessage\(\{ type: "detection", kinds: kinds, app: app, outcome: outcome \}\)/);
  });

  it("draws valid PNG icons", () => {
    const png = iconPng(16);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(16);
  });
});
