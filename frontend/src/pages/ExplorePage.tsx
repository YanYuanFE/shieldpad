import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import {
  Coins,
  BarChart3,
  ArrowRight,
  Sparkles,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ShieldBadge } from "@/components/ShieldBadge"
import type { Token } from "@/lib/mock-data"
import { fetchTokens } from "@/lib/api"
import { formatUSD, getShieldColor } from "@/lib/utils"

export function ExplorePage() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const apiTokens = await fetchTokens()
      if (cancelled) return
      setTokens(apiTokens ?? [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = {
    totalTokens: tokens.length,
    avgShieldScore: tokens.length > 0
      ? Math.round(tokens.reduce((sum, t) => sum + t.shieldScore, 0) / tokens.length)
      : 0,
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Hero */}
      <section className="relative mb-10 overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12">
        <img
          src="/logo-icon.png"
          alt=""
          className="pointer-events-none absolute -right-12 -top-12 size-64 opacity-[0.04] sm:size-80"
        />
        <div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <img src="/logo-icon.png" alt="" className="size-3" />
            Anti-Rug-Pull Launchpad
          </div>
          <h1 className="mb-3 text-3xl font-bold text-balance sm:text-4xl lg:text-5xl">
            Launch Meme Coins.{" "}
            <span className="text-emerald-400">
              Rug-Proof.
            </span>
          </h1>
          <p className="mb-6 max-w-xl text-sm text-muted-foreground text-pretty sm:text-base">
            Every token on ShieldPad is protected by on-chain post-conditions.
            Transparent limits on minting, wallet sizes, and transaction caps --
            enforced by smart contracts, not promises.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/create">
              <Button size="lg" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700">
                <Sparkles className="size-4" />
                Launch a Token
              </Button>
            </Link>
            <a href="#tokens">
              <Button variant="outline" size="lg" className="gap-1.5">
                Explore Tokens
                <ArrowRight className="size-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="mb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-1">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                <Coins className="size-4.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Tokens</p>
                <p className="text-lg font-semibold tabular-nums">{stats.totalTokens}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-1">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                <BarChart3 className="size-4.5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg Shield Score</p>
                <p className={`text-lg font-semibold tabular-nums ${getShieldColor(stats.avgShieldScore)}`}>
                  {stats.avgShieldScore}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="mb-8" />

      {/* Token Grid */}
      <section id="tokens">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">All Tokens</h2>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">{tokens.length} tokens listed</p>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="size-9 rounded-full bg-muted" />
                      <div className="space-y-1.5">
                        <div className="h-4 w-24 rounded bg-muted" />
                        <div className="h-3 w-12 rounded bg-muted" />
                      </div>
                    </div>
                    <div className="h-5 w-14 rounded-full bg-muted" />
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="space-y-1">
                      <div className="h-3 w-10 rounded bg-muted" />
                      <div className="h-3.5 w-16 rounded bg-muted" />
                    </div>
                    <div className="space-y-1">
                      <div className="h-3 w-14 rounded bg-muted" />
                      <div className="h-3.5 w-16 rounded bg-muted" />
                    </div>
                    <div className="space-y-1">
                      <div className="h-3 w-14 rounded bg-muted" />
                      <div className="h-3.5 w-16 rounded bg-muted" />
                    </div>
                    <div className="space-y-1">
                      <div className="h-3 w-10 rounded bg-muted" />
                      <div className="h-3.5 w-12 rounded bg-muted" />
                    </div>
                  </div>
                  <div className="h-7 rounded-md bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tokens.map((token) => (
              <Link key={token.address} to={`/token/${encodeURIComponent(token.address)}`}>
                <Card className="group/token cursor-pointer transition-shadow duration-150 hover:ring-2 hover:ring-emerald-500/30 hover:shadow-md">
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
                          {token.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium leading-tight">{token.name}</p>
                          <p className="text-xs text-muted-foreground">${token.symbol}</p>
                        </div>
                      </div>
                      <ShieldBadge score={token.shieldScore} size="sm" showLabel={false} />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div>
                        <span className="text-muted-foreground">Price</span>
                        <p className="font-medium tabular-nums">
                          {token.price < 0.001
                            ? `$${token.price.toFixed(6)}`
                            : `$${token.price.toFixed(4)}`}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Market Cap</span>
                        <p className="font-medium tabular-nums">{formatUSD(token.marketCap)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-[11px]">
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>Max Wallet: {token.shieldDetails.maxWalletPercent}%</span>
                        <span>Max Tx: {token.shieldDetails.maxTxPercent}%</span>
                      </div>
                      <ArrowRight className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover/token:opacity-100" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
