"use client"

import { useCallback, useEffect, useState } from "react"
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi"
import { keccak256, encodeAbiParameters } from "viem"
import type { TransactionReceipt } from "viem"
import { toBytes32 } from "@handshake/contracts"
import { modelRegistryAbi, registryAddress, REGISTRY_CHAIN_ID } from "@/lib/contracts"

export type RegisterStatus = "idle" | "signing" | "pending" | "confirmed" | "error"

const pendingTxKey = (modelHash: string) => `handshake:pending_tx:${modelHash}`

// Maps a viem/wallet error to a short, user-facing reason. Covers the contract's custom errors
// plus the common wallet states (T5: parse AlreadyRegistered, insufficient AVAX, ParentNotRegistered).
export function parseRevertReason(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string }
  const msg = err?.shortMessage ?? err?.message ?? "Transaction failed"
  if (/AlreadyRegistered/i.test(msg)) return "This model hash is already registered on-chain."
  if (/ParentNotRegistered/i.test(msg)) return "A selected parent isn't registered on-chain yet."
  if (/TooManyParents/i.test(msg)) return "Too many on-chain parents (max 8)."
  if (/CommitmentExists/i.test(msg)) return "A commitment for this model has already been made."
  if (/NoCommitment/i.test(msg))
    return "No matching commitment found. It may have expired or the salt is wrong."
  if (/CommitTooRecent/i.test(msg))
    return "Reveal is too soon. Wait for the commit transaction to have at least one confirmation."
  if (/CommitExpired/i.test(msg)) return "The commitment has expired. Please start over."
  if (/insufficient funds|insufficient.*gas/i.test(msg)) return "Insufficient AVAX for gas."
  if (/user rejected|user denied|rejected the request/i.test(msg)) return "Signature rejected."
  return msg
}

interface RegisterInput {
  metadataCID: string
  /** Canonical (no-0x) hashes of parents whose onChainRegistered === true (Decision L). */
  parentHashes: string[]
}

/**
 * Drives the direct registerModel(...) flow: idle → signing → pending → confirmed | error.
 * modelHash is passed as a 0x-prefixed bytes32 (Invariant 2); the pending tx hash is persisted to
 * localStorage so the detail page can resume confirmation after a reload.
 */
export function useRegisterModel(modelHash: string) {
  const { address, isConnected, chainId } = useAccount()
  const { writeContractAsync, reset: resetWrite } = useWriteContract()

  const [status, setStatus] = useState<RegisterStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(() => {
    if (typeof window === "undefined") return undefined
    const saved = window.localStorage.getItem(pendingTxKey(modelHash))
    return saved ? (saved as `0x${string}`) : undefined
  })

  const {
    data: receipt,
    isLoading: isConfirming,
    isError: receiptIsError,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash, chainId: REGISTRY_CHAIN_ID })

  const clearPending = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(pendingTxKey(modelHash))
  }, [modelHash])

  // Derive status from the receipt watcher.
  useEffect(() => {
    if (!txHash) return
    if (isConfirming) {
      setStatus("pending")
      return
    }
    if (receipt) {
      if (receipt.status === "reverted") {
        setStatus("error")
        setErrorMessage("Transaction reverted on-chain.")
      } else {
        setStatus("confirmed")
        clearPending()
      }
    } else if (receiptIsError) {
      setStatus("error")
      setErrorMessage(parseRevertReason(receiptError))
    }
  }, [txHash, isConfirming, receipt, receiptIsError, receiptError, clearPending])

  const register = useCallback(
    async ({ metadataCID, parentHashes }: RegisterInput) => {
      const addr = registryAddress(chainId ?? REGISTRY_CHAIN_ID)
      if (!addr) {
        setStatus("error")
        setErrorMessage("ModelRegistry is not deployed on this network yet.")
        return
      }
      if (!isConnected) {
        setStatus("error")
        setErrorMessage("Connect your wallet first.")
        return
      }

      setErrorMessage("")
      setStatus("signing")
      try {
        const hash = await writeContractAsync({
          address: addr,
          abi: modelRegistryAbi,
          functionName: "registerModel",
          args: [toBytes32(modelHash), metadataCID, parentHashes.map(toBytes32)],
          chainId: REGISTRY_CHAIN_ID,
        })
        if (typeof window !== "undefined") {
          window.localStorage.setItem(pendingTxKey(modelHash), hash)
        }
        setTxHash(hash)
        setStatus("pending")
      } catch (e) {
        setStatus("error")
        setErrorMessage(parseRevertReason(e))
      }
    },
    [chainId, isConnected, modelHash, writeContractAsync],
  )

  const reset = useCallback(() => {
    resetWrite()
    clearPending()
    setTxHash(undefined)
    setErrorMessage("")
    setStatus("idle")
  }, [resetWrite, clearPending])

  return {
    status,
    txHash,
    receipt: receipt as TransactionReceipt | undefined,
    errorMessage,
    register,
    reset,
    isConnected,
    account: address,
  }
}

// ─── Commit-reveal (front-running-mitigated path, T9) ──────────────────────────

export type CommitRevealStatus =
  | "idle"
  | "committing" // awaiting commit signature
  | "commit_pending" // commit tx sent, confirming
  | "committed" // commit confirmed, ready to reveal
  | "revealing" // awaiting reveal signature
  | "reveal_pending" // reveal tx sent, confirming
  | "confirmed"
  | "error"

const commitKey = (modelHash: string) => `handshake:commit:${modelHash}`

interface CommitRecord {
  salt: `0x${string}`
  commitment: `0x${string}`
  commitTxHash?: `0x${string}`
}

function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`
}

function loadCommit(modelHash: string): CommitRecord | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(commitKey(modelHash))
  return raw ? (JSON.parse(raw) as CommitRecord) : null
}
function saveCommit(modelHash: string, rec: CommitRecord) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(commitKey(modelHash), JSON.stringify(rec))
  }
}
function clearCommit(modelHash: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(commitKey(modelHash))
}

/**
 * Two-step commit-reveal registration (Decision N). State machine:
 *   idle → committing → commit_pending → committed → revealing → reveal_pending → confirmed.
 * The random salt + commitment are written to localStorage BEFORE the commit tx is sent, so a
 * reload can resume at the reveal step. The reveal tx hash reuses the `handshake:pending_tx:*` key
 * so the detail page resumes confirmation. Reveal is gated on the commit having ≥1 confirmation
 * (the contract additionally rejects a same-block reveal with CommitTooRecent).
 */
export function useCommitRevealRegister(modelHash: string) {
  const { address, isConnected, chainId } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [record, setRecord] = useState<CommitRecord | null>(() => loadCommit(modelHash))
  const [status, setStatus] = useState<CommitRevealStatus>(() =>
    loadCommit(modelHash) ? "committed" : "idle",
  )
  const [errorMessage, setErrorMessage] = useState("")
  const [commitTxHash, setCommitTxHash] = useState<`0x${string}` | undefined>(
    () => loadCommit(modelHash)?.commitTxHash,
  )
  const [revealTxHash, setRevealTxHash] = useState<`0x${string}` | undefined>(() => {
    if (typeof window === "undefined") return undefined
    const saved = window.localStorage.getItem(pendingTxKey(modelHash))
    return saved ? (saved as `0x${string}`) : undefined
  })

  const commitReceipt = useWaitForTransactionReceipt({
    hash: commitTxHash,
    chainId: REGISTRY_CHAIN_ID,
  })
  const revealReceipt = useWaitForTransactionReceipt({
    hash: revealTxHash,
    chainId: REGISTRY_CHAIN_ID,
  })

  // Commit confirmation → ready to reveal.
  useEffect(() => {
    if (!commitTxHash || revealTxHash) return
    if (commitReceipt.isLoading) {
      setStatus((s) => (s === "committing" ? "commit_pending" : s))
      return
    }
    if (commitReceipt.data) {
      if (commitReceipt.data.status === "reverted") {
        setStatus("error")
        setErrorMessage("Commit transaction reverted.")
        clearCommit(modelHash)
        setRecord(null)
      } else {
        setStatus((s) => (s === "confirmed" ? s : "committed"))
      }
    } else if (commitReceipt.isError) {
      setStatus("error")
      setErrorMessage(parseRevertReason(commitReceipt.error))
    }
  }, [commitTxHash, revealTxHash, commitReceipt.isLoading, commitReceipt.data, commitReceipt.isError, commitReceipt.error])

  // Reveal confirmation → done.
  useEffect(() => {
    if (!revealTxHash) return
    if (revealReceipt.isLoading) {
      setStatus("reveal_pending")
      return
    }
    if (revealReceipt.data) {
      if (revealReceipt.data.status === "reverted") {
        setStatus("committed")
        setErrorMessage("Reveal transaction reverted. You may be able to try again.")
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(pendingTxKey(modelHash))
        }
        setRevealTxHash(undefined)
      } else {
        setStatus("confirmed")
        clearCommit(modelHash)
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(pendingTxKey(modelHash))
        }
      }
    } else if (revealReceipt.isError) {
      setStatus("error")
      setErrorMessage(parseRevertReason(revealReceipt.error))
    }
  }, [revealTxHash, revealReceipt.isLoading, revealReceipt.data, revealReceipt.isError, revealReceipt.error, modelHash])

  const commit = useCallback(async () => {
    const addr = registryAddress(chainId ?? REGISTRY_CHAIN_ID)
    if (!addr) {
      setStatus("error")
      setErrorMessage("ModelRegistry is not deployed on this network yet.")
      return
    }
    if (!isConnected || !address) {
      setStatus("error")
      setErrorMessage("Connect your wallet first.")
      return
    }

    setErrorMessage("")
    setStatus("committing")
    const salt = randomSalt()
    const commitment = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }],
        [toBytes32(modelHash), salt, address as `0x${string}`],
      ),
    )
    // Persist BEFORE sending so a crash mid-send doesn't forfeit the salt.
    const rec: CommitRecord = { salt, commitment }
    saveCommit(modelHash, rec)
    setRecord(rec)
    try {
      const hash = await writeContractAsync({
        address: addr,
        abi: modelRegistryAbi,
        functionName: "commit",
        args: [commitment],
        chainId: REGISTRY_CHAIN_ID,
      })
      const updated: CommitRecord = { ...rec, commitTxHash: hash }
      saveCommit(modelHash, updated)
      setRecord(updated)
      setCommitTxHash(hash)
      setStatus("commit_pending")
    } catch (e) {
      setStatus("error")
      setErrorMessage(parseRevertReason(e))
    }
  }, [address, chainId, isConnected, modelHash, writeContractAsync])

  const reveal = useCallback(
    async ({ metadataCID, parentHashes }: RegisterInput) => {
      const addr = registryAddress(chainId ?? REGISTRY_CHAIN_ID)
      const rec = record ?? loadCommit(modelHash)
      if (!addr) {
        setStatus("error")
        setErrorMessage("ModelRegistry is not deployed on this network yet.")
        return
      }
      if (!rec) {
        setStatus("error")
        setErrorMessage("No saved commitment found — start again from Commit.")
        return
      }

      setErrorMessage("")
      setStatus("revealing")
      try {
        const hash = await writeContractAsync({
          address: addr,
          abi: modelRegistryAbi,
          functionName: "reveal",
          args: [toBytes32(modelHash), metadataCID, parentHashes.map(toBytes32), rec.salt],
          chainId: REGISTRY_CHAIN_ID,
        })
        if (typeof window !== "undefined") {
          window.localStorage.setItem(pendingTxKey(modelHash), hash)
        }
        setRevealTxHash(hash)
        setStatus("reveal_pending")
      } catch (e) {
        setStatus("error")
        setErrorMessage(parseRevertReason(e))
      }
    },
    [chainId, modelHash, record, writeContractAsync],
  )

  const reset = useCallback(() => {
    clearCommit(modelHash)
    if (typeof window !== "undefined") window.localStorage.removeItem(pendingTxKey(modelHash))
    setRecord(null)
    setCommitTxHash(undefined)
    setRevealTxHash(undefined)
    setErrorMessage("")
    setStatus("idle")
  }, [modelHash])

  return {
    status,
    errorMessage,
    commit,
    reveal,
    reset,
    commitTxHash,
    revealTxHash,
    revealReceipt: revealReceipt.data as TransactionReceipt | undefined,
    isConnected,
    account: address,
    hasCommit: Boolean(record),
  }
}
