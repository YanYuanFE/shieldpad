import type { Token } from "@/lib/mock-data"

const API_URL = ""

interface ApiTokenPoolInfo {
  virtualStxReserves: number
  virtualTokenReserves: number
  realStxReserves: number
  realTokenReserves: number
  creator: string
  complete: boolean
  lpLockedUntil: number
  maxWalletPercent: number
  maxTxPercent: number
}

interface ApiTokenShieldParams {
  maxWalletPercent: number
  maxTxPercent: number
  creator: string
  minted: boolean
  ammContract: string
}

interface ApiToken {
  contractAddress: string
  name: string
  symbol: string
  creator: string
  createdAt: number
  totalSupply: number
  price: number
  shieldScore: number
  creatorBalance: number
  poolInfo: ApiTokenPoolInfo
  shieldParams: ApiTokenShieldParams
}

interface FetchTokensResponse {
  tokens: ApiToken[]

}

interface CreateTokenParams {
  name: string
  symbol: string
  maxWalletPercent: number
  maxTxPercent: number
  lpLockBlocks: number
  poolPercent: number
}

interface CreateTokenResponse {
  txId: string
  contractAddress: string
}

interface EstimateBuyResponse {
  tokenAddress: string
  stxAmount: number
  estimatedTokens: number

}

interface EstimateSellResponse {
  tokenAddress: string
  tokenAmount: number
  estimatedStx: number

}

/** Convert an API token (basis points) into the shape the frontend expects (plain %) */
function mapApiTokenToFrontend(apiToken: ApiToken): Token {
  const maxWalletPercent = apiToken.shieldParams.maxWalletPercent / 100
  const maxTxPercent = apiToken.shieldParams.maxTxPercent / 100

  return {
    address: apiToken.contractAddress,
    name: apiToken.name,
    symbol: apiToken.symbol,
    price: apiToken.price / 1_000_000, // microSTX to STX
    marketCap: (apiToken.price / 1_000_000) * (apiToken.totalSupply / 1_000_000),
    volume24h: 0, // API doesn't provide this
    shieldScore: apiToken.shieldScore,
    shieldDetails: {
      noMint: apiToken.shieldParams.minted,
      creatorPercent: apiToken.totalSupply > 0
        ? Math.round((apiToken.creatorBalance / apiToken.totalSupply) * 100)
        : 0,
      maxTxPercent,
      maxWalletPercent,
      lpLocked: apiToken.poolInfo.lpLockedUntil > 0,
    },
    createdAt: new Date(apiToken.createdAt * 1000).toISOString(),
    holders: 0, // API doesn't provide this
    totalSupply: apiToken.totalSupply,
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export async function fetchTokens(): Promise<Token[] | null> {
  const data = await apiFetch<FetchTokensResponse>("/api/tokens")
  if (!data || !Array.isArray(data.tokens)) return null
  return data.tokens.map(mapApiTokenToFrontend)
}

export async function fetchToken(address: string): Promise<Token | null> {
  const data = await apiFetch<ApiToken>(`/api/tokens/${encodeURIComponent(address)}`)
  if (!data || !data.contractAddress) return null
  return mapApiTokenToFrontend(data)
}

export async function createToken(params: CreateTokenParams): Promise<CreateTokenResponse | null> {
  return apiFetch<CreateTokenResponse>("/api/tokens/create", {
    method: "POST",
    body: JSON.stringify(params),
  })
}

const STACKS_API = "https://api.testnet.hiro.so"
const HIRO_API_KEY = "052a33dfbbbc641fc1840167c2efdad3"
const hiroHeaders: HeadersInit = HIRO_API_KEY ? { "x-hiro-api-key": HIRO_API_KEY } : {}

/** Fetch STX balance for a wallet address (returns human-readable STX) */
export async function fetchStxBalance(address: string): Promise<number> {
  try {
    const res = await fetch(`${STACKS_API}/v2/accounts/${address}`, { headers: hiroHeaders })
    if (!res.ok) return 0
    const data = await res.json() as { balance: string }
    return parseInt(data.balance, 16) / 1_000_000
  } catch {
    return 0
  }
}

/** Fetch token balance for a wallet (returns human-readable token amount) */
export async function fetchTokenBalance(
  tokenContract: string,
  walletAddress: string,
): Promise<number> {
  try {
    const [contractAddr, contractName] = tokenContract.split(".")
    const { Cl, cvToHex, hexToCV, cvToValue } = await import("@stacks/transactions")
    const senderHex = cvToHex(Cl.principal(walletAddress))
    const res = await fetch(
      `${STACKS_API}/v2/contracts/call-read/${contractAddr}/${contractName}/get-balance`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hiroHeaders },
        body: JSON.stringify({
          sender: walletAddress,
          arguments: [senderHex],
        }),
      },
    )
    if (!res.ok) return 0
    const data = await res.json() as { okay: boolean; result?: string }
    if (!data.okay || !data.result) return 0
    const cv = hexToCV(data.result)
    const val = cvToValue(cv, true)
    const raw = typeof val === "object" && val && "value" in val ? Number(val.value) : Number(val)
    return raw / 1_000_000
  } catch {
    return 0
  }
}

/** Returns estimated tokens out in raw chain units (with 6 decimals) */
export async function estimateBuy(address: string, stxMicroAmount: number): Promise<number | null> {
  const data = await apiFetch<EstimateBuyResponse>(
    `/api/tokens/${encodeURIComponent(address)}/estimate-buy?amount=${stxMicroAmount}`
  )
  return data?.estimatedTokens ?? null
}

/** Returns estimated STX out in microSTX */
export async function estimateSell(address: string, tokenRawAmount: number): Promise<number | null> {
  const data = await apiFetch<EstimateSellResponse>(
    `/api/tokens/${encodeURIComponent(address)}/estimate-sell?amount=${tokenRawAmount}`
  )
  return data?.estimatedStx ?? null
}
