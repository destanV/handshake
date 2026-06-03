import { Source } from "@handshake/types"
import type { IParentRef } from "@handshake/types"
import { toCanonicalHash } from "@handshake/contracts"
import { fetchModel } from "@/services/api"

// Decision L: only in-registry parents that are themselves on-chain are passed as bytes32 parents;
// external (HF) and not-yet-anchored parents stay in off-chain metadata. Returns canonical (no-0x)
// hashes of handshake parents whose onChainRegistered === true.
export async function resolveOnChainParents(baseModel: IParentRef[]): Promise<string[]> {
  const handshakeParents = baseModel.filter((p) => p.source === Source.Handshake && p.handshakeId)
  const resolved = await Promise.all(
    handshakeParents.map(async (p) => {
      try {
        const m = await fetchModel(p.handshakeId as string)
        return m.onChainRegistered && m.modelHash ? toCanonicalHash(m.modelHash) : null
      } catch {
        return null
      }
    }),
  )
  return resolved.filter((x): x is string => x !== null)
}
