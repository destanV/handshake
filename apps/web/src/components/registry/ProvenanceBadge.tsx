"use client"

import { AwardIcon } from "lucide-react"
import type { BadgeLevel } from "@handshake/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { badgeLevelClass, badgeLevelLabel } from "@/lib/modelDisplay"

export function ProvenanceBadge({
  level,
  score,
  className,
}: {
  level?: BadgeLevel | null
  score?: number
  className?: string
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap border px-2 py-0.5", badgeLevelClass(level), className)}
    >
      <AwardIcon className="size-3" />
      {badgeLevelLabel(level)}
      {typeof score === "number" && <span className="font-mono text-[10px] opacity-80">{score}</span>}
    </Badge>
  )
}
