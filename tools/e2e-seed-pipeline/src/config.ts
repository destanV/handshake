import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRegistryAddress } from "@handshake/contracts";
import type { RuntimeConfig } from "./types.js";

const DEFAULT_FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const DEFAULT_CHAIN_ID = 43113;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");

function loadDotEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index <= 0) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function loadSeedEnv(): void {
  loadDotEnvFile(path.join(repoRoot, ".env"));
  loadDotEnvFile(path.join(packageRoot, ".env"));
}

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readHexPrivateKey(name: string): `0x${string}` | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

function readAddress(name: string, fallback?: string): `0x${string}` {
  const value = process.env[name]?.trim() || fallback;
  if (!value || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed EVM address`);
  }
  return value as `0x${string}`;
}

export async function loadConfig(): Promise<RuntimeConfig> {
  loadSeedEnv();

  const chainId = readInt("SEED_CHAIN_ID", Number(process.env.CHAIN_ID) || DEFAULT_CHAIN_ID);
  const registryAddress = readAddress(
    "SEED_REGISTRY_ADDRESS",
    process.env.MODEL_REGISTRY_ADDRESS || getRegistryAddress(chainId),
  );
  const outputDir = process.env.SEED_OUTPUT_DIR
    ? path.resolve(process.env.SEED_OUTPUT_DIR)
    : path.join(packageRoot, ".seed-output");
  await mkdir(outputDir, { recursive: true });

  return {
    modelCount: readInt("SEED_MODEL_COUNT", 25),
    apiUrl: process.env.SEED_API_URL ?? "http://localhost:4000",
    clientUrl: process.env.SEED_CLIENT_URL ?? process.env.CLIENT_URL ?? "http://localhost:3000",
    registryAddress,
    rpcUrl: process.env.SEED_RPC_URL ?? process.env.AVALANCHE_FUJI_RPC ?? DEFAULT_FUJI_RPC,
    chainId,
    hfToken: process.env.SEED_HF_TOKEN,
    hfMaxBytesPerModel: readInt("SEED_HF_MAX_BYTES_PER_MODEL", 5_000_000),
    concurrency: readInt("SEED_CONCURRENCY", 3),
    outputDir,
    mnemonic: process.env.SEED_MNEMONIC,
    treasuryPrivateKey: readHexPrivateKey("SEED_TREASURY_PRIVATE_KEY"),
    minWalletBalanceAvax: process.env.SEED_MIN_WALLET_AVAX ?? "0.02",
    topUpAmountAvax: process.env.SEED_TOP_UP_AVAX ?? "0.05",
  };
}

export function requireMnemonic(config: RuntimeConfig): string {
  if (!config.mnemonic) {
    throw new Error("SEED_MNEMONIC is required for wallet-authenticated seed stages");
  }
  return config.mnemonic;
}

export function requireTreasuryPrivateKey(config: RuntimeConfig): `0x${string}` {
  if (!config.treasuryPrivateKey) {
    throw new Error("SEED_TREASURY_PRIVATE_KEY is required for seed:fund");
  }
  return config.treasuryPrivateKey;
}
