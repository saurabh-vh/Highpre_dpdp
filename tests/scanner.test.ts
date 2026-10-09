import { describe, expect, it } from "vitest";
import { analyzePage } from "@/lib/scanner/analyze";
import { buildFindings, scoreFindings } from "@/lib/scanner";
import { isPrivateIp, normalizeUrl } from "@/lib/scanner/safe-fetch";

const html = `<!doctype html><html><head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>
<script>!function(f){fbq('init', '123')}(window)</script>
</head><body>
<form><input name="full_name"><input type="email" name="email"><input type="tel" name="mobile"><textarea name="message"></textarea><input type="hidden" name="csrf"></form>
<a href="/privacy-policy">Privacy Policy</a>
<a href="/contact-us">Contact</a>
<a href="https://other.example.com/contact">Elsewhere</a>
<footer>Grievance Officer: Asha</footer>
</body></html>`;

describe("analyzePage", () => {
  const a = analyzePage(html, "https://shop.example.in/");

  it("finds trackers in script URLs and inline code", () => {
    expect(a.trackers.map((t) => t.id).sort()).toEqual(["ga4", "meta_pixel"]);
  });

  it("lists personal fields per form and ignores hidden inputs", () => {
    expect(a.forms).toEqual([{ fields: ["Name", "Email", "Phone", "Message"] }]);
  });

  it("finds the privacy link, grievance mention and same-site pages worth scanning", () => {
    expect(a.privacyLink).toBe("https://shop.example.in/privacy-policy");
    expect(a.mentionsGrievance).toBe(true);
    expect(a.candidateLinks).toEqual(["https://shop.example.in/contact-us"]);
  });

  it("recognises a HighPre install by its attribute", () => {
    expect(analyzePage('<script src="/w.js" data-hp-site="abc"></script>', "https://x.in/").consentTool).toBe("HighPre");
  });

  it("recognises the one-line install, on highpre.com or self-hosted", () => {
    expect(analyzePage('<script src="https://highpre.com/s/VL1SFbZr-QbizdS2.js"></script>', "https://x.in/").consentTool).toBe("HighPre");
    expect(analyzePage('<script src="/s/VL1SFbZr-QbizdS2.js"></script>', "https://x.in/").consentTool).toBe("HighPre");
    expect(analyzePage('<script src="/s/app.js"></script>', "https://x.in/").consentTool).toBeUndefined();
  });
});

describe("findings and score", () => {
  it("flags trackers without consent and a missing notice as critical", () => {
    const findings = buildFindings({ https: true, trackers: [{ id: "ga4", name: "Google Analytics", category: "analytics" }], forms: [], mentionsGrievance: false });
    expect(findings[0].severity).toBe("critical");
    expect(findings.map((f) => f.id)).toEqual(expect.arrayContaining(["no_notice", "trackers_without_consent", "no_grievance", "https"]));
    expect(scoreFindings(findings)).toBe(100 - 25 - 25 - 10);
  });

  it("scores a clean site 100", () => {
    const findings = buildFindings({ https: true, trackers: [], forms: [], privacyNoticeUrl: "https://x.in/privacy", consentTool: "HighPre", mentionsGrievance: true });
    expect(scoreFindings(findings)).toBe(100);
  });
});

describe("SSRF guards", () => {
  it.each(["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1", "100.64.0.1"])("blocks %s", (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("2606:4700::1111")).toBe(false);
  });

  it("rejects IPs, odd ports and credentials in URLs", () => {
    expect(() => normalizeUrl("http://127.0.0.1")).toThrow();
    expect(() => normalizeUrl("https://example.in:8080")).toThrow();
    expect(() => normalizeUrl("https://user:pw@example.in")).toThrow();
    expect(normalizeUrl("example.in").toString()).toBe("https://example.in/");
  });
});
