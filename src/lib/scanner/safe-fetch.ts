import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "dns";
import http from "http";
import https from "https";
import net from "net";
import zlib from "zlib";

/**
 * Fetches public web pages for the scanner while defending against SSRF:
 * only http(s) on standard ports, every resolved IP must be public (checked at
 * connect time, so DNS rebinding can't slip through), redirects are followed
 * manually and re-validated, and responses are size- and time-capped.
 */

const MAX_BYTES = 2_500_000;
const TIMEOUT_MS = 10_000;
/** Hard cap per request, so a server trickling bytes can't hold a scan open. */
const DEADLINE_MS = 15_000;
const MAX_REDIRECTS = 4;
const USER_AGENT = "Mozilla/5.0 (compatible; HighPreScanner/1.0; +https://highpre.com/scanner)";

export class ScanFetchError extends Error {}

export type FetchedPage = {
  url: string;
  status: number;
  html: string;
  setCookies: string[];
  /** Headers of the final response (after redirects), for the security checks. */
  headers: http.IncomingHttpHeaders;
};

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIPv4(mapped[1]);
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  return true;
}

/** DNS lookup that refuses to hand private addresses to the socket. Shared with the TLS certificate check. */
export const guardedLookup: net.LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as unknown as LookupAddress[];
    const safe = list.filter((a) => !isPrivateIp(a.address));
    if (safe.length === 0) return callback(new ScanFetchError("This address isn't publicly reachable."), "", 0);
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, safe);
    callback(null, safe[0].address, safe[0].family);
  });
};

export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ScanFetchError("Enter a valid website address, like example.com.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new ScanFetchError("Only http and https websites can be scanned.");
  if (url.port && !["80", "443"].includes(url.port)) throw new ScanFetchError("Only standard web ports can be scanned.");
  if (url.username || url.password) throw new ScanFetchError("Remove credentials from the address.");
  if (net.isIP(url.hostname) || !url.hostname.includes(".")) throw new ScanFetchError("Enter a domain name rather than an IP address.");
  url.hash = "";
  return url;
}

function requestOnce(url: URL, accept: string, maxBytes: number, deadlineMs = DEADLINE_MS): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => req.destroy(new ScanFetchError("The website took too long to respond.")), deadlineMs);
    const done = <T,>(fn: (v: T) => void) => (v: T) => {
      clearTimeout(deadline);
      fn(v);
    };
    resolve = done(resolve);
    reject = done(reject);
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: accept,
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-IN,en;q=0.9",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new ScanFetchError("The page is too large to scan."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new ScanFetchError("The website took too long to respond.")));
    req.on("error", reject);
    req.end();
  });
}

function decodeBuffer(body: Buffer, encoding: string | undefined): Buffer {
  try {
    if (encoding === "gzip") return zlib.gunzipSync(body);
    if (encoding === "deflate") return zlib.inflateSync(body);
    if (encoding === "br") return zlib.brotliDecompressSync(body);
  } catch {
    /* fall through to raw */
  }
  return body;
}

const decode = (body: Buffer, encoding: string | undefined) => decodeBuffer(body, encoding).toString("utf8");

type Followed = { url: URL; status: number; headers: http.IncomingHttpHeaders; body: Buffer; setCookies: string[] };

/** GETs a URL, following and re-validating redirects. */
async function fetchFollowing(input: string | URL, accept: string, maxBytes: number, deadlineMs?: number): Promise<Followed> {
  let url = typeof input === "string" ? normalizeUrl(input) : input;
  const setCookies: string[] = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res;
    try {
      res = await requestOnce(url, accept, maxBytes, deadlineMs);
    } catch (error) {
      if (error instanceof ScanFetchError) throw error;
      throw new ScanFetchError(`Couldn't reach ${url.hostname}. Check the address and try again.`);
    }
    const cookies = res.headers["set-cookie"];
    if (cookies) setCookies.push(...cookies);

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = normalizeUrl(new URL(res.headers.location, url).toString());
      continue;
    }
    return { url, status: res.status, headers: res.headers, body: res.body, setCookies };
  }
  throw new ScanFetchError("The website redirected too many times.");
}

export async function safeFetchPage(input: string | URL): Promise<FetchedPage> {
  const res = await fetchFollowing(input, "text/html,application/xhtml+xml", MAX_BYTES);
  const type = String(res.headers["content-type"] ?? "");
  if (!type.includes("html")) throw new ScanFetchError("That address didn't return a web page.");
  return {
    url: res.url.toString(),
    status: res.status,
    html: decode(res.body, res.headers["content-encoding"] as string | undefined),
    setCookies: res.setCookies,
    headers: res.headers,
  };
}

/** Raster image types accepted for favicons. SVG is refused: it can carry script. */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"];
const MAX_IMAGE_BYTES = 100_000;

/** Fetches a small raster image (a favicon) with the same SSRF protections as pages. */
export async function safeFetchImage(input: string | URL): Promise<{ contentType: string; data: Buffer } | null> {
  try {
    // Favicons are optional: give up quickly rather than slow the scan down.
    const res = await fetchFollowing(input, IMAGE_TYPES.join(","), MAX_IMAGE_BYTES, 6_000);
    if (res.status !== 200 || res.body.length === 0) return null;
    let contentType = String(res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    // Many servers send .ico files as octet-stream; trust the ICO magic bytes instead.
    if (!IMAGE_TYPES.includes(contentType) && res.body.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) contentType = "image/x-icon";
    if (!IMAGE_TYPES.includes(contentType)) return null;
    const encoding = res.headers["content-encoding"] as string | undefined;
    const data = encoding ? Buffer.from(decodeBuffer(res.body, encoding)) : res.body;
    return { contentType, data };
  } catch {
    return null;
  }
}

/** Fetches a small text resource (a stylesheet or web manifest) with the same protections, or null. */
export async function safeFetchText(input: string | URL, accept: string, maxBytes = 300_000): Promise<string | null> {
  try {
    const res = await fetchFollowing(input, accept, maxBytes, 6_000);
    if (res.status !== 200) return null;
    return decode(res.body, res.headers["content-encoding"] as string | undefined);
  } catch {
    return null;
  }
}
