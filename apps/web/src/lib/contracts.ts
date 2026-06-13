import { ModelRegistryAbi, getRegistryAddress } from "@handshake/contracts"
import { avalancheFuji } from "wagmi/chains"
import type { Abi } from "viem"

// Re-export the shared ABI as a viem Abi for wagmi's typed hooks.
export const modelRegistryAbi = ModelRegistryAbi as unknown as Abi

// The app targets Avalanche Fuji only (see lib/wagmi.ts).
export const REGISTRY_CHAIN_ID = avalancheFuji.id // 43113

/** Deployed ModelRegistry address for the chain, or undefined until T3 deploy writes it. */
export function registryAddress(
  chainId: number = REGISTRY_CHAIN_ID,
): `0x${string}` | undefined {
  const addr = getRegistryAddress(chainId)
  return addr ? (addr as `0x${string}`) : undefined
}

export function snowtraceTxUrl(txHash: string): string {
  return `https://testnet.snowtrace.io/tx/${txHash}`
}

export function snowtraceAddressUrl(address: string): string {
  return `https://testnet.snowtrace.io/address/${address}`
}
