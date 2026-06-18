"use client"

import { useState } from "react"
import { CheckIcon, Loader2Icon, SearchIcon, XIcon } from "lucide-react"
import type { IModel } from "@handshake/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useModels } from "@/hooks/useModels"
import { badgeLevelClass, badgeLevelLabel, truncateMiddle } from "@/lib/modelDisplay"
import { cn } from "@/lib/utils"

interface Props {
  selectedModelId?: string
  excludedIds: string[]
  onSelect: (model: IModel) => void
}

function matchesQuery(model: IModel, query: string) {
  const value = query.trim().toLowerCase()
  if (!value) return true

  return [
    model.name,
    model.modelHash,
    model.ownerAddress,
    model.task,
    model.framework,
    model.license,
  ]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(value))
}

export function HandshakeParentPicker({ selectedModelId, excludedIds, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const { data, isError, isLoading, refetch } = useModels()
  const excluded = new Set(excludedIds)
  const models = data?.models ?? []
  const selected = models.find((model) => model._id === selectedModelId)
  const filtered = models.filter((model) => matchesQuery(model, query))

  function selectModel(model: IModel) {
    if (excluded.has(model._id)) return
    onSelect(model)
    setOpen(false)
    setQuery("")
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-10 w-full justify-between px-3 py-2 text-left"
        onClick={() => setOpen(true)}
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{selected.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {truncateMiddle(selected.modelHash)}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Select a Handshake model</span>
        )}
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close parent model picker"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="handshake-parent-picker-title"
            className="absolute left-1/2 top-1/2 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg sm:max-w-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 id="handshake-parent-picker-title" className="text-lg font-semibold leading-none">
                  Select parent model
                </h3>
                <p className="text-sm text-muted-foreground">
                  Choose an existing Handshake registry entry as the parent.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close parent model picker"
                onClick={() => setOpen(false)}
              >
                <XIcon className="size-4" />
              </Button>
            </div>

            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, hash, owner, task..."
                className="pl-9"
              />
            </div>

            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
              {isLoading && (
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 animate-spin" />
                  Loading models
                </div>
              )}

              {isError && (
                <div className="flex items-center justify-between gap-3 p-4 text-sm">
                  <span className="text-muted-foreground">Could not load models.</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
                    Retry
                  </Button>
                </div>
              )}

              {!isLoading && !isError && filtered.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No models found
                </div>
              )}

              {!isLoading && !isError && filtered.map((model) => {
                const disabled = excluded.has(model._id)
                const isSelected = model._id === selectedModelId

                return (
                  <button
                    key={model._id}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectModel(model)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border p-3 text-left transition-colors last:border-b-0",
                      disabled ? "cursor-not-allowed opacity-45" : "hover:bg-muted/40",
                      isSelected && "bg-muted/50"
                    )}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{model.name}</span>
                        <Badge variant="outline" className={cn("shrink-0", badgeLevelClass(model.badgeLevel))}>
                          {badgeLevelLabel(model.badgeLevel)}
                        </Badge>
                        {model.onChainRegistered && (
                          <Badge variant="secondary" className="shrink-0">
                            On-chain
                          </Badge>
                        )}
                        {disabled && (
                          <Badge variant="outline" className="shrink-0">
                            Added
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{model.task}</span>
                        <span>{model.framework}</span>
                        <span className="font-mono">{truncateMiddle(model.modelHash, 12, 8)}</span>
                      </div>
                    </div>
                    {isSelected && <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
