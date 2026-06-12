import { ethers, network } from "hardhat";
import type { ContractTransactionResponse } from "ethers";
import * as fs from "fs";
import * as path from "path";

// Seeds the deployed ModelRegistry with a demo dataset for the paper's Evaluation (T8):
//   3 base models + 2 derived (forming a 3-deep on-chain lineage) + 1 transferOwnership + 1
//   updateMetadata. Prints every tx hash, then reconstructs the lineage OFF-chain (Decision M) to
//   show the DAG walk. Hashes are salted with a run id so re-runs don't hit AlreadyRegistered.
//
//   pnpm --filter @handshake/contracts demo:fuji     (needs a funded DEPLOYER_PRIVATE_KEY)
//   pnpm --filter @handshake/contracts demo:local    (against `hardhat node` + deploy:local)

const CID = "bafybeidemoplaceholdercidforhandshakephase2evaluation00";

function hashFor(label: string, runId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(`${label}:${runId}`));
}

async function main() {
  const file = path.join(__dirname, "..", "deployments", `${network.name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`No deployment for "${network.name}". Deploy first (deploy:local / deploy:fuji).`);
  }
  const { address } = JSON.parse(fs.readFileSync(file, "utf8")) as { address: string };
  const registry = await ethers.getContractAt("ModelRegistry", address);

  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const recipient = signers[1] ?? deployer; // for transferOwnership demo
  const runId = Date.now().toString();
  const txs: Array<{ label: string; hash: string }> = [];

  const explorer = network.name === "avalancheFuji" ? "https://testnet.snowtrace.io/tx/" : "";
  async function record(label: string, sendTx: Promise<ContractTransactionResponse>) {
    const tx = await sendTx;
    const rc = await tx.wait();
    const hash = rc?.hash ?? tx.hash;
    txs.push({ label, hash });
    console.log(`  ${label.padEnd(26)} ${hash}`);
    return rc;
  }

  console.log(`Seeding ModelRegistry ${address} on ${network.name} as ${deployer.address}\n`);

  // 3 base models (no parents)
  const base1 = hashFor("base-vit", runId);
  const base2 = hashFor("base-llama", runId);
  const base3 = hashFor("base-whisper", runId);
  await record("register base-vit", registry.registerModel(base1, CID, []));
  await record("register base-llama", registry.registerModel(base2, CID, []));
  await record("register base-whisper", registry.registerModel(base3, CID, []));

  // 2 derived models forming a 3-deep chain: base-vit -> derived-lora -> derived-quant
  const derived1 = hashFor("derived-lora", runId);
  const derived2 = hashFor("derived-quant", runId);
  await record("register derived-lora", registry.registerModel(derived1, CID, [base1]));
  await record("register derived-quant", registry.registerModel(derived2, CID, [derived1]));

  // 1 updateMetadata (owner-only)
  await record("updateMetadata base-llama", registry.updateMetadata(base2, CID + "-v2"));

  // 1 transferOwnership (initiate); accept too if a funded second signer exists.
  await record(
    "transferOwnership base-whisper",
    registry.transferOwnership(base3, recipient.address),
  );
  if (recipient.address !== deployer.address) {
    try {
      await record(
        "acceptOwnership base-whisper",
        registry.connect(recipient).acceptOwnership(base3),
      );
    } catch (e) {
      console.log(`  (acceptOwnership skipped: ${(e as Error).message})`);
    }
  }

  // Off-chain lineage reconstruction of the deepest node (Decision M).
  console.log("\nOff-chain lineage walk for derived-quant (immediate parents per hop):");
  const labelByHash: Record<string, string> = {
    [base1]: "base-vit",
    [base2]: "base-llama",
    [base3]: "base-whisper",
    [derived1]: "derived-lora",
    [derived2]: "derived-quant",
  };
  const visited = new Set<string>();
  const queue = [derived2];
  while (queue.length) {
    const cur = queue.shift() as string;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const m = await registry.getModel(cur);
    if (!m.exists) continue;
    const parents = (m.parents as string[]);
    for (const p of parents) {
      console.log(`  ${labelByHash[cur] ?? cur.slice(0, 10)} -> ${labelByHash[p] ?? p.slice(0, 10)}`);
      queue.push(p);
    }
  }

  console.log(`\n${txs.length} transactions sent.`);
  if (explorer) {
    console.log("Snowtrace URLs:");
    for (const t of txs) console.log(`  ${t.label}: ${explorer}${t.hash}`);
  }
  // Persist for the docs/paper.
  const outDir = path.join(__dirname, "..", "deployments");
  fs.writeFileSync(
    path.join(outDir, `demo-${network.name}.json`),
    JSON.stringify({ contract: address, network: network.name, runId, txs }, null, 2) + "\n",
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
