import type { HfRepoFile, SelectedHfFile } from "../types.js";

export interface SelectFilesInput {
  repoId: string;
  revision: string;
  files: HfRepoFile[];
  allowedPatterns: string[];
  ignorePatterns: string[];
  maxBytes: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegExp(pattern: string): RegExp {
  const parts = pattern.split("*").map(escapeRegExp);
  return new RegExp(`^${parts.join(".*")}$`);
}

export function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}

function hfResolveUrl(repoId: string, revision: string, path: string): string {
  const encodedRepo = repoId.split("/").map(encodeURIComponent).join("/");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://huggingface.co/${encodedRepo}/resolve/${encodeURIComponent(revision)}/${encodedPath}`;
}

export function selectAllowedFiles(input: SelectFilesInput): SelectedHfFile[] {
  const selected = input.files
    .filter((file) => matchesAny(file.path, input.allowedPatterns))
    .filter((file) => !matchesAny(file.path, input.ignorePatterns))
    .sort((a, b) => a.path.localeCompare(b.path));

  const unknown = selected.filter((file) => typeof file.size !== "number");
  if (unknown.length > 0) {
    throw new Error(
      `Cannot enforce byte guard for files without sizes: ${unknown.map((file) => file.path).join(", ")}`,
    );
  }

  const totalBytes = selected.reduce((sum, file) => sum + (file.size ?? 0), 0);
  if (totalBytes > input.maxBytes) {
    throw new Error(
      `Selected files for ${input.repoId} total ${totalBytes} bytes, above max ${input.maxBytes}`,
    );
  }

  if (selected.length === 0) {
    throw new Error(`No files matched allowed patterns for ${input.repoId}`);
  }

  return selected.map((file) => ({
    repoId: input.repoId,
    revision: input.revision,
    path: file.path,
    size: file.size as number,
    url: hfResolveUrl(input.repoId, input.revision, file.path),
  }));
}
