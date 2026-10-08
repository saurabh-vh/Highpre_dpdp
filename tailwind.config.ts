import type { Config } from "tailwindcss";

/**
 * Design tokens. The brand palette is monochrome; colour is reserved for
 * meaning (success, warning, danger, info) so status reads at a glance.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#000000",
        paper: "#FFFFFF",
        graphite: "#1C1C1E",
        slate: "#2C2C2E",
        mist: "#8E8E93",
        fog: "#C7C7CC",
        // Dashboard surfaces, from page to raised.
        canvas: "#050506",
        surface: "#111113",
        raised: "#1A1A1D",
        line: "rgba(255,255,255,0.08)",
        // Semantic colours (Apple system colours, dark appearance).
        success: "#30D158",
        warning: "#FFB340",
        danger: "#FF6961",
        info: "#64D2FF",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Modular scale, ratio ~1.25 at text sizes, opening up at display sizes.
        "2xs": ["0.75rem", { lineHeight: "1rem" }],
        xs: ["0.8125rem", { lineHeight: "1.15rem" }],
        sm: ["0.9375rem", { lineHeight: "1.4rem" }],
        base: ["1.0625rem", { lineHeight: "1.65rem" }],
        lg: ["1.3125rem", { lineHeight: "1.8rem", letterSpacing: "-0.01em" }],
        xl: ["1.75rem", { lineHeight: "2.1rem", letterSpacing: "-0.02em" }],
        "2xl": ["2.5rem", { lineHeight: "2.75rem", letterSpacing: "-0.03em" }],
        "3xl": ["3.5rem", { lineHeight: "3.6rem", letterSpacing: "-0.04em" }],
        display: ["clamp(3rem, 7vw, 6rem)", { lineHeight: "0.95", letterSpacing: "-0.05em" }],
      },
      borderRadius: {
        field: "12px",
        panel: "20px",
        sheet: "28px",
      },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "rise-in": {
          from: { opacity: "0", transform: "translateY(16px) scale(0.98)", filter: "blur(8px)" },
          to: { opacity: "1", transform: "none", filter: "blur(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        sweep: {
          "0%": { transform: "translateX(-30%)" },
          "100%": { transform: "translateX(130%)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 0.6s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
