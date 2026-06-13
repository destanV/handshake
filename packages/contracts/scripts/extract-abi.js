// Copies the ABI out of the Hardhat compile artifact into abi/ModelRegistry.json,
// which is the committed, app-facing ABI re-exported by index.ts (T4).
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const artifactPath = path.join(
  root,
  "artifacts",
  "contracts",
  "ModelRegistry.sol",
  "ModelRegistry.json",
);
const outPath = path.join(root, "abi", "ModelRegistry.json");

if (!fs.existsSync(artifactPath)) {
  console.error("Artifact not found — run `pnpm --filter @handshake/contracts compile` first.");
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2) + "\n");
console.log(`Wrote ABI (${artifact.abi.length} entries) -> ${path.relative(process.cwd(), outPath)}`);
