import "server-only";
import { readFile } from "fs/promises";
import { join } from "path";
import type { DesktopPlatform } from "./catalog";
import { agentDistDir } from "./package";

/** Written by agent/build.mjs next to the binaries. */
type Manifest = {
  version: string;
  updatesSigned: boolean;
  files: Partial<Record<DesktopPlatform, { file: string; sha256: string; size: number; signature?: string }>>;
};

let cached: { at: number; manifest: Manifest | null } | null = null;

/** The build manifest, re-read at most once a minute so a redeploy is picked up. */
export async function agentManifest(): Promise<Manifest | null> {
  if (cached && Date.now() - cached.at < 60_000) return cached.manifest;
  let manifest: Manifest | null = null;
  try {
    manifest = JSON.parse(await readFile(join(agentDistDir(), "manifest.json"), "utf8")) as Manifest;
  } catch {
    manifest = null;
  }
  cached = { at: Date.now(), manifest };
  return manifest;
}

/** Compares dotted versions like the agent does (agent/update.go). */
export function newerVersion(a: string, b: string): boolean {
  const pa = a.split("."), pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number(pa[i] ?? 0) || 0, y = Number(pb[i] ?? 0) || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** A signed update for this platform when the installed version is older, otherwise null. */
export async function updateOffer(platform: DesktopPlatform, installed: string) {
  const manifest = await agentManifest();
  const file = manifest?.files[platform];
  if (!manifest || !file?.signature || !newerVersion(manifest.version, installed)) return null;
  return { version: manifest.version, sha256: file.sha256, signature: file.signature, size: file.size, file: file.file };
}
