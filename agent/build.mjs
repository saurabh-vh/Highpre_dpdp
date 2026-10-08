// Cross-compiles the desktop agent for Windows and macOS into agent/dist.
// Needs Go 1.23+ on PATH (or GO=/path/to/go). macOS arm64 binaries are
// ad-hoc signed by the Go linker; sign and notarise them for production.
//
// Automatic updates: set AGENT_UPDATE_SIGNING_KEY (an Ed25519 private key in
// PEM, or AGENT_UPDATE_SIGNING_KEY_FILE pointing to one). Its public half is
// compiled into the agent, and every build is signed in dist/manifest.json.
// Agents built without a key never update themselves.
//
//   node agent/build.mjs --generate-key   prints a new key to keep secret
import { execFileSync } from "child_process";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

if (process.argv.includes("--generate-key")) {
  const { privateKey } = generateKeyPairSync("ed25519");
  process.stdout.write(privateKey.export({ type: "pkcs8", format: "pem" }));
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const go = process.env.GO || "go";
const out = process.env.AGENT_OUT_DIR || join(here, "dist");
mkdirSync(out, { recursive: true });

const version = readFileSync(join(here, "main.go"), "utf8").match(/const Version = "([^"]+)"/)?.[1];
if (!version) throw new Error("Couldn't read Version from agent/main.go");

const pem = process.env.AGENT_UPDATE_SIGNING_KEY_FILE
  ? readFileSync(process.env.AGENT_UPDATE_SIGNING_KEY_FILE, "utf8")
  : process.env.AGENT_UPDATE_SIGNING_KEY?.replace(/\\n/g, "\n");
const key = pem?.trim() ? createPrivateKey(pem) : null;
// The raw 32-byte public key is the last 32 bytes of its SPKI encoding.
const publicKey = key ? createPublicKey(key).export({ type: "spki", format: "der" }).subarray(-32).toString("base64") : "";

const targets = [
  { platform: "windows", goos: "windows", goarch: "amd64", file: "highpre-agent-windows-amd64.exe", ldflags: "-s -w -H=windowsgui" },
  { platform: "mac-arm64", goos: "darwin", goarch: "arm64", file: "highpre-agent-darwin-arm64", ldflags: "-s -w" },
  { platform: "mac-intel", goos: "darwin", goarch: "amd64", file: "highpre-agent-darwin-amd64", ldflags: "-s -w" },
];

const manifest = { version, updatesSigned: Boolean(key), builtAt: new Date().toISOString(), files: {} };
for (const t of targets) {
  const dest = join(out, t.file);
  const ldflags = publicKey ? `${t.ldflags} -X main.updatePublicKey=${publicKey}` : t.ldflags;
  execFileSync(go, ["build", "-trimpath", "-ldflags", ldflags, "-o", dest, "."], {
    cwd: here,
    stdio: "inherit",
    env: { ...process.env, GOOS: t.goos, GOARCH: t.goarch, CGO_ENABLED: "0" },
  });
  const sha256 = createHash("sha256").update(readFileSync(dest)).digest("hex");
  // Must match signedMessage in agent/update.go.
  const signature = key ? sign(null, Buffer.from(`highpre-agent|${t.platform}|${version}|${sha256}`), key).toString("base64") : undefined;
  manifest.files[t.platform] = { file: t.file, sha256, size: statSync(dest).size, ...(signature ? { signature } : {}) };
  console.log(`agent built: ${t.file} (${(statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`);
}
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`agent ${version}: automatic updates ${key ? "signed" : "off (no AGENT_UPDATE_SIGNING_KEY)"}`);
