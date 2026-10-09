import { describe, expect, it } from "vitest";
import { analyzePage } from "@/lib/scanner/analyze";
import { buildFindings, scoreFindings } from "@/lib/scanner";
import { checkCookies, checkHeaders, classifyCertificate, securityFindings, type SecurityReport } from "@/lib/scanner/security";

const now = new Date("2026-10-09T06:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

const strong = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const report = (over: Partial<SecurityReport> = {}): SecurityReport => ({
  headers: { missing: [], present: [] },
  mixedContent: { count: 0, examples: [] },
  insecureForms: [],
  insecureCookies: [],
  ...over,
});

describe("security headers", () => {
  it("passes a well-configured https response", () => {
    expect(checkHeaders(strong, true).missing).toEqual([]);
  });

  it("lists what's missing and accepts X-Frame-Options instead of frame-ancestors", () => {
    const h = checkHeaders({ "x-frame-options": "SAMEORIGIN", "strict-transport-security": "max-age=0" }, true);
    expect(h.missing).toEqual(["Strict-Transport-Security", "Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy"]);
    expect(h.present).toEqual(["Clickjacking protection"]);
  });

  it("doesn't expect HSTS over plain http", () => {
    expect(checkHeaders({}, false).missing).not.toContain("Strict-Transport-Security");
  });

  it("combines missing headers into one finding: a warning for HSTS or clickjacking, a pass for minor gaps", () => {
    const major = securityFindings(report({ headers: checkHeaders({}, true) }), true, now).filter((f) => f.id.startsWith("security_headers"));
    expect(major).toHaveLength(1);
    expect(major[0]).toMatchObject({ id: "security_headers", severity: "warning", group: "security" });
    expect(major[0].title).toBe("5 security headers missing");

    const minor = securityFindings(report({ headers: checkHeaders({ ...strong, "referrer-policy": undefined }, true) }), true, now);
    expect(minor.find((f) => f.id === "security_headers_ok")).toMatchObject({ severity: "pass", detail: "Also worth adding: Referrer-Policy." });
  });
});

describe("mixed content and insecure forms", () => {
  const html = `<html><head>
    <script src="http://cdn.example.com/lib.js"></script>
    <link rel="stylesheet" href="http://cdn.example.com/site.css">
    <script src="https://cdn.example.com/ok.js"></script>
  </head><body>
    <img src="http://img.example.com/a.png"><img src="/local.png">
    <iframe src="http://maps.example.com/embed"></iframe>
    <form action="http://crm.example.com/lead"><input type="email" name="email"></form>
    <form action="/search"><input name="message"></form>
  </body></html>`;

  it("finds http:// resources and form targets on an https page", () => {
    const a = analyzePage(html, "https://shop.example.in/");
    expect(a.mixedContent.sort()).toEqual(
      ["http://cdn.example.com/lib.js", "http://cdn.example.com/site.css", "http://crm.example.com/lead", "http://img.example.com/a.png", "http://maps.example.com/embed"].sort(),
    );
    expect(a.insecureForms).toEqual(["http://crm.example.com/lead"]);
  });

  it("reports no mixed content on an http page, but its personal-data forms post over http", () => {
    const a = analyzePage('<form><input name="full_name"><input type="tel" name="phone"></form>', "http://shop.example.in/contact");
    expect(a.mixedContent).toEqual([]);
    expect(a.insecureForms).toEqual(["http://shop.example.in/contact"]);
  });

  it("turns them into findings with a few examples", () => {
    const f = securityFindings(report({ mixedContent: { count: 5, examples: ["http://a/1.js", "http://a/2.css"] }, insecureForms: ["http://crm/lead"] }), true, now);
    expect(f.find((x) => x.id === "insecure_forms")?.severity).toBe("critical");
    expect(f.find((x) => x.id === "mixed_content")).toMatchObject({ severity: "warning", title: "5 resources load over plain http" });
  });
});

describe("cookies", () => {
  it("flags missing Secure on https and session cookies readable by scripts", () => {
    const out = checkCookies(["PHPSESSID=abc; path=/", "theme=dark; Secure", "auth_token=x; Secure; HttpOnly", "lang=en"], true);
    expect(out).toEqual(["PHPSESSID (no Secure flag, readable by scripts)", "lang (no Secure flag)"]);
  });
});

describe("certificate expiry", () => {
  it.each([
    [-1, true, "critical"],
    [5, true, "warning"],
    [13, true, "warning"],
    [60, true, "pass"],
    [60, false, "critical"],
  ] as const)("%i days left, authorized %s → %s", (left, authorized, severity) => {
    expect(classifyCertificate({ validTo: days(left), authorized }, now).severity).toBe(severity);
  });

  it("explains expired, untrusted, expiring and valid certificates", () => {
    const find = (validTo: Date, authorized = true, error?: string) =>
      securityFindings(report({ certificate: { validTo, issuer: "Let's Encrypt", authorized, error } }), true, now).find((f) => f.id.startsWith("ssl"))!;
    expect(find(days(-3)).id).toBe("ssl_expired");
    expect(find(days(200), false, "DEPTH_ZERO_SELF_SIGNED_CERT")).toMatchObject({ id: "ssl_invalid", severity: "critical" });
    expect(find(days(200), false, "DEPTH_ZERO_SELF_SIGNED_CERT").detail).toContain("DEPTH_ZERO_SELF_SIGNED_CERT");
    expect(find(days(6.5))).toMatchObject({ id: "ssl_expiring", title: "SSL certificate expires in 6 days" });
    expect(find(days(90))).toMatchObject({ id: "ssl", severity: "pass" });
    expect(find(days(90)).detail).toContain("Let's Encrypt");
  });
});

describe("security in the score", () => {
  it("caps the security penalty so it can't dominate the DPDP score", () => {
    const security = report({
      headers: checkHeaders({}, true),
      certificate: { validTo: days(-1), issuer: "", authorized: false },
      insecureForms: ["http://x/lead"],
      mixedContent: { count: 2, examples: [] },
    });
    const findings = buildFindings({ https: true, trackers: [], forms: [], privacyNoticeUrl: "https://x.in/privacy", consentTool: "HighPre", mentionsGrievance: true, security });
    expect(findings.filter((f) => f.group === "security").length).toBeGreaterThanOrEqual(4);
    expect(scoreFindings(findings)).toBe(80);
  });
});
