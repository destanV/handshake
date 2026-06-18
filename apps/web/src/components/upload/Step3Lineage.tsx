"use client"

import { useState, type Dispatch } from "react"
import { PlusIcon, Trash2Icon, GitBranchIcon } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Source, Relationship } from "@handshake/types"
import type { IParentRef } from "@handshake/types"
import { truncateMiddle } from "@/lib/modelDisplay"
import { HandshakeParentPicker } from "./HandshakeParentPicker"
import type { WizardState, WizardAction } from "./wizardTypes"

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  [Relationship.Finetune]: "Fine-tune",
  [Relationship.Adapter]: "Adapter (LoRA / QLoRA)",
  [Relationship.Quantized]: "Quantized",
  [Relationship.Merge]: "Model Merge",
  [Relationship.KnowledgeDistillation]: "Knowledge Distillation",
}

const emptyParent = (): Omit<IParentRef, "source" | "relationship"> & {
  source: Source | ""
  relationship: Relationship | ""
} => ({
  source: "",
  name: "",
  relationship: "",
  handshakeId: "",
  externalId: "",
})

interface Props {
  state: WizardState
  dispatch: Dispatch<WizardAction>
}

export function Step3Lineage({ state, dispatch }: Props) {
  const [form, setForm] = useState(emptyParent())
  const [showForm, setShowForm] = useState(false)
  const selectedHandshakeIds = state.baseModel
    .map((parent) => parent.handshakeId)
    .filter((id): id is string => Boolean(id))
  const addDisabled =
    !form.source ||
    !form.relationship ||
    (form.source === Source.Handshake
      ? !form.handshakeId || !form.name.trim()
      : !form.name.trim())

  function addParent() {
    if (addDisabled) return
    const parent: IParentRef = {
      source: form.source as Source,
      name: form.name.trim(),
      relationship: form.relationship as Relationship,
      ...(form.source === Source.Handshake && form.handshakeId
        ? {
            handshakeId: form.handshakeId.trim(),
            ...(form.modelHash ? { modelHash: form.modelHash.trim() } : {}),
          }
        : {}),
      ...(form.source !== Source.Handshake && form.externalId
        ? { externalId: form.externalId.trim() }
        : {}),
    }
    dispatch({ type: "ADD_PARENT", parent })
    setForm(emptyParent())
    setShowForm(false)
  }

  const isFromScratch = state.lineageType === "from_scratch"

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Model Lineage</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Declaring lineage improves your provenance score and enables audit trails.
        </p>
      </div>

      {/* Toggle */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => dispatch({ type: "SET_LINEAGE_TYPE", lineageType: "from_scratch" })}
          className={`
            rounded-xl border p-4 text-left transition-colors
            ${isFromScratch
              ? "border-white/30 bg-white/5"
              : "border-border hover:border-white/15"
            }
          `}
        >
          <p className="text-sm font-medium">From scratch</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Original training, no parent model
          </p>
        </button>

        <button
          type="button"
          onClick={() => dispatch({ type: "SET_LINEAGE_TYPE", lineageType: "derived" })}
          className={`
            rounded-xl border p-4 text-left transition-colors
            ${!isFromScratch
              ? "border-white/30 bg-white/5"
              : "border-border hover:border-white/15"
            }
          `}
        >
          <p className="text-sm font-medium flex items-center gap-1.5">
            <GitBranchIcon className="size-3.5" />
            Derived from another model
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fine-tune, adapter, quantized, merge…
          </p>
        </button>
      </div>

      {/* Derived section */}
      {!isFromScratch && (
        <div className="space-y-3">
          {/* Existing parents */}
          {state.baseModel.map((parent, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{parent.name}</span>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {RELATIONSHIP_LABELS[parent.relationship]}
                  </Badge>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {parent.source}
                  </Badge>
                </div>
                {(parent.handshakeId || parent.modelHash || parent.externalId) && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {parent.source === Source.Handshake
                      ? truncateMiddle(parent.modelHash ?? parent.handshakeId ?? "", 12, 8)
                      : parent.externalId}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: "REMOVE_PARENT", index: i })}
                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <Trash2Icon className="size-4" />
              </button>
            </div>
          ))}

          {/* Add parent form */}
          {showForm ? (
            <div className="rounded-xl border border-border bg-card/30 p-4 space-y-4">
              <p className="text-sm font-medium">Add parent model</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Source</Label>
                  <Select
                    value={form.source}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        source: v as Source,
                        name: "",
                        handshakeId: "",
                        modelHash: "",
                        externalId: "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Source…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={Source.Handshake}>Handshake</SelectItem>
                      <SelectItem value={Source.HuggingFace}>Hugging Face</SelectItem>
                      <SelectItem value={Source.Other}>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Relationship</Label>
                  <Select
                    value={form.relationship}
                    onValueChange={(v) => setForm({ ...form, relationship: v as Relationship })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Type…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(Relationship).map((r) => (
                        <SelectItem key={r} value={r}>
                          {RELATIONSHIP_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.source === Source.Handshake && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Handshake model</Label>
                  <HandshakeParentPicker
                    selectedModelId={form.handshakeId}
                    excludedIds={selectedHandshakeIds}
                    onSelect={(model) =>
                      setForm({
                        ...form,
                        name: model.name,
                        handshakeId: model._id,
                        modelHash: model.modelHash,
                        externalId: "",
                      })
                    }
                  />
                </div>
              )}

              {form.source && form.source !== Source.Handshake && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Model name</Label>
                    <Input
                      placeholder="e.g. meta-llama/Meta-Llama-3-8B"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      {form.source === Source.HuggingFace ? "HF repo ID" : "External URL / ID"} (optional)
                    </Label>
                    <Input
                      placeholder={
                        form.source === Source.HuggingFace
                          ? "org/model-name"
                          : "https://..."
                      }
                      value={form.externalId}
                      onChange={(e) => setForm({ ...form, externalId: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setForm(emptyParent()); setShowForm(false) }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={addParent}
                  disabled={addDisabled}
                >
                  Add
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForm(true)}
              className="w-full border-dashed"
            >
              <PlusIcon className="size-4 mr-1.5" />
              Add parent model
            </Button>
          )}

          {state.baseModel.length === 0 && !showForm && (
            <p className="text-xs text-muted-foreground text-center py-1">
              No parents added — you can still proceed, but provenance score will be lower.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
