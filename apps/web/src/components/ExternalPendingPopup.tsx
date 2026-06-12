"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangleIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { IModel } from "@handshake/types"
import { useAuth } from "@/contexts/AuthContext"
import { fetchPendingExternal } from "@/services/api"

const DISMISSED_KEY = "handshake:dismissed_external_pending"

function getDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]
  } catch {
    return []
  }
}

function dismiss(id: string) {
  const prev = getDismissed()
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...prev, id])]))
}

export function ExternalPendingPopup() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const [pending, setPending] = useState<IModel[]>([])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchPendingExternal()
      .then((stubs) => {
        const dismissed = getDismissed()
        setPending(stubs.filter((s) => !dismissed.includes(s._id)))
      })
      .catch(() => {})
  }, [isAuthenticated])

  if (pending.length === 0) return null

  const stub = pending[0]

  function handleDismiss() {
    dismiss(stub._id)
    setPending((prev) => prev.filter((s) => s._id !== stub._id))
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 rounded-lg border border-amber-400 bg-amber-50 p-4 shadow-lg dark:bg-amber-950">
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            Incomplete on-chain registration
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-200">
            You registered a model directly on-chain but haven&apos;t submitted it to Handshake yet.
            Complete the submission to have it appear in the registry.
          </p>
          <p className="mt-1 font-mono text-xs text-amber-700 dark:text-amber-300 truncate">
            {stub.modelHash}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => router.push(`/complete-registration/${stub._id}`)}
            >
              Complete submission
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Dismiss
            </Button>
          </div>
          {pending.length > 1 && (
            <p className="mt-2 text-xs text-amber-700">
              +{pending.length - 1} more incomplete registration{pending.length > 2 ? "s" : ""}
            </p>
          )}
        </div>
        <button onClick={handleDismiss} className="text-amber-600 hover:text-amber-900">
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
