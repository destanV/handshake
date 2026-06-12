import { createPublicClient, http } from "viem";
import { avalancheFuji } from "viem/chains";
import { ModelRegistryAbi, toBytes32 } from "@handshake/contracts";
import { SeedApiClient } from "./api/client.js";
import type { OnChainSeedRecord, RuntimeConfig } from "./types.js";
import { appendReport } from "./report.js";

function modelExists(value: unknown): boolean {
  if (Array.isArray(value)) return Boolean(value[5]);
  if (value && typeof value === "object" && "exists" in value) {
    return Boolean((value as { exists: boolean }).exists);
  }
  return false;
}

export async function verifySeed(config: RuntimeConfig, records: OnChainSeedRecord[]): Promise<void> {
  const api = new SeedApiClient(config);
  const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(config.rpcUrl),
  });

  for (const record of records) {
    const model = await api.fetchModel(record.modelId);
    const missing = [
      ["api model id", model._id],
      ["ipfs cid", model.modelFileCid],
      ["metadata cid", model.metadataCid],
      ["tx hash", model.blockchain?.txHash],
    ].filter(([, value]) => !value);
    if (missing.length > 0) {
      throw new Error(`${record.repoId} missing ${missing.map(([name]) => name).join(", ")}`);
    }
    if (!model.onChainRegistered) {
      throw new Error(`${record.repoId} has onChainRegistered=false`);
    }
    const onchain = await publicClient.readContract({
      address: config.registryAddress,
      abi: ModelRegistryAbi,
      functionName: "getModel",
      args: [toBytes32(model.modelHash)],
    });
    if (!modelExists(onchain)) {
      throw new Error(`${record.repoId} is not present in ModelRegistry`);
    }
    await appendReport(config, "verify.ok", {
      repoId: record.repoId,
      modelId: model._id,
      txHash: model.blockchain?.txHash,
    });
  }
  console.log(`verified ${records.length} seeded models`);
}
