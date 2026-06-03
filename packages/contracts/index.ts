import ModelRegistryAbiJson from "./abi/ModelRegistry.json";
import avalancheFujiDeployment from "./deployments/avalancheFuji.json";

/**
 * ABI of the ModelRegistry contract, extracted from the Hardhat artifact.
 * Consumers (viem/wagmi/ethers) can cast this to their own `Abi` type.
 */
export const ModelRegistryAbi = ModelRegistryAbiJson;

export interface Deployment {
  chainId: number;
  address: string;
}

const deployments: Deployment[] = [avalancheFujiDeployment as Deployment];

/** chainId -> deployed contract address (only chains with a non-empty address). */
export const registryAddresses: Record<number, string> = Object.fromEntries(
  deployments
    .filter((d) => typeof d.address === "string" && d.address.length > 0)
    .map((d) => [d.chainId, d.address]),
);

/** Returns the deployed ModelRegistry address for a chain, or undefined if not deployed. */
export function getRegistryAddress(chainId: number): string | undefined {
  return registryAddresses[chainId];
}

// --- Hash normalization (Invariant 2) -----------------------------------------------------------
// `bytesToHex` (noble) returns hex WITHOUT a `0x` prefix; Mongo stores that non-prefixed, lowercase
// form. The contract and viem/ethers require a `0x`-prefixed bytes32. These are THE canonical
// helpers — use `toCanonicalHash` for storage/compare and `toBytes32` only at the contract call
// site / when matching event args. Never compare a prefixed value against a non-prefixed one.

/** Canonical (Mongo) form: lowercase, no `0x` prefix. */
export function toCanonicalHash(hash: string): string {
  return hash.trim().toLowerCase().replace(/^0x/, "");
}

/** Contract/viem form: `0x`-prefixed, lowercase. */
export function toBytes32(hash: string): `0x${string}` {
  return `0x${toCanonicalHash(hash)}` as `0x${string}`;
}
