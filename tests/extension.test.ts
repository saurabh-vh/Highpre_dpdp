import { readFileSync } from "fs";
import { createRequire } from "module";
import { deflateRawSync, deflateSync } from "zlib";
import { describe, expect, it } from "vitest";
import { AGENT_APP_KEYS, AGENT_DATA_TYPE_KEYS, EXTENSION_SITES } from "@/lib/agent/catalog";
import { extensionCatalog, extensionManifest, iconPng } from "@/lib/agent/extension";

const load = createRequire(import.meta.url);
const { detect, mask } = load("../extension/detect.js") as {
  detect: (text: string, options?: { bare?: boolean }) => string[];
  mask: (text: string, options?: { bare?: boolean }) => { text: string; kinds: string[] };
};
const files = load("../extension/files.js") as {
  canCheck: (file: { name: string; size: number }) => boolean;
  extractFileText: (file: File) => Promise<string>;
  extractXlsxText: (bytes: Uint8Array) => Promise<string>;
  extractDocxText: (bytes: Uint8Array) => Promise<string>;
  extractPdfText: (bytes: Uint8Array) => Promise<string>;
  pdfTextFromContent: (content: string) => string;
  stripXml: (xml: string) => string;
};

/** A zip archive built in memory, with deflated entries (as Office writes them) or stored ones. */
function zip(entries: Record<string, string>, method: 0 | 8 = 8) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const raw = Buffer.from(text);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}

describe("browser extension detection", () => {
  const cases = JSON.parse(readFileSync("agent/testdata/detect_cases.json", "utf8")) as { name: string; text: string; want: string[] }[];

  // The same cases run against agent/detect.go, so both detectors agree.
  it.each(cases)("$name", ({ text, want }) => {
    expect(detect(text)).toEqual(want);
  });

  it("finds bulk contact lists", () => {
    const list = Array.from({ length: 12 }, (_, i) => `customer${String.fromCharCode(97 + i)}@mail.in`).join(", ");
    expect(detect(list)).toEqual(["bulk_personal_data"]);
  });

  it("skips the lone-password check for typed messages", () => {
    expect(detect("Thanks2u!")).toEqual(["password"]);
    expect(detect("Thanks2u!", { bare: false })).toEqual([]);
    expect(detect("my password: hunter2!x", { bare: false })).toEqual(["password"]);
  });

  it("hides whatever it finds, in every case", () => {
    for (const { name, text, want } of cases) {
      const masked = mask(text);
      expect(detect(masked.text), name).toEqual([]);
      expect(masked.kinds, name).toEqual(want);
      if (!want.length) expect(masked.text, name).toBe(text);
    }
  });

  it("hides details in a readable way", () => {
    expect(mask("Card: 4111 1111 1111 1111 exp 12/29").text).toBe("Card: •••• •••• •••• 1111 exp 12/29");
    expect(mask("My Aadhaar is 2345 6789 0124").text).toBe("My Aadhaar is XXXX XXXX 0124");
    expect(mask("PAN: ABCPE1234F").text).toBe("PAN: XXXXX1234X");
    expect(mask("username: priya\npassword: S3cret!pass").text).toBe("username: priya\npassword: •••");
    expect(mask("token ghp_abcdefghijklmnopqrstuvwxyz0123456789AB, thanks").text).toBe("token [hidden], thanks");
    expect(mask("Account number: 50100234567891").text).toBe("Account number: XXXX7891");
    const contacts = Array.from({ length: 10 }, (_, i) => `priya${i}@acme.in 98765432${10 + i}`).join("\n");
    const masked = mask(contacts);
    expect(masked.text.split("\n")[0]).toBe("p•••@acme.in ••••••••10");
    expect(masked.kinds).toEqual(["bulk_personal_data"]);
  });

  it("leaves a lone colleague's contact details alone", () => {
    expect(mask("Card 4111 1111 1111 1111, call priya@acme.in or 9876543210").text).toBe("Card •••• •••• •••• 1111, call priya@acme.in or 9876543210");
  });

  it("only reports data types the server accepts", () => {
    const source = readFileSync("extension/detect.js", "utf8");
    const pushed = [...source.matchAll(/found\.push\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(new Set(pushed)).toEqual(new Set(AGENT_DATA_TYPE_KEYS));
  });
});

describe("extension file checks", () => {
  it("reads spreadsheets", async () => {
    const bytes = zip({
      "[Content_Types].xml": "<Types/>",
      "xl/sharedStrings.xml": "<sst><si><t>Name</t></si><si><t>PAN</t></si><si><r><t>Pri</t></r><r><t>ya &amp; Co</t></r></si><si><t>ABCPE1234F</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>9876543210</v></c><c r="D2"><v>4.111111111111111E+15</v></c><c r="E2" t="inlineStr"><is><t>inline</t></is></c></row></sheetData></worksheet>',
    });
    const text = await files.extractXlsxText(bytes);
    expect(text).toBe("Name\tPAN\nPriya & Co\tABCPE1234F\t9876543210\t4111111111111111\tinline");
    expect(detect(text)).toEqual(["card_number", "pan"]);
  });

  it("reads Word documents, deflated or stored", async () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Card </w:t></w:r><w:r><w:t xml:space="preserve">4111 1111 </w:t></w:r><w:r><w:t>1111 1111</w:t></w:r></w:p>' +
      "<w:p><w:r><w:t>Second</w:t><w:tab/><w:t>line</w:t></w:r></w:p></w:body></w:document>";
    for (const method of [8, 0] as const) {
      const text = await files.extractDocxText(zip({ "word/document.xml": xml }, method));
      expect(text).toBe("Card 4111 1111 1111 1111\nSecond\tline");
      expect(detect(text)).toEqual(["card_number"]);
    }
  });

  it("reads text from PDFs, compressed or not", async () => {
    const content = "BT /F1 12 Tf 72 712 Td (PAN: ABCPE1234F) Tj T* [(Card 4111 1111 ) -50 (1111 1111)] TJ ET";
    expect(files.pdfTextFromContent(content)).toContain("PAN: ABCPE1234F\nCard 4111 1111 1111 1111");
    const flate = deflateSync(Buffer.from(content));
    const plain = "BT (password: hunter2!x) Tj ET";
    const pdf = Buffer.concat([
      Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${flate.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
      flate,
      Buffer.from(`\nendstream\nendobj\n2 0 obj\n<< /Length ${plain.length} >>\nstream\n${plain}\nendstream\nendobj\n%%EOF`, "latin1"),
    ]);
    const text = await files.extractPdfText(new Uint8Array(pdf));
    expect(detect(text)).toEqual(["password", "card_number", "pan"]);
  });

  it("skips what it can't read instead of failing", async () => {
    const scanned = Buffer.concat([Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /DCTDecode >>\nstream\n"), Buffer.from([0xff, 0xd8, 0x00]), Buffer.from("\nendstream")]);
    expect(await files.extractPdfText(new Uint8Array(scanned))).toBe("");
    expect(await files.extractXlsxText(new Uint8Array([1, 2, 3]))).toBe("");
    expect(await files.extractFileText(new File([new Uint8Array([0x50, 0x4b, 3, 4])], "broken.docx"))).toBe("");
  });

  it("reads plain text files and picks which files to check", async () => {
    expect(await files.extractFileText(new File(["name,card\nPriya,4111 1111 1111 1111"], "customers.csv"))).toContain("4111");
    expect(files.canCheck({ name: "report.PDF", size: 2048 })).toBe(true);
    expect(files.canCheck({ name: "photo.jpg", size: 2048 })).toBe(false);
    expect(files.canCheck({ name: "huge.csv", size: 11 * 1024 * 1024 })).toBe(false);
    expect(files.canCheck({ name: "empty.txt", size: 0 })).toBe(false);
  });

  it("strips XML tags and entities", () => {
    expect(files.stripXml("<a>Tom &amp; <b>Jerry</b></a>&#8377;5")).toBe("Tom & Jerry ₹5");
  });
});

describe("extension package", () => {
  const config = { apiUrl: "https://app.example.in", token: "hpa_x", orgName: "Acme Clinic", userName: "Priya" };

  it("runs only on the protected sites and talks only to HighPre", () => {
    const manifest = extensionManifest(config);
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.host_permissions).toEqual(["https://app.example.in/*"]);
    expect(manifest.permissions).toEqual(["storage", "alarms"]);
    expect(manifest.content_scripts[0].matches).toHaveLength(Object.keys(EXTENSION_SITES).length);
    expect(manifest.content_scripts[0].matches.every((m: string) => m.startsWith("https://") && !m.includes("*."))).toBe(true);
    expect(manifest.content_scripts[0].js).toEqual(["catalog.js", "detect.js", "files.js", "content.js"]);
  });

  it("maps every site to a known app and has labels for every key", () => {
    const catalog = extensionCatalog();
    for (const app of Object.values(catalog.sites)) expect(AGENT_APP_KEYS).toContain(app);
    for (const key of AGENT_DATA_TYPE_KEYS) expect(catalog.data[key]).toBeTruthy();
    for (const key of AGENT_APP_KEYS) expect(catalog.categories[key]).toBeTruthy();
    expect(catalog.high).toContain("card_number");
    expect(catalog.high).not.toContain("bulk_personal_data");
    expect(catalog.sites["mail.google.com"]).toBe("gmail");
    expect(catalog.categories.gmail).toBe("email");
  });

  it("reports only keys, never page text", () => {
    const background = readFileSync("extension/background.js", "utf8");
    // The event the extension sends is built from these fields only; `via` only from a fixed list.
    expect(background).toMatch(/\{ dataType: k, app: msg\.app, occurredAt: at, source: "extension", outcome: msg\.outcome, via: \[[a-z", ]+\]\.indexOf\(msg\.via\) >= 0 \? msg\.via : undefined \}/);
    const content = readFileSync("extension/content.js", "utf8");
    expect(content).toMatch(/sendMessage\(\{ type: "detection", kinds: kinds, app: app, outcome: outcome, via: via \}\)/);
  });

  it("draws valid PNG icons", () => {
    const png = iconPng(16);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(16);
  });
});
