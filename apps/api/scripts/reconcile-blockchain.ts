// Manual full-scan reconciliation (ops tool). Re-reads every ModelRegistered event from the deploy
// block to head and upserts the on-chain record onto the matching Mongo doc — idempotently. Use
// after extended downtime or to rebuild from scratch. Self-contained (no Nest bootstrap) so it can
// run against any environment with just MONGO_URI + the registry address.
//
//   pnpm --filter @handshake/api reconcile:blockchain
//
import mongoose from "mongoose";
import { ethers } from "ethers";
import { ModelRegistryAbi, getRegistryAddress, toCanonicalHash } from "@handshake/contracts";

const MAX_BLOCK_RANGE = 2000;

async function main(): Promise<void> {
  const mongoUri = process.env.MONGO_URI;
  const rpc = process.env.AVALANCHE_FUJI_RPC?.trim() || "https://api.avax-test.network/ext/bc/C/rpc";
  const chainId = Number(process.env.CHAIN_ID ?? 43113);
  const address = process.env.MODEL_REGISTRY_ADDRESS?.trim() || getRegistryAddress(chainId);
  const deployBlock = Number(process.env.MODEL_REGISTRY_DEPLOY_BLOCK ?? 0);

  if (!mongoUri) throw new Error("MONGO_URI is required");
  if (!address) throw new Error("MODEL_REGISTRY_ADDRESS (or a committed deployment) is required");

  const provider = new ethers.JsonRpcProvider(rpc, chainId, { staticNetwork: true });
  const contract = new ethers.Contract(
    address,
    ModelRegistryAbi as unknown as ethers.InterfaceAbi,
    provider,
  );

  await mongoose.connect(mongoUri);
  const models = mongoose.connection.collection("modelrecords");
  const cursors = mongoose.connection.collection("blockchain_cursors");

  const head = await provider.getBlockNumber();
  const safeHead = head - 1;
  const filter = contract.filters.ModelRegistered();
  let scanned = 0;
  let updated = 0;

  for (let start = Math.max(deployBlock, 0); start <= safeHead; start += MAX_BLOCK_RANGE) {
    const end = Math.min(start + MAX_BLOCK_RANGE - 1, safeHead);
    const logs = (await contract.queryFilter(filter, start, end)) as ethers.EventLog[];
    for (const log of logs) {
      scanned++;
      const canonical = toCanonicalHash(log.args.modelHash as string);
      const block = await provider.getBlock(log.blockNumber);
      const res = await models.updateOne(
        {
          modelHash: canonical,
          $or: [
            { "blockchain.txHash": { $exists: false } },
            { "blockchain.txHash": { $ne: log.transactionHash } },
          ],
        },
        {
          $set: {
            onChainRegistered: true,
            blockchain: {
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              contractAddress: address,
              chainId,
              registeredAt: block ? new Date(block.timestamp * 1000) : new Date(),
            },
          },
        },
      );
      if (res.matchedCount > 0) updated++;
    }
  }

  await cursors.updateOne(
    { contractAddress: address },
    { $set: { contractAddress: address, lastSeenBlock: safeHead, updatedAt: new Date() } },
    { upsert: true },
  );

  console.log(`Scanned ${scanned} event(s); updated ${updated} model doc(s); cursor -> ${safeHead}.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
