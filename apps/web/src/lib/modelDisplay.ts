import { BadgeLevel } from "@handshake/types"

export function truncateMiddle(value: string, start = 10, end = 6) {
  if (value.length <= start + end + 1) return value
  return `${value.slice(0, start)}…${value.slice(-end)}`
}

export function formatBytes(value?: number) {
  if (!value || value <= 0) return ""
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`
}

export function badgeLevelClass(level: BadgeLevel | null | undefined) {
  const map: Record<BadgeLevel, string> = {
    [BadgeLevel.Bronze]: "text-badge-bronze border-badge-bronze/35 bg-badge-bronze/10",
    [BadgeLevel.Silver]: "text-badge-silver border-badge-silver/35 bg-badge-silver/10",
    [BadgeLevel.Gold]: "text-badge-gold border-badge-gold/35 bg-badge-gold/10",
    [BadgeLevel.Platinum]:
      "text-badge-platinum border-badge-platinum/35 bg-badge-platinum/10",
  }
  return level ? map[level] : "text-muted-foreground border-border bg-muted/30"
}

export function badgeLevelLabel(level: BadgeLevel | null | undefined) {
  if (!level) return "Unranked"
  return level.charAt(0).toUpperCase() + level.slice(1)
}
