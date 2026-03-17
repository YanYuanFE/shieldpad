import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSTX(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(2)}M STX`
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(2)}K STX`
  }
  return `${amount.toFixed(2)} STX`
}

export function formatUSD(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(2)}K`
  }
  return `$${amount.toFixed(2)}`
}

export function formatAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function getShieldColor(score: number): string {
  if (score >= 80) return "text-emerald-400"
  if (score >= 60) return "text-yellow-400"
  if (score >= 40) return "text-orange-400"
  return "text-red-400"
}

export function getShieldBgColor(score: number): string {
  if (score >= 80) return "bg-emerald-400/15 text-emerald-400 border-emerald-400/30"
  if (score >= 60) return "bg-yellow-400/15 text-yellow-400 border-yellow-400/30"
  if (score >= 40) return "bg-orange-400/15 text-orange-400 border-orange-400/30"
  return "bg-red-400/15 text-red-400 border-red-400/30"
}

export function getShieldLabel(score: number): string {
  if (score >= 80) return "Safe"
  if (score >= 60) return "Moderate"
  if (score >= 40) return "Caution"
  return "Risky"
}

export function calculateShieldScore(details: {
  noMint: boolean
  creatorPercent: number
  maxTxPercent: number
  maxWalletPercent: number
  lpLocked: boolean
}): number {
  let score = 0
  // Matches on-chain get-shield-score weights (30/25/20/15/10)
  if (details.noMint) score += 30
  if (details.creatorPercent <= 5) score += 25
  if (details.maxTxPercent > 0 && details.maxTxPercent <= 2) score += 20
  if (details.maxWalletPercent > 0 && details.maxWalletPercent <= 10) score += 15
  if (details.lpLocked) score += 10
  return score
}
