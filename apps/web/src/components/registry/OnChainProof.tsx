"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { toast } from "sonner"
import {
  ShieldCheckIcon,
  Loader2Icon,
  AlertCircleIcon,
  ExternalLinkIcon,
  LinkIcon,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { IModel } from "@handshake/types"
import { patchBlockchainRecord } from "@/services/api"
import { useRegisterModel } from "@/hooks/useRegisterModel"
import { resolveOnChainParents } from "@/lib/onchainParents"
import {
  registryAddress,
  snowtraceTxUrl,
  snowtraceAddressUrl,
  REGISTRY_CHAIN_ID,
} from "@/lib/contracts"

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

// Detail-page on-chain section: shows the immutable proof when verified, resumes a pending tx from
// localStorage, or offers a Register CTA when the model is still off-chain only (skip path).
export function OnChainProof({ model }: { model: IModel }) {
  const qc = useQueryClient()
  const { status, txHash, receipt, errorMessage, register, reset, isConnected } = useRegisterModel(
    model.modelHash,
  )
  const [busy, setBusy] = useState(false)
  const [patched, setPatched] = useState(false)

  useEffect(() => {
    if (status !== "confirmed" || !receipt || patched) return
    setPatched(true)
    patchBlockchainRecord(model._id, {
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      contractAddress: registryAddress() ?? receipt.to ?? undefined,
      chainId: REGISTRY_CHAIN_ID,
    })
      .then(() => toast.success("Registered on-chain"))
      .catch(() => undefined)
      .finally(() => qc.invalidateQueries({ queryKey: ["models", model._id] }))
  }, [status, receipt, patched, model._id, qc])

  // Verified → immutable proof card.
  if (model.onChainRegistered && model.blockchain?.txHash) {
    const b = model.blockchain
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-1.5">
            <ShieldCheckIcon className="size-4 text-tx-confirmed" /> On-chain proof
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Row
            label="Transaction"
            value={
              <a
                href={snowtraceTxUrl(b.txHash as string)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
              >
                {(b.txHash as string).slice(0, 12)}…
                <ExternalLinkIcon className="size-3" />
              </a>
            }
          />
          {b.blockNumber != null && (
            <Row label="Block" value={<span className="font-mono text-xs">{b.blockNumber}</span>} />
          )}
          {b.chainId != null && (
            <Row label="Chain" value={<Badge variant="secondary">Fuji ({b.chainId})</Badge>} />
          )}
          {b.contractAddress && (
            <Row
              label="Registry"
              value={
                <a
                  href={snowtraceAddressUrl(b.contractAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                >
                  {b.contractAddress.slice(0, 10)}…
                  <ExternalLinkIcon className="size-3" />
                </a>
              }
            />
          )}
        </CardContent>
      </Card>
    )
  }

  // A pending tx (just sent, or resumed from localStorage) is still confirming.
  const isPending = status === "pending" || (status !== "confirmed" && !!txHash)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">On-chain status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isPending ? (
          <div className="flex items-center gap-2 text-xs">
            <Loader2Icon className="size-3.5 animate-spin text-tx-pending" />
            <span>Confirming on-chain registration…</span>
            {txHash && (
              <a
                href={snowtraceTxUrl(txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-primary hover:underline inline-flex items-center gap-1"
              >
                Snowtrace <ExternalLinkIcon className="size-3" />
              </a>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <AlertCircleIcon className="size-3.5" />
              Not anchored on-chain yet — provenance is off-chain only.
            </div>
            {status === "error" && <p className="text-xs text-destructive">{errorMessage}</p>}
            {!isConnected ? (
              <ConnectButton showBalance={false} chainStatus="icon" />
            ) : status === "error" ? (
              <Button size="sm" onClick={reset}>
                Try again
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const parentHashes = await resolveOnChainParents(model.baseModel ?? [])
                    await register({ metadataCID: model.metadataCid, parentHashes })
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                {busy ? (
                  <>
                    <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />
                    Check wallet…
                  </>
                ) : (
                  <>
                    <LinkIcon className="size-3.5 mr-1.5" />
                    Register on-chain
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
