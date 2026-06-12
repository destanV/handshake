import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultAllowedPatterns,
  defaultIgnorePatterns,
  hfModelFixtures,
} from "../fixtures/hf-models.js";
import { hashManifest } from "../hash/manifest.js";
import type { HfModelFixture, RuntimeConfig, SelectedHfFile, StagedSeedModel } from "../types.js";
import { assertExpectedLicense } from "./license.js";
import { HfClient } from "./client.js";
import { matchesAny, selectAllowedFiles } from "./patterns.js";
import { mapWithConcurrency } from "../concurrency.js";
import { appendReport } from "../report.js";

function sanitizeRepoId(repoId: string): string {
  return repoId.replace(/[^a-zA-Z0-9._-]+/g, "__");
}

async function writeDownloadedFiles(
  client: HfClient,
  modelDir: string,
  files: SelectedHfFile[],
): Promise<void> {
  for (const file of files) {
    const out = path.join(modelDir, file.path);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, await client.downloadFile(file));
  }
}

async function writeBundle(
  modelDir: string,
  fixture: HfModelFixture,
  selectedFiles: SelectedHfFile[],
): Promise<{ bundlePath: string; bundleSize: number }> {
  const payload = {
    source: "huggingface",
    repoId: fixture.repoId,
    revision: fixture.revision ?? "main",
    generatedAt: new Date().toISOString(),
    files: await Promise.all(
      selectedFiles.map(async (file) => ({
        path: file.path,
        size: file.size,
        contentBase64: Buffer.from(await readFile(path.join(modelDir, file.path))).toString("base64"),
      })),
    ),
  };
  const bundlePath = path.join(modelDir, `${sanitizeRepoId(fixture.repoId)}.handshake-bundle.txt`);
  const serialized = JSON.stringify(payload);
  await writeFile(bundlePath, serialized, "utf8");
  return { bundlePath, bundleSize: Buffer.byteLength(serialized) };
}

async function stageOne(
  client: HfClient,
  config: RuntimeConfig,
  fixture: HfModelFixture,
  dryRun: boolean,
): Promise<StagedSeedModel> {
  const metadata = await client.fetchModelMetadata(fixture.repoId);
  const license = assertExpectedLicense(metadata, fixture.expectedLicense);
  const revision = fixture.revision ?? "main";
  const allowedPatterns = fixture.allowedPatterns ?? defaultAllowedPatterns;
  const ignorePatterns = fixture.ignorePatterns ?? defaultIgnorePatterns;
  const candidateFiles = metadata.files.filter(
    (file) => matchesAny(file.path, allowedPatterns) && !matchesAny(file.path, ignorePatterns),
  );
  const sizedFiles = await mapWithConcurrency(candidateFiles, config.concurrency, (file) =>
    client.resolveFileSize(fixture.repoId, revision, file),
  );
  const selectedFiles = selectAllowedFiles({
    repoId: fixture.repoId,
    revision,
    files: sizedFiles,
    allowedPatterns,
    ignorePatterns,
    maxBytes: config.hfMaxBytesPerModel,
  });
  const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  if (dryRun) {
    await appendReport(config, "hf.dry_run", {
      repoId: fixture.repoId,
      selectedFiles: selectedFiles.map((file) => ({ path: file.path, size: file.size })),
      totalBytes,
    });
    return { fixture, metadata, license, selectedFiles };
  }

  const modelDir = path.join(config.outputDir, "hf-cache", sanitizeRepoId(fixture.repoId));
  await mkdir(modelDir, { recursive: true });
  await writeDownloadedFiles(client, modelDir, selectedFiles);
  const manifest = await hashManifest(
    selectedFiles.map((file) => ({
      name: file.path,
      path: path.join(modelDir, file.path),
    })),
  );
  const { bundlePath, bundleSize } = await writeBundle(modelDir, fixture, selectedFiles);

  await appendReport(config, "hf.staged", {
    repoId: fixture.repoId,
    selectedFileCount: selectedFiles.length,
    totalBytes,
    manifestHash: manifest.manifestHash,
    bundleSize,
  });

  return {
    fixture,
    metadata,
    license,
    selectedFiles,
    manifest,
    stageDir: modelDir,
    bundlePath,
    bundleSize,
  };
}

export function selectFixtures(modelCount: number): HfModelFixture[] {
  if (modelCount > hfModelFixtures.length) {
    throw new Error(`SEED_MODEL_COUNT=${modelCount} exceeds curated fixture count ${hfModelFixtures.length}`);
  }
  return hfModelFixtures.slice(0, modelCount);
}

export async function stageHfModels(
  config: RuntimeConfig,
  dryRun: boolean,
): Promise<StagedSeedModel[]> {
  const client = new HfClient(config.hfToken);
  const fixtures = selectFixtures(config.modelCount);
  return mapWithConcurrency(fixtures, config.concurrency, (fixture) =>
    stageOne(client, config, fixture, dryRun),
  );
}
