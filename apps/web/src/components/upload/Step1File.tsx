"use client"

import { useEffect, useRef, useState, type Dispatch } from "react"
import { UploadCloudIcon, FileIcon, CheckCircle2Icon, AlertCircleIcon, Loader2Icon, XIcon, PlusIcon } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { hashManifest } from "@/utils/blake3"
import { checkModelHash } from "@/services/api"
import type { WizardState, WizardAction } from "./wizardTypes"

const ACCEPTED_EXTENSIONS = [".safetensors", ".bin", ".pt", ".gguf", ".onnx", ".txt"]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

interface Props {
  state: WizardState
  dispatch: Dispatch<WizardAction>
}

export function Step1File({ state, dispatch }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const addMoreRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  // Trigger hashing whenever files change and status is "hashing"
  useEffect(() => {
    if (!state.files.length || state.hashStatus !== "hashing") return
    let cancelled = false

    hashManifest(state.files, (pct) => {
      if (!cancelled) dispatch({ type: "SET_HASH_PROGRESS", progress: pct })
    })
      .then(({ manifestHash, entries }) => {
        if (!cancelled) dispatch({ type: "SET_HASH_DONE", hash: manifestHash, entries })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "SET_ERROR", message: "Failed to hash files" })
      })

    return () => { cancelled = true }
  }, [state.files, state.hashStatus, dispatch])

  // Check duplicate after hash is done
  useEffect(() => {
    if (state.duplicateStatus !== "checking" || !state.modelHash) return
    let cancelled = false

    checkModelHash(state.modelHash)
      .then(({ exists }) => {
        if (!cancelled)
          dispatch({ type: "SET_DUPLICATE_STATUS", status: exists ? "duplicate" : "ok" })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "SET_DUPLICATE_STATUS", status: "ok" })
      })

    return () => { cancelled = true }
  }, [state.duplicateStatus, state.modelHash, dispatch])

  function handleFiles(incoming: FileList | null) {
    if (!incoming || incoming.length === 0) return
    const next = Array.from(incoming)
    // Merge with existing files, deduplicate by name
    const existing = state.files.filter(
      (f) => !next.some((n) => n.name === f.name)
    )
    dispatch({ type: "SET_FILES", files: [...existing, ...next] })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const isIdle = state.files.length === 0
  const isHashing = state.hashStatus === "hashing"
  const isDuplicate = state.duplicateStatus === "duplicate"
  const isOk = state.hashStatus === "done" && state.duplicateStatus === "ok"
  const isChecking = state.duplicateStatus === "checking"

  const totalSize = state.files.reduce((s, f) => s + f.size, 0)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Upload Model Files</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Select all files that define your model. Each file is hashed locally — nothing leaves your browser until you confirm.
        </p>
      </div>

      {isIdle ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed
            min-h-[280px] cursor-pointer transition-colors select-none
            ${dragging
              ? "border-white/40 bg-white/5"
              : "border-border hover:border-white/20 hover:bg-white/[0.02]"
            }
          `}
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-white/5">
            <UploadCloudIcon className="size-7 text-muted-foreground" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-sm font-medium">Drop your model files here</p>
            <p className="text-xs text-muted-foreground">
              weights · config · tokenizer · or any combination
            </p>
            <p className="text-xs text-muted-foreground/60">
              {ACCEPTED_EXTENSIONS.join("  ·  ")}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px w-12 bg-border" />
            or click to browse
            <span className="h-px w-12 bg-border" />
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card/50 p-5 space-y-4">
          {/* File list */}
          <div className="space-y-2">
            {state.files.map((file, i) => {
              const entry = state.manifestEntries.find((e) => e.name === file.name)
              return (
                <div key={file.name} className="flex items-center gap-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
                    {entry ? (
                      <CheckCircle2Icon className="size-4 text-tx-confirmed" />
                    ) : isHashing ? (
                      <Loader2Icon className="size-4 text-muted-foreground animate-spin" />
                    ) : (
                      <FileIcon className="size-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatBytes(file.size)}</span>
                      {entry && (
                        <span className="font-mono">
                          {entry.hash.slice(0, 10)}…{entry.hash.slice(-6)}
                        </span>
                      )}
                    </div>
                  </div>
                  {!isHashing && !isChecking && (
                    <button
                      onClick={() => dispatch({ type: "REMOVE_FILE", index: i })}
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      type="button"
                      aria-label={`Remove ${file.name}`}
                    >
                      <XIcon className="size-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add more files button */}
          {!isHashing && !isChecking && (
            <button
              onClick={() => addMoreRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              type="button"
            >
              <PlusIcon className="size-3.5" />
              Add more files
            </button>
          )}
          <input
            ref={addMoreRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Hashing progress */}
          {isHashing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2Icon className="size-3 animate-spin" />
                  Computing blake3 hashes…
                </span>
                <span>{state.hashProgress}%</span>
              </div>
              <Progress value={state.hashProgress} className="h-1.5" />
            </div>
          )}

          {/* Duplicate check spinner */}
          {isChecking && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Checking for duplicates…
            </div>
          )}

          {/* Success state */}
          {isOk && (
            <div className="space-y-2 pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-xs text-tx-confirmed">
                <CheckCircle2Icon className="size-3.5" />
                Unique — no duplicate found
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  {state.files.length} {state.files.length === 1 ? "file" : "files"} · {formatBytes(totalSize)} total
                </p>
                <p className="font-mono text-xs text-muted-foreground break-all">
                  manifest: {state.modelHash.slice(0, 16)}…{state.modelHash.slice(-8)}
                </p>
              </div>
            </div>
          )}

          {/* Duplicate state */}
          {isDuplicate && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <AlertCircleIcon className="size-4" />
                This model is already registered
              </div>
              <p className="text-xs text-destructive/80">
                A model with this exact manifest hash exists on Handshake. Upload different files or view the existing model.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
