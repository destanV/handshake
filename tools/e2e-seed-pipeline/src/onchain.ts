import {
  createPublicClient,
  createWalletClient,
  http,
  type TransactionReceipt,
} from "viem";
import type { HDAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { ModelRegistryAbi, toBytes32 } from "@handshake/contracts";
import { Source } from "@handshake/types";
import type { ApiSeedRecord, OnChainSeedRecord, RuntimeConfig } from "./types.js";
import { SeedApiClient } from "./api/client.js";
import { appendReport } from "./report.js";

function modelExists(value: unknown): boolean {
  if (Array.isArray(value)) return Boolean(value[5]);
  if (value && typeof value === "object" && "exists" in value) {
    return Boolean((value as { exists: boolean }).exists);
  }
  return false;
}

function parentHashes(record: ApiSeedRecord, registeredById: Map<string, OnChainSeedRecord>): string[] {
  return (record.apiModel.baseModel ?? [])
    .filter((parent) => parent.source === Source.Handshake && parent.handshakeId)
    .map((parent) => registeredById.get(parent.handshakeId as string))
    .filter((parent): parent is OnChainSeedRecord => Boolean(parent?.onChainRegistered))
    .map((parent) => parent.modelHash);
}

export async function registerApiRecordsOnChain(
  config: RuntimeConfig,
  accounts: HDAccount[],
  records: ApiSeedRecord[],
  dryRun: boolean,
): Promise<OnChainSeedRecord[]> {
  const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(config.rpcUrl),
  });
  const registeredById = new Map<string, OnChainSeedRecord>();
  const output: OnChainSeedRecord[] = [];

  for (const record of records) {
    const parents = parentHashes(record, registeredById);
    if (dryRun) {
      const planned = {
        ...record,
        contractAddress: config.registryAddress,
        chainId: config.chainId,
        onChainRegistered: false,
      };
      output.push(planned);
      console.log(`would register ${record.repoId} parents=${parents.length}`);
      continue;
    }

    const existing = await publicClient.readContract({
      address: config.registryAddress,
      abi: ModelRegistryAbi,
      functionName: "getModel",
      args: [toBytes32(record.modelHash)],
    });
    if (modelExists(existing)) {
      if (!record.apiModel.onChainRegistered) {
        throw new Error(
          `${record.repoId} is already registered on-chain but API has no txHash to patch; run reconciliation or use a fresh fixture set`,
        );
      }
      const skipped: OnChainSeedRecord = {
        ...record,
        txHash: record.apiModel.blockchain?.txHash,
        blockNumber: record.apiModel.blockchain?.blockNumber,
        contractAddress: record.apiModel.blockchain?.contractAddress,
        chainId: record.apiModel.blockchain?.chainId,
        onChainRegistered: true,
      };
      output.push(skipped);
      registeredById.set(record.modelId, skipped);
      continue;
    }

    const account = accounts[record.walletIndex];
    if (!account) throw new Error(`Missing wallet for record ${record.repoId} index=${record.walletIndex}`);
    const walletClient = createWalletClient({
      account,
      chain: avalancheFuji,
      transport: http(config.rpcUrl),
    });
    const txHash = await walletClient.writeContract({
      address: config.registryAddress,
      abi: ModelRegistryAbi,
      functionName: "registerModel",
      args: [toBytes32(record.modelHash), record.metadataCid, parents.map(toBytes32)],
    });
    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const api = new SeedApiClient(config, account);
    await api.login();
    const patched = await api.patchBlockchainRecord(record.modelId, {
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      contractAddress: config.registryAddress,
      chainId: config.chainId,
    });

    const onchain: OnChainSeedRecord = {
      ...record,
      apiModel: patched,
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      contractAddress: config.registryAddress,
      chainId: config.chainId,
      onChainRegistered: patched.onChainRegistered,
    };
    output.push(onchain);
    registeredById.set(record.modelId, onchain);
    await appendReport(config, "onchain.register", {
      repoId: record.repoId,
      modelId: record.modelId,
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      parentCount: parents.length,
    });
    console.log(`registered ${record.repoId}: ${receipt.transactionHash}`);
  }

  return output;
}
