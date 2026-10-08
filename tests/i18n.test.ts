import { describe, expect, it } from "vitest";
import { LANG_CODES, getLocale, normalizeLanguages, pickLang, purposeText } from "@/lib/i18n";
import { en } from "@/lib/i18n/locales/en";

/** Every leaf of a locale, as [path, value], calling functions with sample arguments. */
function leaves(obj: unknown, path = ""): [string, unknown][] {
  if (typeof obj === "function") {
    const sample = obj.length === 1 && path.endsWith("purposeLine")
      ? (obj as (p: unknown) => string)({ name: "N", description: "D", categories: "C", retention: "R", essential: false, sharedWith: "S" })
      : (obj as (...a: unknown[]) => string)("X", "Y");
    return [[path, sample]];
  }
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [[path, obj]];
}

describe("locales", () => {
  const enPaths = leaves(en).map(([p]) => p).sort();

  it.each(LANG_CODES)("%s has every string, none empty", (lang) => {
    const entries = leaves(getLocale(lang));
    expect(entries.map(([p]) => p).sort()).toEqual(enPaths);
    for (const [path, value] of entries) {
      expect(typeof value, path).toBe("string");
      expect((value as string).trim().length, path).toBeGreaterThan(0);
    }
  });

  it.each(LANG_CODES)("%s keeps the bullet format the notice renderer expects", (lang) => {
    const line = getLocale(lang).notice.purposeLine({ name: "Name", description: "Desc", categories: "Cats", retention: "1", essential: true });
    expect(line.startsWith("• Name — ")).toBe(true);
  });

  it.each(LANG_CODES)("%s interpolates arguments", (lang) => {
    const l = getLocale(lang);
    expect(l.notice.rightsBody("https://x.in/r")).toContain("https://x.in/r");
    expect(l.notice.respondWithin(30)).toContain("30");
    expect(l.portal.done("HP-ABC", "1 Jan")).toContain("HP-ABC");
    expect(l.parental.codeSent("a@b.in")).toContain("a@b.in");
  });
});

describe("purposeText", () => {
  const preset = { key: "analytics", name: en.purposes.analytics.name, description: en.purposes.analytics.description };

  it("uses preset translations while the English wording is unchanged", () => {
    expect(purposeText(preset, "hi").name).toBe(getLocale("hi").purposes.analytics.name);
  });

  it("falls back to English once the business rewrites a preset", () => {
    expect(purposeText({ ...preset, name: "Visitor stats" }, "ta").name).toBe("Visitor stats");
  });

  it("prefers the business's own translation, then legacy Hindi fields", () => {
    const p = { ...preset, translations: [{ lang: "ta", name: "Own" }], nameHi: "पुराना" };
    expect(purposeText(p, "ta").name).toBe("Own");
    expect(purposeText(p, "hi").name).toBe("पुराना");
  });
});

describe("language helpers", () => {
  it("always includes English first and keeps legacy sites on English and Hindi", () => {
    expect(normalizeLanguages(["ta", "hi"])).toEqual(["en", "hi", "ta"]);
    expect(normalizeLanguages(undefined)).toEqual(["en", "hi"]);
    expect(normalizeLanguages(["xx"])).toEqual(["en"]);
  });

  it("picks an allowed language or the first one", () => {
    expect(pickLang("ta", ["en", "ta"])).toBe("ta");
    expect(pickLang("ta", ["en", "hi"])).toBe("en");
    expect(pickLang(undefined, ["hi"])).toBe("hi");
  });
});
