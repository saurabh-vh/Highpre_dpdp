import { describe, expect, it } from "vitest";
import { brandSources, extractBrand, isBrandish, parseColor } from "@/lib/scanner/brand";
import { contrast } from "@/lib/color";

describe("parseColor", () => {
  it("reads hex, rgb and hsl, and skips transparent colours", () => {
    expect(parseColor("#1A73E8")).toBe("#1a73e8");
    expect(parseColor("#fa0")).toBe("#ffaa00");
    expect(parseColor("rgb(26, 115, 232)")).toBe("#1a73e8");
    expect(parseColor("rgba(26 115 232 / 0.2)")).toBeNull();
    expect(parseColor("hsl(0, 100%, 50%)")).toBe("#ff0000");
    expect(parseColor("221.2 83.2% 53.3%")).toBe("#2563eb"); // Tailwind/shadcn channel syntax
    expect(parseColor("#00000010")).toBeNull();
    expect(parseColor("1px solid #e11d48")).toBe("#e11d48");
    expect(parseColor("inherit")).toBeNull();
  });

  it("tells brand colours from greys", () => {
    expect(isBrandish("#1a73e8")).toBe(true);
    expect(isBrandish("#777777")).toBe(false);
    expect(isBrandish("#fafafa")).toBe(false);
    expect(isBrandish("#050505")).toBe(false);
  });
});

describe("extractBrand", () => {
  it("prefers meta theme-color and brand custom properties", () => {
    const html = `<html><head><meta name="theme-color" content="#0f766e">
      <style>:root{--primary:#0f766e;--gray:#888}body{background:#fffdf7;color:#333;font-family:"Poppins", Arial, sans-serif}
      a{color:#e11d48}</style></head><body><button>Buy</button></body></html>`;
    const b = extractBrand({ html });
    expect(b.primary).toBe("#0f766e");
    expect(b.background).toBe("#fffdf7");
    expect(b.text).toBe("#333333");
    expect(b.font).toBe(`"Poppins", Arial, sans-serif`);
    expect(contrast(b.onPrimary!, b.primary!)).toBeGreaterThanOrEqual(4.5);
  });

  it("uses button backgrounds and frequency from stylesheets, resolving var()", () => {
    const html = `<html><head><link rel="stylesheet" href="/app.css"></head><body><p>Hi</p></body></html>`;
    const css = `
      /* header */ :root { --brand-blue: #2563eb; --accent: var(--brand-blue); }
      .nav a { color: #e11d48 }
      .btn-primary, button[type=submit] { background-color: var(--brand-blue); color: #fff }
      .card { border-color: #2563eb; }
      @media (min-width: 600px) { .hero .button { background: #2563eb !important } }
      body { color: #9ca3af; background-color: #ffffff; font-family: Inter, system-ui, sans-serif }
    `;
    const b = extractBrand({ html, css: [css] });
    expect(b.primary).toBe("#2563eb");
    expect(b.background).toBe("#ffffff");
    // #9ca3af on white is under 4.5:1, so it's darkened.
    expect(b.text).not.toBe("#9ca3af");
    expect(contrast(b.text, b.background)).toBeGreaterThanOrEqual(4.5);
    expect(b.font).toBe("Inter, system-ui, sans-serif");
  });

  it("reads the web manifest theme colour and handles dark sites", () => {
    const html = `<html><head><style>body{background:#0b0b0f}</style></head><body></body></html>`;
    const b = extractBrand({ html, manifest: JSON.stringify({ theme_color: "#f59e0b" }) });
    expect(b.primary).toBe("#f59e0b");
    expect(b.onPrimary).toBe("#000000");
    expect(b.background).toBe("#0b0b0f");
    expect(contrast(b.text, b.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("returns sensible defaults when nothing stands out, and drops unsafe fonts", () => {
    const b = extractBrand({ html: `<style>body{font-family:var(--x);color:#444}</style><p style="color:#777">plain</p>` });
    expect(b.primary).toBeUndefined();
    expect(b.background).toBe("#ffffff");
    expect(b.text).toBe("#444444");
    expect(b.font).toBeUndefined();
  });
});

describe("brandSources", () => {
  it("lists the first two same-site stylesheets and the manifest", () => {
    const html = `<head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
      <link rel="stylesheet" href="/a.css"><link rel="preload stylesheet" href="https://cdn.shop.example.in/b.css">
      <link rel="stylesheet" href="/c.css"><link rel="manifest" href="/site.webmanifest"></head>`;
    expect(brandSources(html, "https://www.shop.example.in/")).toEqual({
      stylesheets: ["https://www.shop.example.in/a.css", "https://cdn.shop.example.in/b.css"],
      manifest: "https://www.shop.example.in/site.webmanifest",
    });
  });
});
