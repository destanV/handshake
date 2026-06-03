"use client"

import { use } from "react"
import { useModel } from "@/hooks/useModels"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ShieldCheckIcon, ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { OnChainProof } from "@/components/registry/OnChainProof"

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
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

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">{model.name}</h1>
            <Badge variant="secondary">v{model.version}</Badge>
            {model.onChainRegistered && (
              <Badge className="gap-1 bg-tx-confirmed/20 text-tx-confirmed border-tx-confirmed/30">
                <ShieldCheckIcon className="size-3" />
                Verified
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-mono">
            Owner: {truncateAddress(model.ownerAddress)}
          </p>
        </div>
      </div>

      {model.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{model.description}</p>
      )}

      <Separator />

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Model Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <DetailRow label="Task" value={<Badge variant="secondary">{model.task}</Badge>} />
            <DetailRow label="Framework" value={<Badge variant="outline">{model.framework}</Badge>} />
            <DetailRow label="License" value={model.license} />
            {model.size && <DetailRow label="Size" value={`${model.size} MB`} />}
            {model.parameters && <DetailRow label="Parameters" value={model.parameters} />}
            {model.quantization && <DetailRow label="Quantization" value={model.quantization} />}
          </div>
        </CardContent>
      </Card>

      {/* IPFS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Storage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <DetailRow
            label="Model Hash (blake3)"
            value={
              <span className="font-mono text-xs break-all text-muted-foreground">
                {model.modelHash}
              </span>
            }
          />
          <DetailRow
            label="File CID"
            value={
              <a
                href={`https://ipfs.io/ipfs/${model.modelFileCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
              >
                {model.modelFileCid.slice(0, 20)}…
                <ExternalLinkIcon className="size-3" />
              </a>
            }
          />
        </CardContent>
      </Card>

      {/* On-chain proof / register CTA */}
      <OnChainProof model={model} />

      {/* Lineage */}
      {model.baseModel && model.baseModel.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lineage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {model.baseModel.map((parent, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-xs">{parent.relationship}</Badge>
                  <span className="text-muted-foreground">{parent.source}</span>
                  <span className="font-medium">{parent.name}</span>
                  {parent.source === "handshake" && parent.handshakeId && (
                    <Link
                      href={`/registry/${parent.handshakeId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      {model.tags && model.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {model.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
