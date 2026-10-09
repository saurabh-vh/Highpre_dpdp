import { build } from "esbuild";
import vm from "vm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the bundled widget in a bare VM (no DOM) to check what it does
 * synchronously, before the page's Google and Meta tags run.
 */
let bundle = "";

beforeAll(async () => {
  const out = await build({ entryPoints: ["widget/src/widget.js"], bundle: true, write: false, format: "iife", target: ["es2017", "safari12"] });
  bundle = out.outputFiles[0].text;
});

type Win = Record<string, unknown> & { dataLayer?: IArguments[]; fbq?: ((...a: unknown[]) => void) & { queue?: unknown[][] } };

function run(store: Record<string, string>, attrs: Record<string, string> = {}): Win {
  const attributes: Record<string, string> = { "data-hp-site": "site123", ...attrs };
  const script = {
    src: "https://highpre.example/widget.js",
    getAttribute: (n: string) => attributes[n] ?? null,
    hasAttribute: (n: string) => n in attributes,
  };
  const win: Win = {
    document: { currentScript: script, readyState: "loading", addEventListener() {}, querySelector: () => null },
    localStorage: {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => (store[k] = v),
      removeItem: (k: string) => delete store[k],
    },
    URL,
    console,
    setTimeout,
    navigator: { language: "en" },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(bundle, win);
  return win;
}

/** dataLayer entries as plain arrays. */
const calls = (w: Win) => (w.dataLayer ?? []).map((a) => Array.from(a));

const cm = {
  google: true,
  meta: true,
  adsDataRedaction: true,
  urlPassthrough: false,
  types: { essential: ["functionality_storage"], analytics: ["analytics_storage"], marketing: ["ad_storage", "ad_user_data", "ad_personalization"] },
  essential: ["essential"],
};

describe("widget Consent Mode start-up", () => {
  it("does nothing when Consent Mode isn't set up", () => {
    const w = run({});
    expect(w.dataLayer).toBeUndefined();
    expect(w.gtag).toBeUndefined();
  });

  it("sets denied defaults with wait_for_update on a first visit marked data-hp-consent-mode", () => {
    const w = run({}, { "data-hp-consent-mode": "" });
    const c = calls(w);
    expect(c[0]).toEqual([
      "consent",
      "default",
      {
        security_storage: "granted",
        analytics_storage: "denied",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        functionality_storage: "denied",
        personalization_storage: "denied",
        wait_for_update: 500,
      },
    ]);
    expect(c[1]).toEqual(["set", "ads_data_redaction", true]);
    expect(c).toHaveLength(2); // no update until the visitor chooses
    expect(typeof w.gtag).toBe("function");
  });

  it("restores a returning visitor's choices straight after the defaults", () => {
    const store = {
      hp_cm_site123: JSON.stringify(cm),
      hp_consent_site123: JSON.stringify({ principalId: "p".repeat(20), version: 3, decisions: { essential: true, analytics: true, marketing: false } }),
    };
    const c = calls(run(store));
    expect(c[0][1]).toBe("default");
    expect((c[0][2] as Record<string, string>).functionality_storage).toBe("granted"); // essential needs no consent
    const update = c.find((x) => x[1] === "update")!;
    expect(update[2]).toMatchObject({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied" });
  });

  it("never replaces the page's own gtag", () => {
    const store = { hp_cm_site123: JSON.stringify(cm) };
    const seen: unknown[][] = [];
    const attributes = { "data-hp-site": "site123" };
    const win: Win = {
      document: { currentScript: { src: "https://highpre.example/widget.js", getAttribute: (n: string) => (attributes as Record<string, string>)[n] ?? null, hasAttribute: (n: string) => n in attributes }, readyState: "loading", addEventListener() {} },
      localStorage: { getItem: (k: string) => (store as Record<string, string>)[k] ?? null, setItem() {}, removeItem() {} },
      URL,
      console,
      setTimeout,
    };
    const own = (...a: unknown[]) => seen.push(a);
    win.gtag = own;
    win.window = win;
    vm.createContext(win);
    vm.runInContext(bundle, win);
    expect(win.gtag).toBe(own);
    expect(seen[0].slice(0, 2)).toEqual(["consent", "default"]);
  });

  it("queues fbq('consent','revoke') before the Pixel's init when the Pixel loads later", () => {
    const w = run({ hp_cm_site123: JSON.stringify(cm) });
    // Meta's base code, as pasted on websites (minus the script tag it injects).
    vm.runInContext(
      `!function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
       if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];}(window);
       fbq('init','123');fbq('track','PageView');`,
      w,
    );
    const queue = (w.fbq!.queue ?? []).map((a) => Array.from(a as unknown as IArguments));
    expect(queue).toEqual([["consent", "revoke"], ["init", "123"], ["track", "PageView"]]);
  });

  it("grants Meta consent for a returning visitor who agreed to marketing", () => {
    const store = {
      hp_cm_site123: JSON.stringify(cm),
      hp_consent_site123: JSON.stringify({ principalId: "p".repeat(20), version: 3, decisions: { essential: true, marketing: true } }),
    };
    const seen: unknown[][] = [];
    const w = run(store);
    expect(w.fbq).toBeUndefined();
    // A Pixel that's already initialised (callMethod set) when assigned.
    vm.runInContext(`var f = function(){ window.__seen.push(Array.from(arguments)); }; f.callMethod = true; window.fbq = f;`, Object.assign(w, { __seen: seen }));
    expect(seen).toEqual([["consent", "grant"]]);
  });
});
