import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimeConfig, SeedState } from "./types.js";

export function reportPath(config: RuntimeConfig): string {
  return path.join(config.outputDir, "seed-report.jsonl");
}

export function statePath(config: RuntimeConfig): string {
  return path.join(config.outputDir, "seed-state.json");
}

export async function appendReport(
  config: RuntimeConfig,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await appendFile(
    reportPath(config),
    JSON.stringify({ ts: new Date().toISOString(), event, ...payload }) + "\n",
    "utf8",
  );
}

export async function writeSeedState(config: RuntimeConfig, state: SeedState): Promise<void> {
  await writeFile(statePath(config), JSON.stringify(state, null, 2) + "\n", "utf8");
}

export async function readSeedState(config: RuntimeConfig): Promise<SeedState> {
  const raw = await readFile(statePath(config), "utf8");
  return JSON.parse(raw) as SeedState;
}
