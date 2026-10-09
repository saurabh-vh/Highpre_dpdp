import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";
import { logoPng } from "@/lib/brand/logo-png";
import { AGENT_APPS, AGENT_DATA_TYPES, EXTENSION_SITES } from "./catalog";
import type { AgentConfig } from "./package";
import { createZip } from "./zip";

/** Bump when anything in extension/ changes. */
export const EXTENSION_VERSION = "1.1.0";

/** The extension's source files, shipped as is. */
const STATIC_FILES = ["background.js", "content.js", "detect.js", "files.js", "popup.html", "popup.js"];

export const extensionSourceDir = () => process.env.EXTENSION_SOURCE_DIR || join(process.cwd(), "extension");

/** Watched sites, labels and phrases, generated from the catalog so the extension never drifts from it. */
export function extensionCatalog() {
  return {
    sites: EXTENSION_SITES,
    apps: Object.fromEntries(Object.entries(AGENT_APPS).map(([k, v]) => [k, v.label])),
    data: Object.fromEntries(Object.entries(AGENT_DATA_TYPES).map(([k, v]) => [k, v.phrase])),
    // content.js: on email and file-sharing sites only files and high-severity pastes warn.
    categories: Object.fromEntries(Object.entries(AGENT_APPS).map(([k, v]) => [k, v.category])),
    high: Object.keys(AGENT_DATA_TYPES).filter((k) => AGENT_DATA_TYPES[k as keyof typeof AGENT_DATA_TYPES].severity === "high"),
    ai: Object.keys(AGENT_APPS).filter((k) => AGENT_APPS[k as keyof typeof AGENT_APPS].category === "ai"), // AI tools the extension may count (background.js)
  };
}

export function extensionManifest(config: AgentConfig) {
  const origins = [...new Set(Object.keys(EXTENSION_SITES))].map((host) => `https://${host}/*`);
  return {
    manifest_version: 3,
    name: `HighPre for ${config.orgName}`.slice(0, 75),
    short_name: "HighPre",
    version: EXTENSION_VERSION,
    description: "Asks before passwords, keys, card and ID numbers are pasted, sent or attached in AI assistants, chat apps and sharing sites. Nothing leaves your browser.",
    minimum_chrome_version: "110",
    background: { service_worker: "background.js" },
    content_scripts: [{ matches: origins, js: ["catalog.js", "detect.js", "files.js", "content.js"], run_at: "document_start" }],
    // Only HighPre itself: the extension never needs to read other sites' data.
    host_permissions: [`${new URL(config.apiUrl).origin}/*`],
    permissions: ["storage", "alarms"],
    action: { default_popup: "popup.html", default_title: "HighPre", default_icon: { "16": "icon16.png", "32": "icon32.png" } },
    icons: { "16": "icon16.png", "32": "icon32.png", "48": "icon48.png", "128": "icon128.png" },
  };
}

const README = (config: AgentConfig) => `HighPre browser extension for ${config.orgName}

Install in Chrome or Edge:
1. Unzip this file somewhere you'll keep it (for example Documents).
2. Open chrome://extensions (Edge: edge://extensions).
3. Turn on Developer mode.
4. Click "Load unpacked" and choose the "HighPre Extension" folder.

What it does
- On AI assistants, chat apps, email and sharing sites, it checks text you
  paste, drop or send, and files you attach, for passwords, API keys, card
  and bank details, Aadhaar, PAN,
  passport numbers and customer lists.
- It asks before that goes in, and tells your organisation's owners the kind
  of data, the site and what you chose.

What it never does
- It never sends what you paste or type, or any part of it, to HighPre.
- It doesn't run on any other site and doesn't record browsing history.

This copy is linked to ${config.userName}. Don't share it; teammates can
download their own from the HighPre dashboard.
`;

/** Builds a personal extension download: the extension folder with its configuration, zipped. */
export async function buildExtensionDownload(config: AgentConfig): Promise<{ body: Buffer; filename: string; contentType: string }> {
  const dir = extensionSourceDir();
  const folder = "HighPre Extension";
  const statics = await Promise.all(STATIC_FILES.map(async (name) => ({ name: `${folder}/${name}`, data: await readFile(join(dir, name)) })));
  const icons = [16, 32, 48, 128].map((size) => ({ name: `${folder}/icon${size}.png`, data: iconPng(size) }));
  const zip = createZip([
    { name: `${folder}/manifest.json`, data: Buffer.from(JSON.stringify(extensionManifest(config), null, 2)) },
    { name: `${folder}/config.js`, data: Buffer.from(`self.HIGHPRE_CONFIG = ${JSON.stringify({ apiUrl: config.apiUrl, token: config.token, orgName: config.orgName, uninstallKey: config.uninstallKey })};\n`) },
    { name: `${folder}/catalog.js`, data: Buffer.from(`self.HIGHPRE_CATALOG = ${JSON.stringify(extensionCatalog())};\n`) },
    ...statics,
    ...icons,
    { name: `${folder}/README.txt`, data: Buffer.from(README(config)) },
  ]);
  return { body: zip, filename: "HighPre-Browser-Extension.zip", contentType: "application/zip" };
}

/** Extension icons: the HighPre mark. */
export const iconPng = logoPng;
