import { useParams, Link } from "react-router-dom"
import { useState, useEffect, useRef, useCallback } from "react"
import { openContractCall } from "@stacks/connect"
import { Cl, PostConditionMode } from "@stacks/transactions"
import {
  Shield,
  ArrowLeft,
  Users,
  TrendingUp,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  Ban,
  Percent,
  ArrowRight,
  Info,
  Wallet,
  Loader2,
} from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { ShieldBadge } from "@/components/ShieldBadge"
import { useWallet } from "@/hooks/useWallet"
import type { Token } from "@/lib/mock-data"
import { fetchToken, estimateBuy, estimateSell, fetchStxBalance, fetchTokenBalance } from "@/lib/api"
import { formatUSD, formatAddress, cn } from "@/lib/utils"
import { toast } from "sonner"

const AMM_CONTRACT_NAME = "shield-amm"
const DECIMALS = 1_000_000 // 6 decimals for both STX and tokens

export function TokenPage() {
  const { address } = useParams<{ address: string }>()
  const { connected, connect, stxAddress } = useWallet()
  const [buyAmount, setBuyAmount] = useState("")
  const [sellAmount, setSellAmount] = useState("")
  const [token, setToken] = useState<Token | null>(null)
  const [loading, setLoading] = useState(true)
  const [buyEstimateRaw, setBuyEstimateRaw] = useState(0)
  const [sellEstimateRaw, setSellEstimateRaw] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [stxBalance, setStxBalance] = useState<number | null>(null)
  const [tokenBalance, setTokenBalance] = useState<number | null>(null)
  const buyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const decodedAddress = decodeURIComponent(address ?? "")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const apiToken = await fetchToken(decodedAddress)
      if (cancelled) return

      setToken(apiToken)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [decodedAddress])

  // Fetch wallet balances
  useEffect(() => {
    if (!connected || !stxAddress || !decodedAddress) {
      setStxBalance(null)
      setTokenBalance(null)
      return
    }
    let cancelled = false
    async function loadBalances() {
      const [stx, tok] = await Promise.all([
        fetchStxBalance(stxAddress!),
        fetchTokenBalance(decodedAddress, stxAddress!),
      ])
      if (cancelled) return
      setStxBalance(stx)
      setTokenBalance(tok)
    }
    loadBalances()
    return () => { cancelled = true }
  }, [connected, stxAddress, decodedAddress])

  // Debounced buy estimate (amounts in raw chain units)
  const debouncedBuyEstimate = useCallback(
    (value: string) => {
      if (buyTimerRef.current) clearTimeout(buyTimerRef.current)
      const parsed = parseFloat(value)
      if (!value || isNaN(parsed) || parsed <= 0) {
        setBuyEstimateRaw(0)
        return
      }
      buyTimerRef.current = setTimeout(async () => {
        const stxMicro = Math.floor(parsed * DECIMALS)
        const result = await estimateBuy(decodedAddress, stxMicro)
        if (result !== null) {
          setBuyEstimateRaw(result)
        } else if (token) {
          setBuyEstimateRaw(Math.floor((parsed / token.price) * DECIMALS))
        }
      }, 300)
    },
    [decodedAddress, token]
  )

  // Debounced sell estimate (amounts in raw chain units)
  const debouncedSellEstimate = useCallback(
    (value: string) => {
      if (sellTimerRef.current) clearTimeout(sellTimerRef.current)
      const parsed = parseFloat(value)
      if (!value || isNaN(parsed) || parsed <= 0) {
        setSellEstimateRaw(0)
        return
      }
      sellTimerRef.current = setTimeout(async () => {
        const tokenRaw = Math.floor(parsed * DECIMALS)
        const result = await estimateSell(decodedAddress, tokenRaw)
        if (result !== null) {
          setSellEstimateRaw(result)
        } else if (token) {
          setSellEstimateRaw(Math.floor(parsed * token.price * DECIMALS))
        }
      }, 300)
    },
    [decodedAddress, token]
  )

  function handleBuyAmountChange(value: string) {
    setBuyAmount(value)
    debouncedBuyEstimate(value)
  }

  function handleSellAmountChange(value: string) {
    setSellAmount(value)
    debouncedSellEstimate(value)
  }

  function handleBuy() {
    if (!token || submitting) return
    const parsed = parseFloat(buyAmount)
    if (isNaN(parsed) || parsed <= 0) return

    const [tokenAddr, tokenName] = token.address.split(".")
    if (!tokenAddr || !tokenName) return

    const stxMicro = Math.floor(parsed * DECIMALS)
    const minTokensOut = Math.floor(buyEstimateRaw * 0.99) // 1% slippage

    setSubmitting(true)
    openContractCall({
      contractAddress: tokenAddr,
      contractName: AMM_CONTRACT_NAME,
      functionName: "buy",
      functionArgs: [
        Cl.contractPrincipal(tokenAddr, tokenName),
        Cl.uint(stxMicro),
        Cl.uint(minTokensOut > 0 ? minTokensOut : 0),
      ],
      postConditionMode: PostConditionMode.Allow,
      network: "testnet",
      onFinish: (data) => {
        setSubmitting(false)
        setBuyAmount("")
        setBuyEstimateRaw(0)
        toast.success("Buy transaction submitted!", {
          description: `TX: ${data.txId}`,
        })
      },
      onCancel: () => {
        setSubmitting(false)
      },
    })
  }

  function handleSell() {
    if (!token || submitting) return
    const parsed = parseFloat(sellAmount)
    if (isNaN(parsed) || parsed <= 0) return

    const [tokenAddr, tokenName] = token.address.split(".")
    if (!tokenAddr || !tokenName) return

    const tokenRaw = Math.floor(parsed * DECIMALS)
    const minStxOut = Math.floor(sellEstimateRaw * 0.99) // 1% slippage

    setSubmitting(true)
    openContractCall({
      contractAddress: tokenAddr,
      contractName: AMM_CONTRACT_NAME,
      functionName: "sell",
      functionArgs: [
        Cl.contractPrincipal(tokenAddr, tokenName),
        Cl.uint(tokenRaw),
        Cl.uint(minStxOut > 0 ? minStxOut : 0),
      ],
      postConditionMode: PostConditionMode.Allow,
      network: "testnet",
      onFinish: (data) => {
        setSubmitting(false)
        setSellAmount("")
        setSellEstimateRaw(0)
        toast.success("Sell transaction submitted!", {
          description: `TX: ${data.txId}`,
        })
      },
      onCancel: () => {
        setSubmitting(false)
      },
    })
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (buyTimerRef.current) clearTimeout(buyTimerRef.current)
      if (sellTimerRef.current) clearTimeout(sellTimerRef.current)
    }
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 h-4 w-28 rounded bg-muted" />
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-full bg-muted" />
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-muted" />
              <div className="h-3 w-24 rounded bg-muted" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="space-y-1.5 text-right">
              <div className="ml-auto h-3 w-10 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
            </div>
            <Separator orientation="vertical" className="h-8" />
            <div className="space-y-1.5 text-right">
              <div className="ml-auto h-3 w-14 rounded bg-muted" />
              <div className="h-4 w-16 rounded bg-muted" />
            </div>
          </div>
        </section>
        <div className="grid gap-6 lg:grid-cols-[1fr,380px]">
          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted" />
                ))}
              </CardContent>
            </Card>
          </div>
          <div>
            <Card>
              <CardContent className="space-y-4">
                <div className="h-8 rounded bg-muted" />
                <div className="h-32 rounded bg-muted" />
                <div className="h-10 rounded bg-muted" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <Shield className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">Token Not Found</h2>
        <p className="mb-6 text-sm text-pretty text-muted-foreground">
          The token you are looking for does not exist or has been removed.
        </p>
        <Link to="/">
          <Button variant="outline" className="gap-1.5">
            <ArrowLeft className="size-4" />
            Back to Explore
          </Button>
        </Link>
      </div>
    )
  }

  // Display estimates converted from raw chain units to human-readable
  const displayBuyEstimate =
    buyEstimateRaw > 0
      ? (buyEstimateRaw / DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 2 })
      : buyAmount
        ? Number((parseFloat(buyAmount) / token.price).toFixed(2)).toLocaleString()
        : "0"
  const displaySellEstimate =
    sellEstimateRaw > 0
      ? (sellEstimateRaw / DECIMALS).toFixed(6)
      : sellAmount
        ? (parseFloat(sellAmount) * token.price).toFixed(6)
        : "0"

  const bondingCurvePrice = token.price
  const bondingCurvePercent = Math.min(
    ((token.marketCap / 5_000_000) * 100),
    100
  ).toFixed(1)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Back Link */}
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        Back to Explore
      </Link>

      {/* Token Header */}
      <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-lg font-bold">
            {token.symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-balance">{token.name}</h1>
              <ShieldBadge score={token.shieldScore} size="md" />
            </div>
            <p className="text-xs text-muted-foreground">
              ${token.symbol} &middot;{" "}
              <a
                href={`https://explorer.hiro.so/txid/${token.address}?chain=testnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                {formatAddress(token.address)}
                <ExternalLink className="size-2.5" />
              </a>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="tabular-nums font-semibold">
              {token.price < 0.001 ? token.price.toFixed(6) : token.price.toFixed(4)} STX
            </p>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Market Cap</p>
            <p className="tabular-nums font-semibold">{formatUSD(token.marketCap)}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr,380px]">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Shield Score Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-4 text-emerald-400" />
                Shield Score Breakdown
              </CardTitle>
              <CardDescription className="text-pretty">
                Each factor contributes to the overall safety score
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <ShieldFactor
                  icon={<Ban className="size-4" />}
                  label="No Additional Minting"
                  description="Token supply is fixed and cannot be inflated"
                  enabled={token.shieldDetails.noMint}
                  points={30}
                  earned={token.shieldDetails.noMint ? 30 : 0}
                />
                <ShieldFactor
                  icon={<Users className="size-4" />}
                  label={`Creator Allocation: ${token.shieldDetails.creatorPercent}%`}
                  description="Lower creator allocation means less concentration risk"
                  enabled={token.shieldDetails.creatorPercent <= 5}
                  points={25}
                  earned={token.shieldDetails.creatorPercent <= 5 ? 25 : 0}
                />
                <ShieldFactor
                  icon={<ArrowRight className="size-4" />}
                  label={`Max Transaction: ${token.shieldDetails.maxTxPercent}%`}
                  description="Limits the size of individual transactions"
                  enabled={token.shieldDetails.maxTxPercent > 0 && token.shieldDetails.maxTxPercent <= 2}
                  points={20}
                  earned={token.shieldDetails.maxTxPercent > 0 && token.shieldDetails.maxTxPercent <= 2 ? 20 : 0}
                />
                <ShieldFactor
                  icon={<Percent className="size-4" />}
                  label={`Max Wallet: ${token.shieldDetails.maxWalletPercent}%`}
                  description="Limits how much any single wallet can hold"
                  enabled={token.shieldDetails.maxWalletPercent > 0 && token.shieldDetails.maxWalletPercent <= 10}
                  points={15}
                  earned={token.shieldDetails.maxWalletPercent > 0 && token.shieldDetails.maxWalletPercent <= 10 ? 15 : 0}
                />
                <ShieldFactor
                  icon={<Lock className="size-4" />}
                  label="Liquidity Pool Locked"
                  description="LP tokens are locked, preventing rug pulls"
                  enabled={token.shieldDetails.lpLocked}
                  points={10}
                  earned={token.shieldDetails.lpLocked ? 10 : 0}
                />
              </div>
            </CardContent>
          </Card>

          {/* Bonding Curve */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4 text-blue-400" />
                Bonding Curve
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current Price</span>
                <span className="tabular-nums font-medium">
                  {bondingCurvePrice < 0.001 ? bondingCurvePrice.toFixed(6) : bondingCurvePrice.toFixed(4)} STX
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progress to DEX listing</span>
                  <span className="tabular-nums">{bondingCurvePercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${bondingCurvePercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  When market cap reaches $5M, liquidity migrates to a DEX
                </p>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Column - Trade Panel */}
        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle>Trade</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="buy">
                <TabsList className="w-full">
                  <TabsTrigger value="buy" className="flex-1">
                    Buy
                  </TabsTrigger>
                  <TabsTrigger value="sell" className="flex-1">
                    Sell
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="buy" className="mt-4 space-y-4">
                  {connected && stxBalance !== null && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                      <span className="text-muted-foreground">Balance</span>
                      <span className="tabular-nums font-medium">{stxBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} STX</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-xs">You Pay (STX)</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={buyAmount}
                      onChange={(e) => handleBuyAmountChange(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="flex size-7 items-center justify-center rounded-full bg-muted">
                      <ArrowRight className="size-3.5 rotate-90 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">You Receive (${token.symbol})</Label>
                    <div className="flex h-8 items-center rounded-lg border border-input bg-muted/30 px-2.5 text-sm tabular-nums text-muted-foreground">
                      {displayBuyEstimate}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Price per token</span>
                      <span className="tabular-nums">
                        {token.price < 0.001 ? token.price.toFixed(6) : token.price.toFixed(4)} STX
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max per transaction</span>
                      <span className="tabular-nums">
                        {(token.totalSupply * token.shieldDetails.maxTxPercent / 100).toLocaleString()} {token.symbol}
                      </span>
                    </div>
                  </div>

                  {connected ? (
                    <Button
                      className="w-full gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                      size="lg"
                      disabled={!buyAmount || parseFloat(buyAmount) <= 0 || submitting}
                      onClick={handleBuy}
                    >
                      {submitting ? (
                        <><Loader2 className="size-4 animate-spin" />Submitting...</>
                      ) : (
                        "Buy with STX"
                      )}
                    </Button>
                  ) : (
                    <Button
                      className="w-full gap-1.5"
                      size="lg"
                      variant="outline"
                      onClick={connect}
                    >
                      <Wallet className="size-4" />
                      Connect Wallet
                    </Button>
                  )}
                </TabsContent>

                <TabsContent value="sell" className="mt-4 space-y-4">
                  {connected && tokenBalance !== null && (
                    <div className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                      <span className="text-muted-foreground">Balance</span>
                      <span className="tabular-nums font-medium">{tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} {token.symbol}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-xs">You Sell (${token.symbol})</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={sellAmount}
                      onChange={(e) => handleSellAmountChange(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="flex size-7 items-center justify-center rounded-full bg-muted">
                      <ArrowRight className="size-3.5 rotate-90 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">You Receive (STX)</Label>
                    <div className="flex h-8 items-center rounded-lg border border-input bg-muted/30 px-2.5 text-sm tabular-nums text-muted-foreground">
                      {displaySellEstimate}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Price per token</span>
                      <span className="tabular-nums">
                        {token.price < 0.001 ? token.price.toFixed(6) : token.price.toFixed(4)} STX
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max per transaction</span>
                      <span className="tabular-nums">
                        {(token.totalSupply * token.shieldDetails.maxTxPercent / 100).toLocaleString()} {token.symbol}
                      </span>
                    </div>
                  </div>

                  {connected ? (
                    <Button
                      className="w-full gap-1.5"
                      size="lg"
                      variant="destructive"
                      disabled={!sellAmount || parseFloat(sellAmount) <= 0 || submitting}
                      onClick={handleSell}
                    >
                      {submitting ? (
                        <><Loader2 className="size-4 animate-spin" />Submitting...</>
                      ) : (
                        "Sell"
                      )}
                    </Button>
                  ) : (
                    <Button
                      className="w-full gap-1.5"
                      size="lg"
                      variant="outline"
                      onClick={connect}
                    >
                      <Wallet className="size-4" />
                      Connect Wallet
                    </Button>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Post-Conditions Visualization */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Info className="size-3.5 text-emerald-400" />
                Wallet Post-Conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-emerald-300/80">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                <span>
                  Your wallet will enforce that no more than{" "}
                  <strong className="text-emerald-300">
                    {(token.totalSupply * token.shieldDetails.maxTxPercent / 100).toLocaleString()} {token.symbol}
                  </strong>{" "}
                  can be transferred per transaction
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                <span>
                  Your balance cannot exceed{" "}
                  <strong className="text-emerald-300">
                    {(token.totalSupply * token.shieldDetails.maxWalletPercent / 100).toLocaleString()} {token.symbol}
                  </strong>{" "}
                  ({token.shieldDetails.maxWalletPercent}% of supply)
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                <span>
                  These conditions are verified on-chain before every transaction is confirmed
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ShieldFactor({
  icon,
  label,
  description,
  points,
  earned,
}: {
  icon: React.ReactNode
  label: string
  description: string
  enabled: boolean
  points: number
  earned: number
}) {
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-lg border p-3 transition-colors",
      earned === points
        ? "border-emerald-500/20 bg-emerald-500/5"
        : earned > 0
          ? "border-yellow-500/20 bg-yellow-500/5"
          : "border-red-500/20 bg-red-500/5"
    )}>
      <div className={cn(
        "mt-0.5",
        earned === points
          ? "text-emerald-400"
          : earned > 0
            ? "text-yellow-400"
            : "text-red-400"
      )}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{label}</p>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "text-xs tabular-nums font-semibold",
              earned === points
                ? "text-emerald-400"
                : earned > 0
                  ? "text-yellow-400"
                  : "text-red-400"
            )}>
              {earned}/{points}
            </span>
            {earned === points ? (
              <CheckCircle2 className="size-3.5 text-emerald-400" />
            ) : (
              <XCircle className="size-3.5 text-red-400" />
            )}
          </div>
        </div>
        <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
