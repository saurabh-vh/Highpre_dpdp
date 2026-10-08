import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";
import { deflateSync } from "zlib";
import { AGENT_APPS, AGENT_DATA_TYPES, EXTENSION_SITES } from "./catalog";
import type { AgentConfig } from "./package";
import { createZip } from "./zip";

/** Bump when anything in extension/ changes. */
export const EXTENSION_VERSION = "1.0.0";

/** The extension's source files, shipped as is. */
const STATIC_FILES = ["background.js", "content.js", "detect.js", "popup.html", "popup.js"];

export const extensionSourceDir = () => process.env.EXTENSION_SOURCE_DIR || join(process.cwd(), "extension");

/** Watched sites, labels and phrases, generated from the catalog so the extension never drifts from it. */
export function extensionCatalog() {
  return {
    sites: EXTENSION_SITES,
    apps: Object.fromEntries(Object.entries(AGENT_APPS).map(([k, v]) => [k, v.label])),
    data: Object.fromEntries(Object.entries(AGENT_DATA_TYPES).map(([k, v]) => [k, v.phrase])),
  };
}

export function extensionManifest(config: AgentConfig) {
  const origins = [...new Set(Object.keys(EXTENSION_SITES))].map((host) => `https://${host}/*`);
  return {
    manifest_version: 3,
    name: `HighPre for ${config.orgName}`.slice(0, 75),
    short_name: "HighPre",
    version: EXTENSION_VERSION,
    description: "Asks before passwords, keys, card and ID numbers are pasted or sent into AI assistants and chat apps. Nothing you type leaves your browser.",
    minimum_chrome_version: "110",
    background: { service_worker: "background.js" },
    content_scripts: [{ matches: origins, js: ["catalog.js", "detect.js", "content.js"], run_at: "document_start" }],
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
- On AI assistants, chat apps and paste sites, it checks text you paste, drop
  or send for passwords, API keys, card and bank details, Aadhaar, PAN,
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
    { name: `${folder}/config.js`, data: Buffer.from(`self.HIGHPRE_CONFIG = ${JSON.stringify({ apiUrl: config.apiUrl, token: config.token, orgName: config.orgName })};\n`) },
    { name: `${folder}/catalog.js`, data: Buffer.from(`self.HIGHPRE_CATALOG = ${JSON.stringify(extensionCatalog())};\n`) },
    ...statics,
    ...icons,
    { name: `${folder}/README.txt`, data: Buffer.from(README(config)) },
  ]);
  return { body: zip, filename: "HighPre-Browser-Extension.zip", contentType: "application/zip" };
}

/* ── Icon: a white shield on a dark rounded square, drawn without image libraries ── */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Coverage (0–1) of pixel (x, y) by the icon shape, supersampled for smooth edges. */
function coverage(x: number, y: number, size: number, inShape: (u: number, v: number) => boolean) {
  let hits = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (inShape((x + (i + 0.5) / 4) / size, (y + (j + 0.5) / 4) / size)) hits++;
  return hits / 16;
}

const inRoundedSquare = (u: number, v: number) => {
  const r = 0.22, dx = Math.max(r - u, u - (1 - r), 0), dy = Math.max(r - v, v - (1 - r), 0);
  return dx * dx + dy * dy <= r * r;
};

// Shield: flat top, straight sides, curving to a point at the bottom.
const inShield = (u: number, v: number) => {
  const x = Math.abs(u - 0.5), top = 0.2, mid = 0.5, bottom = 0.82, half = 0.27;
  if (v < top || v > bottom) return false;
  if (v <= mid) return x <= half;
  const t = (v - mid) / (bottom - mid);
  return x <= half * Math.sqrt(1 - t * t);
};

export function iconPng(size: number): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const bg = coverage(x, y, size, inRoundedSquare);
      const fg = coverage(x, y, size, inShield);
      const shade = Math.round(22 + (245 - 22) * fg);
      row.set([shade, shade, Math.round(26 + (245 - 26) * fg), Math.round(255 * bg)], 1 + x * 4);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
