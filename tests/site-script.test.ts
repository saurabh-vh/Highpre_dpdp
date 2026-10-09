import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { badgeConfig, bootConsentMode, siteScriptTag } from "@/lib/consent/site-script";

const purposes = [
  { key: "essential", name: "Running the site", essential: true },
  { key: "analytics", name: "Analytics", essential: false },
  { key: "marketing", name: "Marketing", essential: false },
];
const base = { siteKey: "abcdEFGH1234_-xy", publishedNoticeVersion: 2, purposes, banner: {} as Record<string, unknown> };

describe("one-line install helpers", () => {
  it("builds a plain script tag with no attributes", () => {
    expect(siteScriptTag("https://highpre.com", "abcdEFGH1234_-xy")).toBe('<script src="https://highpre.com/s/abcdEFGH1234_-xy.js"></script>');
  });

  it("embeds consent signals only when Google or Meta is on", () => {
    expect(bootConsentMode(base)).toBeNull();
    const cm = bootConsentMode({ ...base, banner: { googleConsentMode: true } })!;
    expect(cm).toMatchObject({ google: true, meta: false, adsDataRedaction: true, essential: ["essential"] });
    expect(cm.types.analytics).toContain("analytics_storage");
    expect(cm.types.marketing).toEqual(expect.arrayContaining(["ad_storage", "ad_user_data", "ad_personalization"]));
  });

  it("shows the badge only when switched on and the privacy centre is live", () => {
    const on = { enabled: true, placement: "corner", theme: "dark", size: "small" };
    expect(badgeConfig(base, "https://highpre.com")).toBeNull();
    expect(badgeConfig({ ...base, privacyCentre: { badge: on } }, "https://highpre.com")).toEqual({
      url: "https://highpre.com/p/abcdEFGH1234_-xy",
      image: "https://highpre.com/p/abcdEFGH1234_-xy/badge.svg?theme=dark&size=small",
      label: "Privacy centre by HighPre",
      placement: "corner",
      width: 147,
      height: 30,
    });
    expect(badgeConfig({ ...base, privacyCentre: { enabled: false, badge: on } }, "https://highpre.com")).toBeNull();
    expect(badgeConfig({ ...base, publishedNoticeVersion: 0, privacyCentre: { badge: on } }, "https://highpre.com")).toBeNull();
  });
});

describe("/s/<siteKey>.js", () => {
  let server: MongoMemoryServer;
  const widgetPath = join(process.cwd(), "public", "widget.js");
  let createdWidget = false;

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    process.env.MONGODB_URI = server.getUri("highpre-site-script");
    const { connectDb } = await import("@/lib/db");
    await connectDb();
    if (!existsSync(widgetPath)) {
      mkdirSync(join(process.cwd(), "public"), { recursive: true });
      writeFileSync(widgetPath, "/* widget */");
      createdWidget = true;
    }
  });

  afterAll(async () => {
    if (createdWidget) unlinkSync(widgetPath);
    await mongoose.disconnect();
    await server?.stop();
  });

  const get = async (file: string) => {
    const { GET } = await import("@/app/s/[file]/route");
    return GET(new Request(`http://x/s/${file}`), { params: Promise.resolve({ file }) });
  };

  it("serves the widget with the site key and consent settings embedded", async () => {
    const { Organization, Site } = await import("@/models");
    const org = await Organization.create({ name: "Script Org", members: [] });
    await Site.create({
      orgId: org._id,
      name: "Shop",
      url: "https://shop.example.in",
      siteKey: "shopKEY1234567890",
      purposes: [{ key: "essential", name: "Running the site", description: "x", essential: true, legalBasis: "consent" }],
      banner: { googleConsentMode: true },
    });
    const res = await get("shopKEY1234567890.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    const js = await res.text();
    const boot = JSON.parse(js.slice("window.__HP_BOOT=".length, js.indexOf(";\n")));
    expect(boot.siteKey).toBe("shopKEY1234567890");
    expect(boot.cm.google).toBe(true);
    expect(js.length).toBeGreaterThan(js.indexOf(";\n") + 2);
  });

  it("returns a harmless 404 script for unknown or malformed keys", async () => {
    expect((await get("unknownKEY123456.js")).status).toBe(404);
    const bad = await get("<script>.js");
    expect(bad.status).toBe(404);
    expect(await bad.text()).not.toContain("<script>");
  });
});
