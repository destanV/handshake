#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { runAll, runApi, runFund, runHfFetch, runOnChain, runVerify } from "./pipeline.js";

type Command =
  | "seed:all"
  | "seed:fund"
  | "seed:hf-fetch"
  | "seed:api"
  | "seed:onchain"
  | "seed:verify";

function parseArgs(argv: string[]): { command: Command; dryRun: boolean } {
  const command = (argv[2] ?? "seed:all") as Command;
  const allowed = new Set<Command>([
    "seed:all",
    "seed:fund",
    "seed:hf-fetch",
    "seed:api",
    "seed:onchain",
    "seed:verify",
  ]);
  if (!allowed.has(command)) {
    throw new Error(`Unknown seed command "${command}"`);
  }
  return {
    command,
    dryRun: argv.includes("--dry-run"),
  };
}

async function main(): Promise<void> {
  const { command, dryRun } = parseArgs(process.argv);
  const config = await loadConfig();

  switch (command) {
    case "seed:all":
      await runAll(config, dryRun);
      break;
    case "seed:fund":
      await runFund(config, dryRun);
      break;
    case "seed:hf-fetch":
      await runHfFetch(config, dryRun);
      break;
    case "seed:api":
      await runApi(config, dryRun);
      break;
    case "seed:onchain":
      await runOnChain(config, dryRun);
      break;
    case "seed:verify":
      if (dryRun) console.log("seed:verify has no dry-run mode; verifying current seed-state.json");
      await runVerify(config);
      break;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
