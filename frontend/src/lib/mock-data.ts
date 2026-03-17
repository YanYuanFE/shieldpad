export interface ShieldDetails {
  noMint: boolean
  creatorPercent: number
  maxTxPercent: number
  maxWalletPercent: number
  lpLocked: boolean
}

export interface Token {
  address: string
  name: string
  symbol: string
  price: number
  marketCap: number
  volume24h: number
  shieldScore: number
  shieldDetails: ShieldDetails
  imageUrl?: string
  createdAt: string
  holders: number
  totalSupply: number
}
