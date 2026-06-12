import { License } from "@handshake/types";
import type { HfRepoMetadata } from "../types.js";

const licenseMap = new Map<string, License>([
  ["apache-2.0", License.Apache2],
  ["apache2", License.Apache2],
  ["mit", License.MIT],
  ["gpl-3.0", License.GPL3],
  ["gplv3", License.GPL3],
  ["agpl-3.0", License.AGPL3],
  ["agplv3", License.AGPL3],
  ["cc-by-4.0", License.CcBy4],
  ["cc-by-nc-4.0", License.CcByNc4],
  ["llama-3", License.Llama3],
  ["llama3", License.Llama3],
  ["gemma", License.Gemma],
]);

export function normalizeHfLicense(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^license:/, "")
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
}

export function mapHfLicense(input: string | undefined): License | null {
  if (!input) return null;
  return licenseMap.get(normalizeHfLicense(input)) ?? null;
}

export function extractHfLicense(metadata: HfRepoMetadata): string | undefined {
  if (metadata.license) return metadata.license;
  const tag = metadata.tags.find((value) => normalizeHfLicense(value).length > 0 && value.startsWith("license:"));
  return tag ? normalizeHfLicense(tag) : undefined;
}

export function resolveAllowedLicense(metadata: HfRepoMetadata): License {
  const raw = extractHfLicense(metadata);
  const mapped = mapHfLicense(raw);
  if (!mapped || mapped === License.Other) {
    throw new Error(`Unsupported or missing Hugging Face license for ${metadata.repoId}: ${raw ?? "none"}`);
  }
  return mapped;
}

export function assertExpectedLicense(metadata: HfRepoMetadata, expected: License): License {
  const actual = resolveAllowedLicense(metadata);
  if (actual !== expected) {
    throw new Error(
      `License mismatch for ${metadata.repoId}: expected ${expected}, Hugging Face reports ${actual}`,
    );
  }
  return actual;
}
