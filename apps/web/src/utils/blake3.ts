import { blake3 } from "@noble/hashes/blake3.js"
import { bytesToHex } from "@noble/hashes/utils.js"

const CHUNK_SIZE = 4 * 1024 * 1024 // 4 MB

export interface ManifestEntry {
  name: string
  size: number
  hash: string // blake3 of this individual file
}

export async function hashFile(
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  const hasher = blake3.create({})
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const buffer = await file.slice(start, end).arrayBuffer()
    hasher.update(new Uint8Array(buffer))
    onProgress(Math.round(((i + 1) / totalChunks) * 100))
    // Yield to event loop — keeps UI responsive on large files
    await new Promise<void>((r) => setTimeout(r, 0))
  }

  return bytesToHex(hasher.digest())
}

/**
 * Hash a set of files into a single manifest hash.
 *
 * Each file is hashed individually (blake3). The entries are sorted
 * alphabetically by filename so the manifest hash is deterministic
 * regardless of the order files were selected. The final manifestHash
 * is blake3(JSON.stringify(sortedEntries)).
 *
 * This ensures modelHash uniquely identifies the full model — not just
 * the weights file — which is required for OPML's submitClaim().
 */
export async function hashManifest(
  files: File[],
  onProgress: (pct: number) => void
): Promise<{ manifestHash: string; entries: ManifestEntry[] }> {
  const entries: ManifestEntry[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const fileHash = await hashFile(file, (pct) => {
      const overall = Math.round(((i + pct / 100) / files.length) * 100)
      onProgress(overall)
    })
    entries.push({ name: file.name, size: file.size, hash: fileHash })
  }

  // Sort by name — deterministic regardless of selection order
  entries.sort((a, b) => a.name.localeCompare(b.name))

  const manifestBytes = new TextEncoder().encode(JSON.stringify(entries))
  const hasher = blake3.create({})
  hasher.update(manifestBytes)
  const manifestHash = bytesToHex(hasher.digest())

  return { manifestHash, entries }
}
