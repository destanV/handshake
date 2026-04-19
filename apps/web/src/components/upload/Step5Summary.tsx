"use client"

import type { Dispatch } from "react"
import Link from "next/link"
import {
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  AlertCircleIcon,
  ExternalLinkIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { useWizardUpload } from "./useWizardUpload"
import type { WizardState, WizardAction } from "./wizardTypes"

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

interface ProvenanceCheck {
  label: string
  met: boolean
}

function calcProvenance(state: WizardState) {
  const silver: ProvenanceCheck[] = [
    { label: "Lineage declared", met: state.lineageType === "derived" && state.baseModel.length > 0 },
    { label: "Description ≥ 50 chars", met: state.description.length >= 50 },
    { label: "At least 1 dataset", met: state.trainingData.datasets.length > 0 },
  ]
  const gold: ProvenanceCheck[] = [
    { label: "Benchmark results", met: state.evaluation.benchmarks.length > 0 },
    { label: "Intended use (EU AI Act)", met: state.intendedUse.trim().length > 0 },
    { label: "Language(s) declared", met: state.languages.length > 0 },
  ]
  return { silver, gold }
}

function CheckRow({ label, met }: ProvenanceCheck) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met ? (
        <CheckCircle2Icon className="size-3.5 text-tx-confirmed shrink-0" />
      ) : (
        <CircleIcon className="size-3.5 text-muted-foreground/40 shrink-0" />
      )}
      <span className={met ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  )
}

interface Props {
  state: WizardState
  dispatch: Dispatch<WizardAction>
}

export function Step5Summary({ state, dispatch }: Props) {
  const { uploadModel } = useWizardUpload(state, dispatch)
  const { silver, gold } = calcProvenance(state)

  const isUploading =
    state.uploadStatus === "getting_url" ||
    state.uploadStatus === "uploading_file" ||
    state.uploadStatus === "submitting"

  if (state.uploadStatus === "success") {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-tx-confirmed/10">
          <CheckCircle2Icon className="size-8 text-tx-confirmed" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold">Model registered</p>
          <p className="text-sm text-muted-foreground">
            Your model has been hashed, uploaded to IPFS, and saved to the registry.
          </p>
        </div>
        <div className="flex gap-3">
          <Button asChild>
            <Link href={`/registry/${state.createdModelId}`}>
              View model
              <ExternalLinkIcon className="size-3.5 ml-1.5" />
            </Link>
          </Button>
          <Button variant="outline" onClick={() => dispatch({ type: "RESET" })}>
            Upload another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Review & Confirm</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Check your submission before uploading.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left — Summary cards */}
        <div className="space-y-3">
          {/* Identity */}
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Identity</p>
            <p className="font-medium">{state.name} <span className="text-muted-foreground font-normal text-xs">v{state.version}</span></p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs">{state.task}</Badge>
              <Badge variant="outline" className="text-xs">{state.framework}</Badge>
              <Badge variant="outline" className="text-xs font-mono">{state.license}</Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{state.description}</p>
          </div>

          {/* File */}
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {state.files.length === 1 ? "File" : `Files (${state.files.length})`}
            </p>
            {state.files.map((f) => (
              <p key={f.name} className="text-sm font-medium truncate">{f.name}</p>
            ))}
            <p className="text-xs text-muted-foreground">
              {formatBytes(state.files.reduce((s, f) => s + f.size, 0))} total
            </p>
            <p className="font-mono text-xs text-muted-foreground break-all">
              manifest: {state.modelHash.slice(0, 20)}…{state.modelHash.slice(-8)}
            </p>
          </div>

          {/* Lineage */}
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lineage</p>
            {state.lineageType === "from_scratch" ? (
              <p className="text-sm text-muted-foreground">Trained from scratch</p>
            ) : state.baseModel.length === 0 ? (
              <p className="text-sm text-muted-foreground">Derived — no parents specified</p>
            ) : (
              <div className="space-y-1">
                {state.baseModel.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm">{p.name}</span>
                    <Badge variant="secondary" className="text-xs">{p.relationship}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional filled */}
          {(state.tags.length > 0 || state.modelType || state.languages.length > 0 || state.trainingData.datasets.length > 0) && (
            <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Enriched</p>
              <div className="flex flex-wrap gap-1">
                {state.tags.map((t) => <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>)}
              </div>
              {state.modelType && <p className="text-xs text-muted-foreground">Architecture: {state.modelType}{state.parameters ? ` · ${state.parameters}` : ""}</p>}
              {state.trainingData.datasets.length > 0 && (
                <p className="text-xs text-muted-foreground">{state.trainingData.datasets.length} dataset(s) declared</p>
              )}
              {state.languages.length > 0 && (
                <p className="text-xs text-muted-foreground">Languages: {state.languages.join(", ")}</p>
              )}
            </div>
          )}
        </div>

        {/* Right — Provenance score */}
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provenance Score Preview</p>

          <div className="space-y-3">
            {/* Bronze */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-badge-bronze">Bronze</span>
                <span className="text-xs text-muted-foreground">— after on-chain registration</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground pl-1">
                <CheckCircle2Icon className="size-3.5 text-tx-confirmed shrink-0" />
                <span>File hash + license provided ✓</span>
              </div>
            </div>

            {/* Silver */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-badge-silver">Silver</p>
              <div className="space-y-1 pl-1">
                {silver.map((c) => <CheckRow key={c.label} {...c} />)}
              </div>
            </div>

            {/* Gold */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-badge-gold">Gold</p>
              <div className="space-y-1 pl-1">
                {gold.map((c) => <CheckRow key={c.label} {...c} />)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload progress */}
      {isUploading && (
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin shrink-0" />
            <span>
              {state.uploadStatus === "getting_url" && "Preparing upload…"}
              {state.uploadStatus === "uploading_file" && `Uploading to IPFS… ${state.uploadProgress}%`}
              {state.uploadStatus === "submitting" && "Registering model…"}
            </span>
          </div>
          {state.uploadStatus === "uploading_file" && (
            <Progress value={state.uploadProgress} className="h-1.5" />
          )}
        </div>
      )}

      {/* Error */}
      {state.uploadStatus === "error" && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircleIcon className="size-4" />
            Upload failed
          </div>
          <p className="text-xs text-destructive/80">{state.errorMessage}</p>
        </div>
      )}

      {/* Confirm button */}
      <div className="flex justify-end gap-3">
        {state.uploadStatus === "error" && (
          <Button
            variant="outline"
            onClick={() => dispatch({ type: "SET_UPLOAD_STATUS", status: "idle" })}
          >
            Try again
          </Button>
        )}
        <Button
          size="lg"
          onClick={uploadModel}
          disabled={isUploading}
          className="min-w-[160px]"
        >
          {isUploading ? (
            <><Loader2Icon className="size-4 mr-2 animate-spin" />Uploading…</>
          ) : (
            "Confirm & Upload"
          )}
        </Button>
      </div>
    </div>
  )
}
