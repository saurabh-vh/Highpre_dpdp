import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: [".next/**", "node_modules/**", "public/widget.js", "next-env.d.ts", "widget/**", "*.config.mjs"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
