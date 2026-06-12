import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { ManifestEntry, ManifestResult } from "../types.js";

export interface ManifestFileInput {
  name: string;
  path: string;
}

export function hashBytes(bytes: Uint8Array): string {
  const hasher = blake3.create({});
  hasher.update(bytes);
  return bytesToHex(hasher.digest());
}

export function hashManifestEntries(entries: ManifestEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  return hashBytes(new TextEncoder().encode(JSON.stringify(sorted)));
}

export async function hashFile(path: string): Promise<string> {
  const hasher = blake3.create({});
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk: string | Buffer) => {
      hasher.update(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return bytesToHex(hasher.digest());
}

export async function hashManifest(files: ManifestFileInput[]): Promise<ManifestResult> {
  const entries: ManifestEntry[] = [];
  for (const file of files) {
    const fileStat = await stat(file.path);
    entries.push({
      name: file.name,
      size: fileStat.size,
      hash: await hashFile(file.path),
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  return {
    entries,
    manifestHash: hashManifestEntries(entries),
  };
}
