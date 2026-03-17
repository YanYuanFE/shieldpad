import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Shield,
  Info,
  Rocket,
  Lock,
  Ban,
  Percent,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Coins,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ShieldBadge } from "@/components/ShieldBadge"
import { useWallet } from "@/hooks/useWallet"
import { calculateShieldScore, cn, getShieldColor } from "@/lib/utils"
import { createToken } from "@/lib/api"
import { toast } from "sonner"

const LP_LOCK_OPTIONS = [
  { value: "1w", label: "1 Week" },
  { value: "1m", label: "1 Month" },
  { value: "3m", label: "3 Months" },
  { value: "6m", label: "6 Months" },
]

const LP_LOCK_BLOCKS: Record<string, number> = {
  "1w": 1008,
  "1m": 4320,
  "3m": 12960,
  "6m": 25920,
}

export function CreatePage() {
  const { connected, connect } = useWallet()
  const navigate = useNavigate()

  const [tokenName, setTokenName] = useState("")
  const [tokenSymbol, setTokenSymbol] = useState("")
  const [totalSupply, setTotalSupply] = useState("1000000000")
  const [imageUrl, setImageUrl] = useState("")
  const [maxWalletPercent, setMaxWalletPercent] = useState(5)
  const [maxTxPercent, setMaxTxPercent] = useState(1)
  const [poolPercent, setPoolPercent] = useState(80)
  const [lpLockDuration, setLpLockDuration] = useState("3m")
  const [creating, setCreating] = useState(false)

  const shieldDetails = useMemo(
    () => ({
      noMint: true,
      creatorPercent: 100 - poolPercent,
      maxTxPercent,
      maxWalletPercent,
      lpLocked: true,
    }),
    [maxTxPercent, maxWalletPercent, poolPercent]
  )

  const shieldScore = useMemo(
    () => calculateShieldScore(shieldDetails),
    [shieldDetails]
  )

  const isFormValid = tokenName.trim() !== "" && tokenSymbol.trim() !== ""

  async function handleLaunch() {
    if (!isFormValid || creating) return

    setCreating(true)
    const result = await createToken({
      name: tokenName.trim(),
      symbol: tokenSymbol.trim(),
      maxWalletPercent: Math.round(maxWalletPercent * 100), // % to basis points
      maxTxPercent: Math.round(maxTxPercent * 100), // % to basis points
      lpLockBlocks: LP_LOCK_BLOCKS[lpLockDuration] ?? 12960,
      poolPercent,
    })
    setCreating(false)

    if (result) {
      toast.success("Token created", {
        description: `TX: ${result.txId}`,
      })
      navigate(`/token/${encodeURIComponent(result.contractAddress)}`)
    } else {
      toast.error("Failed to create token", {
        description: "The backend may be unavailable. Please try again later.",
      })
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-balance sm:text-3xl">Create Token</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Launch a rug-proof meme coin with on-chain protections
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        {/* Main Form */}
        <div className="space-y-6">
          {/* Token Info */}
          <Card>
            <CardHeader>
              <CardTitle>Token Information</CardTitle>
              <CardDescription>Basic details about your meme coin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Token Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g. Bitcoin Doge"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol</Label>
                  <Input
                    id="symbol"
                    placeholder="e.g. BTCD"
                    value={tokenSymbol}
                    onChange={(e) => setTokenSymbol(e.target.value.toUpperCase())}
                    maxLength={10}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="supply">Total Supply</Label>
                <Input
                  id="supply"
                  type="text"
                  value={Number(totalSupply).toLocaleString()}
                  onChange={(e) =>
                    setTotalSupply(e.target.value.replace(/[^0-9]/g, ""))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Default is 1,000,000,000 (1 billion tokens)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="image">Image URL (optional)</Label>
                <Input
                  id="image"
                  placeholder="https://example.com/token-image.png"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Shield Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="size-4 text-emerald-400" />
                Shield Configuration
              </CardTitle>
              <CardDescription>
                Set on-chain protections enforced by smart contracts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Max Wallet */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Percent className="size-3.5 text-muted-foreground" />
                    Max Wallet %
                  </Label>
                  <span className={cn("text-sm font-semibold", getShieldColor(maxWalletPercent <= 3 ? 90 : maxWalletPercent <= 5 ? 70 : 40))}>
                    {maxWalletPercent}%
                  </span>
                </div>
                <Slider
                  value={[maxWalletPercent]}
                  onValueChange={(v) => setMaxWalletPercent(Array.isArray(v) ? v[0] : v)}
                  min={1}
                  max={100}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  No single wallet can hold more than {maxWalletPercent}% of total supply (
                  {(Number(totalSupply) * maxWalletPercent / 100).toLocaleString()} tokens)
                </p>
              </div>

              <Separator />

              {/* Max Transaction */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    Max Transaction %
                  </Label>
                  <span className={cn("text-sm font-semibold", getShieldColor(maxTxPercent <= 1 ? 90 : maxTxPercent <= 2 ? 70 : 40))}>
                    {maxTxPercent}%
                  </span>
                </div>
                <Slider
                  value={[maxTxPercent]}
                  onValueChange={(v) => setMaxTxPercent(Array.isArray(v) ? v[0] : v)}
                  min={1}
                  max={100}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  No single transaction can move more than {maxTxPercent}% of total supply (
                  {(Number(totalSupply) * maxTxPercent / 100).toLocaleString()} tokens)
                </p>
              </div>

              <Separator />

              {/* Pool Allocation */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <Coins className="size-3.5 text-muted-foreground" />
                    Pool Allocation
                  </Label>
                  <span className={cn("text-sm font-semibold", poolPercent >= 95 ? "text-emerald-400" : poolPercent >= 80 ? "text-yellow-400" : "text-orange-400")}>
                    {poolPercent}%
                  </span>
                </div>
                <Slider
                  value={[poolPercent]}
                  onValueChange={(v) => setPoolPercent(Array.isArray(v) ? v[0] : v)}
                  min={20}
                  max={100}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">
                  {poolPercent}% of supply goes to the liquidity pool ({(Number(totalSupply) * poolPercent / 100).toLocaleString()} tokens).
                  Creator retains {100 - poolPercent}%.
                </p>
              </div>

              <Separator />

              {/* LP Lock Duration */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5">
                  <Lock className="size-3.5 text-muted-foreground" />
                  LP Lock Duration
                </Label>
                <Select value={lpLockDuration} onValueChange={(v) => { if (v) setLpLockDuration(v) }}>
                  <SelectTrigger className="w-full" aria-label="LP lock duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LP_LOCK_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Liquidity pool tokens will be locked for this duration, preventing rug pulls
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Post-Conditions Info Box */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent>
              <div className="flex gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
                  <Info className="size-4 text-emerald-400" />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-emerald-300">
                    On-Chain Post-Conditions Active
                  </p>
                  <ul className="space-y-1.5 text-xs text-emerald-300/70">
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3 text-emerald-400" />
                      Wallet automatically enforces max {maxWalletPercent}% holding limit
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3 text-emerald-400" />
                      Transactions exceeding {maxTxPercent}% of supply will be rejected
                    </li>
                    <li className="flex items-center gap-1.5">
                      <CheckCircle2 className="size-3 text-emerald-400" />
                      LP locked for{" "}
                      {LP_LOCK_OPTIONS.find((o) => o.value === lpLockDuration)?.label} --
                      creator cannot pull liquidity
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Ban className="size-3 text-emerald-400" />
                      No additional minting after deployment
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Shield Score Preview */}
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-center text-sm">Shield Score Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center gap-3">
                <div className={cn(
                  "flex size-20 items-center justify-center rounded-full border-4 text-2xl font-bold",
                  shieldScore >= 80
                    ? "border-emerald-400/50 text-emerald-400"
                    : shieldScore >= 60
                      ? "border-yellow-400/50 text-yellow-400"
                      : shieldScore >= 40
                        ? "border-orange-400/50 text-orange-400"
                        : "border-red-400/50 text-red-400"
                )}>
                  {shieldScore}
                </div>
                <ShieldBadge score={shieldScore} size="lg" />
              </div>

              <Separator />

              <div className="space-y-2 text-xs">
                <ScoreRow label="No Mint" points={30} earned={shieldDetails.noMint ? 30 : 0} />
                <ScoreRow
                  label={`Creator ${shieldDetails.creatorPercent}%`}
                  points={25}
                  earned={shieldDetails.creatorPercent <= 5 ? 25 : 0}
                />
                <ScoreRow
                  label={`Max Tx ${maxTxPercent}%`}
                  points={20}
                  earned={maxTxPercent > 0 && maxTxPercent <= 2 ? 20 : 0}
                />
                <ScoreRow
                  label={`Max Wallet ${maxWalletPercent}%`}
                  points={15}
                  earned={maxWalletPercent > 0 && maxWalletPercent <= 10 ? 15 : 0}
                />
                <ScoreRow label="LP Locked" points={10} earned={shieldDetails.lpLocked ? 10 : 0} />
              </div>

              <Separator />

              {connected ? (
                <Button
                  className="w-full gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                  size="lg"
                  disabled={!isFormValid || creating}
                  onClick={handleLaunch}
                >
                  {creating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Rocket className="size-4" />
                      Launch Token
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  className="w-full gap-1.5"
                  size="lg"
                  variant="outline"
                  onClick={connect}
                >
                  Connect Wallet to Launch
                </Button>
              )}

              {!isFormValid && (
                <p className="text-center text-xs text-muted-foreground">
                  Fill in token name and symbol to continue
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ScoreRow({
  label,
  points,
  earned,
}: {
  label: string
  points: number
  earned: number
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums font-medium",
          earned === points
            ? "text-emerald-400"
            : earned > 0
              ? "text-yellow-400"
              : "text-red-400"
        )}
      >
        {earned}/{points}
      </span>
    </div>
  )
}
