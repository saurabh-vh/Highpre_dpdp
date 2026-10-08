// Bundles and minifies the consent widget into public/widget.js.
import { build } from "esbuild";
import { statSync } from "fs";

const outfile = "public/widget.js";

await build({
  entryPoints: ["widget/src/widget.js"],
  outfile,
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2017", "safari12"],
  legalComments: "none",
});

console.log(`widget built: ${outfile} (${(statSync(outfile).size / 1024).toFixed(1)} KB)`);
