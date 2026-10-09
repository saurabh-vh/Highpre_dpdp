import { deflateSync } from "zlib";

/**
 * The HighPre "H!" mark as a PNG, drawn without image libraries: a white mark
 * on a black rounded square. Used for the browser extension's icons and the
 * desktop agent's notification icon (agent/assets/highpre.png). The geometry
 * matches LogoMark in src/components/brand/logo.tsx (viewBox 44 × 36).
 */

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

/** Inside the H! mark, in logo units (0–44 × 0–36). */
function inMark(x: number, y: number) {
  if (y < 0 || y > 36) return false;
  // H: two uprights and the crossbar.
  if ((x >= 0 && x <= 7) || (x >= 21 && x <= 28)) return true;
  if (x >= 7 && x <= 21 && y >= 15 && y <= 21) return true;
  // !: a stroke narrowing from 7 units wide at the top to 4.6 at y = 26, then the dot.
  if (y <= 26) {
    const t = y / 26;
    const left = 32.5 + 1.2 * t;
    const right = 39.5 - 1.2 * t;
    if (x >= left && x <= right) return true;
  }
  return (x - 36) ** 2 + (y - 32.2) ** 2 <= 3.8 ** 2;
}

function inRoundedSquare(u: number, v: number) {
  const r = 0.22, dx = Math.max(r - u, u - (1 - r), 0), dy = Math.max(r - v, v - (1 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

/** Fraction of pixel (x, y) covered by `inside`, 4×4 supersampled for smooth edges. */
function coverage(x: number, y: number, size: number, inside: (u: number, v: number) => boolean) {
  let hits = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (inside((x + (i + 0.5) / 4) / size, (y + (j + 0.5) / 4) / size)) hits++;
  return hits / 16;
}

export function logoPng(size: number): Buffer {
  // The mark spans 58% of the icon's width, centred.
  const markW = 0.58, scale = 44 / markW, offX = (1 - markW) / 2, offY = (1 - (36 / scale)) / 2;
  const mark = (u: number, v: number) => inMark((u - offX) * scale, (v - offY) * scale);
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const bg = coverage(x, y, size, inRoundedSquare);
      const fg = coverage(x, y, size, mark);
      const shade = Math.round(255 * fg);
      row.set([shade, shade, shade, Math.round(255 * bg)], 1 + x * 4);
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
