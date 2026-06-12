"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2Icon, AlertCircleIcon, CheckCircleIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Task, Framework, License } from "@handshake/types"
import type { IModel, CompleteExternalRegistrationDTO } from "@handshake/types"
import { useAuth } from "@/contexts/AuthContext"
import { fetchModel, prefetchMetadata, completeExternalRegistration } from "@/services/api"
import { hashManifest } from "@/utils/blake3"

type Step = "loading" | "hash" | "metadata" | "submitting" | "done" | "error" | "forbidden"

export default function CompleteRegistrationPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { isAuthenticated, walletAddress } = useAuth()

  const [step, setStep] = useState<Step>("loading")
  const [stub, setStub] = useState<IModel | null>(null)
  const [hashError, setHashError] = useState<string | null>(null)
  const [prefetchFailed, setPrefetchFailed] = useState(false)

  const [form, setForm] = useState<Partial<CompleteExternalRegistrationDTO>>({
    version: "1.0.0",
    tags: [],
    languages: [],
  })

  // Load stub
  useEffect(() => {
    if (!id) return
    fetchModel(id)
      .then((model) => {
        if (model.status !== "external_pending") {
          setStep("error")
          return
        }
        if (
          walletAddress &&
          model.ownerAddress.toLowerCase() !== walletAddress.toLowerCase()
        ) {
          setStep("forbidden")
          return
        }
        setStub(model)

        // Attempt IPFS prefetch to pre-fill form
        prefetchMetadata(model.metadataCid)
          .then((data) => {
            if ("prefetchFailed" in data) {
              setPrefetchFailed(true)
            } else {
              setForm((prev) => ({
                ...prev,
                name: (data.name as string) ?? prev.name,
                description: (data.description as string) ?? prev.description,
                version: (data.version as string) ?? prev.version,
                task: (data.task as Task) ?? prev.task,
                framework: (data.framework as Framework) ?? prev.framework,
                license: (data.license as License) ?? prev.license,
                tags: (data.tags as string[]) ?? prev.tags,
                languages: (data.languages as string[]) ?? prev.languages,
                intendedUse: (data.intendedUse as string) ?? prev.intendedUse,
              }))
            }
          })
          .catch(() => setPrefetchFailed(true))
          .finally(() => setStep("hash"))
      })
      .catch(() => setStep("error"))
  }, [id, walletAddress])

  // File hash verification
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !stub) return
      setHashError(null)

      try {
        const { manifestHash } = await hashManifest([file], () => {})
        if (manifestHash !== stub.modelHash) {
          setHashError(
            `Hash mismatch. Expected: ${stub.modelHash.slice(0, 16)}… — got: ${manifestHash.slice(0, 16)}…\n\nThe file you uploaded doesn't match your on-chain registration. Provide the exact file you registered.`
          )
          return
        }
        setStep("metadata")
      } catch {
        setHashError("Failed to hash the file. Please try again.")
      }
    },
    [stub]
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stub) return

    const dto = form as CompleteExternalRegistrationDTO
    if (!dto.name || !dto.task || !dto.framework || !dto.license || !dto.description) {
      toast.error("Please fill in all required fields.")
      return
    }

    setStep("submitting")
    try {
      await completeExternalRegistration(stub._id, dto)
      setStep("done")
      setTimeout(() => router.push(`/registry/${stub._id}`), 1500)
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to complete registration.")
      setStep("metadata")
    }
  }

  function patch(fields: Partial<CompleteExternalRegistrationDTO>) {
    setForm((prev) => ({ ...prev, ...fields }))
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-lg py-24 text-center text-muted-foreground">
        Sign in to complete your registration.
      </div>
    )
  }

  if (step === "loading") {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (step === "forbidden") {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <AlertCircleIcon className="mx-auto size-10 text-destructive" />
        <p className="mt-4 text-lg font-semibold">Access denied</p>
        <p className="mt-2 text-muted-foreground">
          This registration belongs to a different wallet address.
        </p>
      </div>
    )
  }

  if (step === "error") {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <AlertCircleIcon className="mx-auto size-10 text-destructive" />
        <p className="mt-4 text-lg font-semibold">Registration not found</p>
        <p className="mt-2 text-muted-foreground">
          This model may have already been completed or doesn't exist.
        </p>
        <Button className="mt-6" onClick={() => router.push("/registry")}>
          Go to Registry
        </Button>
      </div>
    )
  }

  if (step === "done") {
    return (
      <div className="mx-auto max-w-lg py-24 text-center">
        <CheckCircleIcon className="mx-auto size-10 text-green-500" />
        <p className="mt-4 text-lg font-semibold">Registration complete!</p>
        <p className="mt-2 text-muted-foreground">Redirecting to your model page…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl py-12 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Complete your on-chain registration</h1>
        <p className="mt-2 text-muted-foreground">
          You registered this model directly on-chain. Upload the file to verify it, then fill in
          the metadata to publish it to the Handshake registry.
        </p>
        <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
          Hash: {stub?.modelHash}
        </p>
      </div>

      {/* Step 1 — file verification */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="font-semibold">1. Verify your model file</h2>
        <p className="text-sm text-muted-foreground">
          Upload the exact file you registered on-chain. We&apos;ll compute its blake3 hash and
          confirm it matches your on-chain record.
        </p>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:border-primary transition-colors">
          <UploadIcon className="size-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Click to select file</span>
          <input type="file" className="hidden" onChange={handleFileChange} />
        </label>

        {hashError && (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive whitespace-pre-wrap">
            <AlertCircleIcon className="mb-1 inline size-4" /> {hashError}
          </div>
        )}

        {step === "metadata" && (
          <p className="text-sm font-medium text-green-600 flex items-center gap-1">
            <CheckCircleIcon className="size-4" /> File verified — hash matches on-chain record.
          </p>
        )}
      </section>

      {/* Step 2 — metadata form */}
      {(step === "metadata" || step === "submitting") && (
        <form onSubmit={handleSubmit} className="rounded-lg border p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">2. Model details</h2>
            {prefetchFailed && (
              <span className="text-xs text-amber-600">
                Could not read on-chain metadata — fill in manually.
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="my-model-v1"
                required
              />
            </div>

            <div>
              <Label>Description * (min 20 chars)</Label>
              <Textarea
                value={form.description ?? ""}
                onChange={(e) => patch({ description: e.target.value })}
                rows={3}
                placeholder="What does this model do?"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Task *</Label>
                <Select
                  value={form.task ?? ""}
                  onValueChange={(v) => patch({ task: v as Task })}
                >
                  <SelectTrigger><SelectValue placeholder="Select task" /></SelectTrigger>
                  <SelectContent>
                    {Object.values(Task).map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Framework *</Label>
                <Select
                  value={form.framework ?? ""}
                  onValueChange={(v) => patch({ framework: v as Framework })}
                >
                  <SelectTrigger><SelectValue placeholder="Select framework" /></SelectTrigger>
                  <SelectContent>
                    {Object.values(Framework).map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>License *</Label>
                <Select
                  value={form.license ?? ""}
                  onValueChange={(v) => patch({ license: v as License })}
                >
                  <SelectTrigger><SelectValue placeholder="Select license" /></SelectTrigger>
                  <SelectContent>
                    {Object.values(License).map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Tags (comma-separated)</Label>
              <Input
                value={form.tags?.join(", ") ?? ""}
                onChange={(e) =>
                  patch({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
                }
                placeholder="llm, legal, turkish"
              />
            </div>

            <div>
              <Label>Languages (comma-separated)</Label>
              <Input
                value={form.languages?.join(", ") ?? ""}
                onChange={(e) =>
                  patch({ languages: e.target.value.split(",").map((l) => l.trim()).filter(Boolean) })
                }
                placeholder="en, tr"
              />
            </div>

            <div>
              <Label>Intended Use</Label>
              <Textarea
                value={form.intendedUse ?? ""}
                onChange={(e) => patch({ intendedUse: e.target.value })}
                rows={2}
                placeholder="Describe the intended use of this model (EU AI Act Annex IV)"
              />
            </div>
          </div>

          {stub?.baseModel && stub.baseModel.length > 0 && (
            <div>
              <Label>Parent models (from on-chain record — read only)</Label>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {stub.baseModel.map((p, i) => (
                  <li key={i} className="font-mono text-xs">{p.modelHash ?? p.name}</li>
                ))}
              </ul>
            </div>
          )}

          <Button type="submit" disabled={step === "submitting"} className="w-full">
            {step === "submitting" ? (
              <><Loader2Icon className="mr-2 size-4 animate-spin" /> Submitting…</>
            ) : (
              "Complete registration"
            )}
          </Button>
        </form>
      )}
    </div>
  )
}
