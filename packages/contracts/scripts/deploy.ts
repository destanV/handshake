import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Deploys ModelRegistry, records the address in deployments/<network>.json, and (on a public
// network with SNOWTRACE_API_KEY set) verifies the source on Snowtrace/Routescan. Usage:
//   pnpm --filter @handshake/contracts deploy:fuji
//   pnpm --filter @handshake/contracts deploy:local   (against `hardhat node`)
async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error(
      "No signer available. Set DEPLOYER_PRIVATE_KEY in packages/contracts/.env for live networks.",
    );
  }
  const deployer = signers[0];
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  console.log(`Network: ${network.name} (chainId ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatEther(balance)} (native)`);

  const Factory = await ethers.getContractFactory("ModelRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  console.log(`ModelRegistry deployed at: ${address}`);

  // Persist the deployment so @handshake/contracts (and both apps) can resolve the address.
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const file = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify({ chainId, address }, null, 2) + "\n");
  console.log(`Wrote ${path.relative(path.join(__dirname, "..", ".."), file)}`);

  const isLocal = network.name === "hardhat" || network.name === "localhost";
  if (!isLocal) {
    console.log("Waiting for 5 confirmations before verification…");
    await registry.deploymentTransaction()?.wait(5);
    try {
      await run("verify:verify", { address, constructorArguments: [] });
      console.log("Source verified on explorer.");
    } catch (e) {
      console.warn(`Verification skipped/failed: ${(e as Error).message}`);
      console.warn("Re-run manually: pnpm --filter @handshake/contracts verify:fuji " + address);
    }
  }

  console.log("\nNext steps:");
  console.log("  1) pnpm --filter @handshake/contracts extract-abi");
  console.log("  2) Set MODEL_REGISTRY_ADDRESS in the repo-root .env to:", address);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
