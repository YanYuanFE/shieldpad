import { Shield } from "lucide-react"
import { cn, getShieldBgColor, getShieldLabel } from "@/lib/utils"

interface ShieldBadgeProps {
  score: number
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
}

export function ShieldBadge({ score, size = "md", showLabel = true }: ShieldBadgeProps) {
  const sizeClasses = {
    sm: "h-5 gap-1 px-1.5 text-[10px]",
    md: "h-6 gap-1.5 px-2 text-xs",
    lg: "h-7 gap-1.5 px-2.5 text-sm",
  }

  const iconSizes = {
    sm: "size-2.5",
    md: "size-3",
    lg: "size-3.5",
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-semibold",
        getShieldBgColor(score),
        sizeClasses[size]
      )}
    >
      <Shield className={iconSizes[size]} />
      <span className="tabular-nums">{score}</span>
      {showLabel && <span className="font-normal opacity-80">{getShieldLabel(score)}</span>}
    </span>
  )
}
