"use client"

import { use } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ProvenanceBadge } from "@/components/registry/ProvenanceBadge"
import { useModel } from "@/hooks/useModels"
import { formatBytes, truncateMiddle } from "@/lib/modelDisplay"
import { ExternalLinkIcon, CheckCircle2Icon, CircleIcon } from "lucide-react"
import type { IBenchmark, IDataset, IModel, IProvenanceCheck } from "@handshake/types"
import { OnChainProof } from "@/components/registry/OnChainProof"

function truncateAddress(addr: string) {
  return truncateMiddle(addr, 6, 4)
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function formatDate(value: Date | string | undefined) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString()
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium break-words">{value}</span>
    </div>
  )
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function IpfsLink({ cid }: { cid: string }) {
  return (
    <a
      href={`https://ipfs.io/ipfs/${cid}`}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1 break-all"
    >
      {cid}
      <ExternalLinkIcon className="size-3 shrink-0" />
    </a>
  )
}

function ProvenanceChecks({ checks }: { checks?: IProvenanceCheck[] }) {
  if (!checks?.length) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {checks.map((check) => (
        <div key={check.id} className="flex items-center gap-2 text-xs">
          {check.met ? (
            <CheckCircle2Icon className="size-3.5 text-tx-confirmed" />
          ) : (
            <CircleIcon className="size-3.5 text-muted-foreground/60" />
          )}
          <span className={check.met ? "text-foreground" : "text-muted-foreground"}>
            {check.label}
          </span>
          <Badge variant="outline" className="ml-auto text-[10px] capitalize">
            {check.tier}
          </Badge>
        </div>
      ))}
    </div>
  )
}

function DatasetRows({ datasets }: { datasets?: IDataset[] }) {
  if (!datasets?.length) return null
  return (
    <div className="space-y-2">
      {datasets.map((dataset, index) => (
        <div key={`${dataset.name}-${index}`} className="rounded-md border p-3 text-sm">
          <div className="font-medium">{dataset.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {dataset.sourceId && <span>Source: {dataset.sourceId}</span>}
            {dataset.license && <span>License: {dataset.license}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function BenchmarkRows({ benchmarks }: { benchmarks?: IBenchmark[] }) {
  if (!benchmarks?.length) return null
  return (
    <div className="space-y-2">
      {benchmarks.map((benchmark, index) => (
        <div key={`${benchmark.name}-${index}`} className="rounded-md border p-3 text-sm">
          <div className="font-medium">{benchmark.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {benchmark.score != null && <span>Score: {benchmark.score}</span>}
            {benchmark.metric && <span>Metric: {benchmark.metric}</span>}
            {benchmark.date && <span>Date: {benchmark.date}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function hasTrainingData(model: IModel) {
  return (
    hasText(model.trainingData?.summary) ||
    Boolean(model.trainingData?.datasets?.length) ||
    hasText(model.trainingData?.privacyMeasures)
  )
}

function hasEvaluation(model: IModel) {
  return Boolean(model.evaluation?.benchmarks?.length) || hasText(model.evaluation?.limitations)
}

export default function ModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { data: model, isLoading, isError } = useModel(id)

  if (isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Model not found or API unavailable.
        </div>
      </div>
    )
  }

  if (isLoading || !model) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-lg" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const size = formatBytes(model.size)
  const createdAt = formatDate(model.createdAt)
  const updatedAt = formatDate(model.updatedAt)

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight break-words">{model.name}</h1>
              <Badge variant="secondary">v{model.version}</Badge>
              <ProvenanceBadge level={model.badgeLevel} score={model.provenanceScore} />
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              Owner: {truncateAddress(model.ownerAddress)}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              model.onChainRegistered
                ? "border-tx-confirmed/30 bg-tx-confirmed/10 text-tx-confirmed"
                : "border-border text-muted-foreground"
            }
          >
            {model.onChainRegistered ? "On-chain" : "Off-chain"}
          </Badge>
        </div>

        {model.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{model.description}</p>
        )}
      </div>

      <Separator />

      <Section title="Identity">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <DetailRow label="Model ID" value={<span className="font-mono text-xs">{model._id}</span>} />
          <DetailRow label="Task" value={<Badge variant="secondary">{model.task}</Badge>} />
          <DetailRow label="Framework" value={<Badge variant="outline">{model.framework}</Badge>} />
          <DetailRow label="License" value={<span className="font-mono text-xs">{model.license}</span>} />
          {size && <DetailRow label="Size" value={size} />}
          {model.modelType && <DetailRow label="Model type" value={model.modelType} />}
          {model.parameters && <DetailRow label="Parameters" value={model.parameters} />}
          {model.contextLength && <DetailRow label="Context length" value={model.contextLength} />}
          {model.quantization && <DetailRow label="Quantization" value={model.quantization} />}
          {createdAt && <DetailRow label="Created" value={createdAt} />}
          {updatedAt && <DetailRow label="Updated" value={updatedAt} />}
        </div>
      </Section>

      <Section title="Provenance">
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <DetailRow
              label="Badge"
              value={<ProvenanceBadge level={model.badgeLevel} score={model.provenanceScore} />}
            />
            <DetailRow label="Score" value={model.provenanceScore ?? 0} />
            <DetailRow label="Owner" value={<span className="font-mono text-xs">{model.ownerAddress}</span>} />
            <DetailRow label="On-chain" value={model.onChainRegistered ? "Registered" : "Not registered"} />
          </div>
          <ProvenanceChecks checks={model.provenanceChecks} />
        </div>
      </Section>

      <Section title="Storage">
        <div className="space-y-4">
          <DetailRow
            label="Model hash (BLAKE3 manifest)"
            value={<span className="font-mono text-xs break-all text-muted-foreground">{model.modelHash}</span>}
          />
          <DetailRow label="Model file CID" value={<IpfsLink cid={model.modelFileCid} />} />
          <DetailRow label="Metadata CID" value={<IpfsLink cid={model.metadataCid} />} />
        </div>
      </Section>

      {/* On-chain proof / register CTA */}
      <OnChainProof model={model} />

      {/* Lineage */}
      {model.baseModel && model.baseModel.length > 0 && (
        <Section title="Lineage">
          <div className="space-y-2">
            {model.baseModel.map((parent, i) => (
              <div key={i} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">{parent.relationship}</Badge>
                  <Badge variant="secondary" className="text-xs">{parent.source}</Badge>
                  <span className="font-medium">{parent.name}</span>
                  {parent.source === "handshake" && parent.handshakeId && (
                    <Link href={`/registry/${parent.handshakeId}`} className="text-xs text-primary hover:underline">
                      View
                    </Link>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {parent.handshakeId && <div className="font-mono break-all">Handshake ID: {parent.handshakeId}</div>}
                  {parent.modelHash && <div className="font-mono break-all">Model hash: {parent.modelHash}</div>}
                  {parent.externalId && <div className="font-mono break-all">External ID: {parent.externalId}</div>}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {hasTrainingData(model) && (
        <Section title="Training Data">
          <div className="space-y-4">
            {model.trainingData?.summary && <DetailRow label="Summary" value={model.trainingData.summary} />}
            <DatasetRows datasets={model.trainingData?.datasets} />
            {model.trainingData?.privacyMeasures && (
              <DetailRow label="Privacy measures" value={model.trainingData.privacyMeasures} />
            )}
          </div>
        </Section>
      )}

      {hasEvaluation(model) && (
        <Section title="Evaluation">
          <div className="space-y-4">
            <BenchmarkRows benchmarks={model.evaluation?.benchmarks} />
            {model.evaluation?.limitations && <DetailRow label="Limitations" value={model.evaluation.limitations} />}
          </div>
        </Section>
      )}

      {(Boolean(model.tags?.length) || Boolean(model.languages?.length) || model.intendedUse) && (
        <Section title="Tags, Languages & Use">
          <div className="space-y-4">
            {Boolean(model.tags?.length) && (
              <div className="flex flex-wrap gap-1.5">
                {model.tags?.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {Boolean(model.languages?.length) && (
              <DetailRow label="Languages" value={model.languages?.join(", ")} />
            )}
            {model.intendedUse && <DetailRow label="Intended use" value={model.intendedUse} />}
          </div>
        </Section>
      )}
    </div>
  )
}
