"use client"

import { useEffect, useState, type Dispatch } from "react"
import { useRouter } from "next/navigation"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { toast } from "sonner"
import {
  ShieldCheckIcon,
  Loader2Icon,
  AlertCircleIcon,
  AlertTriangleIcon,
  ExternalLinkIcon,
  LinkIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { IParentRef } from "@handshake/types"
import { patchBlockchainRecord } from "@/services/api"
import { useCommitRevealRegister, useRegisterModel } from "@/hooks/useRegisterModel"
import { resolveOnChainParents } from "@/lib/onchainParents"
import { registryAddress, snowtraceTxUrl, REGISTRY_CHAIN_ID } from "@/lib/contracts"
import type { WizardAction } from "./wizardTypes"

interface Props {
  modelId: string
  modelHash: string
  metadataCid: string
  baseModel: IParentRef[]
  dispatch: Dispatch<WizardAction>
}

function SnowtraceLink({ hash }: { hash: string }) {
  return (
    <a
      href={snowtraceTxUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
    >
      Snowtrace <ExternalLinkIcon className="size-3" />
    </a>
  )
}

export function RegisterOnChain({ modelId, modelHash, metadataCid, baseModel, dispatch }: Props) {
  const router = useRouter()
  const cr = useCommitRevealRegister(modelHash)
  const direct = useRegisterModel(modelHash)
  const [useDirect, setUseDirect] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [patched, setPatched] = useState(false)

  const isConnected = cr.isConnected
  const activeStatus = useDirect ? direct.status : cr.status

  // Persist the confirmed registration to the API, then navigate to the detail page.
  const confirmedReceipt =
    cr.status === "confirmed"
      ? cr.revealReceipt
      : direct.status === "confirmed"
        ? direct.receipt
        : undefined

  useEffect(() => {
    if (!confirmedReceipt || patched) return
    setPatched(true)
    patchBlockchainRecord(modelId, {
      txHash: confirmedReceipt.transactionHash,
      blockNumber: Number(confirmedReceipt.blockNumber),
      contractAddress: registryAddress() ?? confirmedReceipt.to ?? undefined,
      chainId: REGISTRY_CHAIN_ID,
    })
      .then(() => toast.success("Registered on-chain", { description: "Provenance anchored on Avalanche Fuji." }))
      .catch((e) =>
        toast.error("On-chain, but registry update failed — it will reconcile shortly", {
          description: e instanceof Error ? e.message : undefined,
        }),
      )
      .finally(() => router.push(`/registry/${modelId}`))
  }, [confirmedReceipt, patched, modelId, router])

  // Reflect the lifecycle into the wizard state.
  useEffect(() => {
    if (["committing", "revealing", "signing"].includes(activeStatus)) {
      dispatch({ type: "SET_UPLOAD_STATUS", status: "awaiting_signature" })
    } else if (["commit_pending", "reveal_pending", "pending"].includes(activeStatus)) {
      dispatch({ type: "SET_UPLOAD_STATUS", status: "tx_pending" })
    } else if (activeStatus === "confirmed") {
      dispatch({ type: "SET_UPLOAD_STATUS", status: "onchain_confirmed" })
    }
  }, [activeStatus, dispatch])

  async function withParents(run: (parentHashes: string[]) => Promise<void>) {
    setResolving(true)
    dispatch({ type: "SET_UPLOAD_STATUS", status: "awaiting_signature" })
    try {
      const parentHashes = await resolveOnChainParents(baseModel)
      await run(parentHashes)
    } finally {
      setResolving(false)
    }
  }

  function skip() {
    dispatch({ type: "SET_UPLOAD_STATUS", status: "onchain_skipped" })
    router.push(`/registry/${modelId}`)
  }

  const busy =
    resolving ||
    ["committing", "commit_pending", "revealing", "reveal_pending", "signing", "pending"].includes(
      activeStatus,
    )
  const errorMessage = useDirect ? direct.errorMessage : cr.errorMessage

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card/50 p-5 space-y-4 text-left">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="size-4 text-primary" />
        <p className="text-sm font-semibold">Anchor provenance on-chain</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Register on Avalanche Fuji so this model&apos;s hash, owner and lineage are independently
        verifiable. The default flow is a two-step commit→reveal that prevents another wallet from
        front-running your hash. You pay AVAX gas for each step.
      </p>

      {/* Pending tx banners */}
      {(activeStatus === "commit_pending" || activeStatus === "reveal_pending" || activeStatus === "pending") && (
        <div className="flex items-center gap-2 rounded-lg border border-tx-pending/30 bg-tx-pending/10 p-3 text-xs">
          <Loader2Icon className="size-3.5 animate-spin shrink-0 text-tx-pending" />
          <span>
            {activeStatus === "commit_pending"
              ? "Step 1 of 2 — confirming commit…"
              : activeStatus === "reveal_pending"
                ? "Step 2 of 2 — confirming registration…"
                : "Confirming registration…"}
          </span>
          {(cr.commitTxHash || cr.revealTxHash || direct.txHash) && (
            <SnowtraceLink
              hash={
                (activeStatus === "commit_pending"
                  ? cr.commitTxHash
                  : cr.revealTxHash ?? direct.txHash) as string
              }
            />
          )}
        </div>
      )}

      {/* Salt-custody warning while a commitment is outstanding */}
      {!useDirect && (activeStatus === "commit_pending" || activeStatus === "committed") && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
          <AlertTriangleIcon className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Keep this browser — your secret salt is stored locally and is required to finish step 2.
            Clearing site data before revealing forfeits the commit (you&apos;d re-commit after the
            window).
          </span>
        </div>
      )}

      {errorMessage && activeStatus === "error" && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircleIcon className="size-3.5 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!isConnected ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Connect a wallet to register.</p>
          <ConnectButton showBalance={false} chainStatus="icon" />
          <Button variant="ghost" size="sm" className="w-full" onClick={skip}>
            Skip for now
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            {activeStatus === "error" ? (
              <Button size="sm" className="flex-1" onClick={useDirect ? direct.reset : cr.reset}>
                Try again
              </Button>
            ) : useDirect ? (
              <Button
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() => withParents((p) => direct.register({ metadataCID: metadataCid, parentHashes: p }))}
              >
                {busy ? <Loader2Icon className="size-3.5 mr-1.5 animate-spin" /> : <LinkIcon className="size-3.5 mr-1.5" />}
                Register (one-step)
              </Button>
            ) : cr.status === "committed" ? (
              <Button
                size="sm"
                className="flex-1"
                disabled={busy}
                onClick={() => withParents((p) => cr.reveal({ metadataCID: metadataCid, parentHashes: p }))}
              >
                {busy ? <Loader2Icon className="size-3.5 mr-1.5 animate-spin" /> : <ShieldCheckIcon className="size-3.5 mr-1.5" />}
                Reveal &amp; register (2/2)
              </Button>
            ) : (
              <Button size="sm" className="flex-1" disabled={busy} onClick={() => cr.commit()}>
                {busy ? <Loader2Icon className="size-3.5 mr-1.5 animate-spin" /> : <LinkIcon className="size-3.5 mr-1.5" />}
                Register on-chain (1/2)
              </Button>
            )}
            <Button variant="outline" size="sm" className="flex-1" onClick={skip} disabled={busy}>
              Skip for now
            </Button>
          </div>

          {/* Fallback toggle (documented as front-runnable) */}
          {activeStatus === "idle" && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => setUseDirect((v) => !v)}
            >
              {useDirect
                ? "Use the safer two-step commit-reveal"
                : "Advanced: one-step register (front-runnable)"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
