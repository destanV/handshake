import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { blake3 } from "@noble/hashes/blake3.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { hashManifest, hashManifestEntries } from "./manifest.js";
import type { ManifestEntry } from "../types.js";

function directBlake3(input: string): string {
  const hasher = blake3.create({});
  hasher.update(new TextEncoder().encode(input));
  return bytesToHex(hasher.digest());
}

test("manifest hashing matches the web JSON entry semantics", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "handshake-seed-manifest-"));
  const alpha = path.join(dir, "alpha.txt");
  const beta = path.join(dir, "beta.txt");
  await writeFile(alpha, "alpha", "utf8");
  await writeFile(beta, "beta", "utf8");

  const result = await hashManifest([
    { name: "beta.txt", path: beta },
    { name: "alpha.txt", path: alpha },
  ]);
  const expectedEntries: ManifestEntry[] = [
    { name: "alpha.txt", size: 5, hash: directBlake3("alpha") },
    { name: "beta.txt", size: 4, hash: directBlake3("beta") },
  ];
  const expectedManifestHash = directBlake3(JSON.stringify(expectedEntries));

  assert.deepEqual(result.entries, expectedEntries);
  assert.equal(result.manifestHash, expectedManifestHash);
});

test("manifest entry hashing is deterministic regardless of entry order", () => {
  const entries: ManifestEntry[] = [
    { name: "b", size: 1, hash: "2" },
    { name: "a", size: 1, hash: "1" },
  ];
  assert.equal(hashManifestEntries(entries), hashManifestEntries([...entries].reverse()));
});
