# ShieldPad

Anti-rug-pull meme coin launchpad on Stacks. Every token is protected by on-chain post-conditions — transparent limits on minting, wallet sizes, and transaction caps enforced by smart contracts, not promises.

Built for **BUIDL BATTLE #2**.

## Architecture

```
stacks/
├── contracts/    Clarity smart contracts (Clarinet)
├── backend/      Express API (Node.js + TypeScript)
└── frontend/     React SPA (Vite + TailwindCSS + shadcn/ui)
```

### Smart Contracts

| Contract | Description |
|----------|-------------|
| `shield-token` | SIP-010 fungible token template with one-time mint, max-wallet limit, max-tx limit, AMM exemption |
| `shield-amm` | Bonding curve AMM with virtual reserves, 0.3% fee, buy/sell with slippage protection, LP lock & graduation |
| `shield-registry` | Token registry with on-chain Shield Score calculation (0–100) |

### Shield Score

Computed entirely on-chain in `shield-registry.get-shield-score`:

| Factor | Points | Condition |
|--------|--------|-----------|
| No Mint | +30 | Token supply is fixed (minted = true) |
| Creator Holdings | +25 | Creator holds ≤ 5% of total supply |
| Max Transaction | +20 | Per-tx limit is set and ≤ 2% |
| Max Wallet | +15 | Per-wallet limit is set and ≤ 10% |
| LP Locked | +10 | Liquidity pool lock has not expired |

### Anti-Rug Mechanisms

- **One-time mint** — `shield-token.mint` can only be called once by the deployer. No further supply inflation.
- **Only-tighten params** — `set-shield-params` enforces `new <= current`. Once limits are set, they can never be loosened.
- **One-time AMM set** — `set-amm-contract` can only be called once, preventing the deployer from exempting arbitrary wallets.
- **LP time-lock** — Pool creator cannot withdraw liquidity until the lock period expires.
- **Registry access control** — Only the deployer can register tokens in the registry.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/)
- [Clarinet](https://github.com/hirosystems/clarinet) ≥ 3.x
- [Docker](https://www.docker.com/) (for devnet)

### Install Dependencies

```bash
cd contracts && npm install
cd ../backend && pnpm install
cd ../frontend && pnpm install
```

### Run Contract Tests

```bash
cd contracts
npm test
```

46 tests covering token minting, transfer limits, AMM trading, slippage, pool graduation, registry, and Shield Score calculation.

### Start Development Environment

Requires 3 terminals:

**Terminal 1 — Stacks Devnet** (local blockchain + API on port 3999)

```bash
cd contracts
clarinet devnet start
```

Wait for blocks to start appearing before proceeding.

**Terminal 2 — Backend API** (port 3001)

```bash
cd backend
pnpm dev
```

**Terminal 3 — Frontend** (port 5173)

```bash
cd frontend
pnpm dev
```

Open http://localhost:5173.

> If devnet is not running, the backend automatically falls back to mock data. The UI is fully functional in demo mode — token creation and trading will return simulated responses.

### Deploy Contracts to Devnet

With devnet running:

```bash
cd contracts
clarinet deployments apply -p deployments/default.devnet-plan.yaml
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check (network, deployer, API URL) |
| GET | `/api/tokens` | List all registered tokens |
| GET | `/api/tokens/:address` | Single token detail |
| POST | `/api/tokens/create` | Deploy a new Shield token (name, symbol, maxWalletPercent, maxTxPercent, lpLockBlocks) |
| GET | `/api/tokens/:address/estimate-buy?amount=X` | Estimate tokens received for X microSTX |
| GET | `/api/tokens/:address/estimate-sell?amount=X` | Estimate STX received for X raw token units |

## Tech Stack

- **Smart Contracts** — Clarity 4 on Stacks
- **Backend** — Express 5, @stacks/transactions v7, TypeScript
- **Frontend** — React 19, Vite 8, TailwindCSS 4, shadcn/ui, @stacks/connect v8, React Router 7
- **Testing** — Vitest + Clarinet SDK (simnet)
- **Wallet** — Leather / Xverse via @stacks/connect

## Project Structure

```
contracts/
  contracts/
    shield-token.clar       Token template (SIP-010 + Shield rules)
    shield-amm.clar         Bonding curve AMM
    shield-registry.clar    Registry + Shield Score
  tests/
    shield-token.test.ts    Token unit tests
    shield-amm.test.ts      AMM unit tests
    shield-registry.test.ts Registry unit tests
  settings/
    Devnet.toml             Devnet accounts & config

backend/
  src/
    index.ts                Express server entry
    config.ts               Environment config
    lib/stacks.ts           Stacks chain interaction helpers
    lib/mock-data.ts        Fallback mock data
    routes/tokens.ts        Token CRUD & trading API

frontend/
  src/
    App.tsx                 Router setup
    pages/
      ExplorePage.tsx       Token grid with stats
      CreatePage.tsx        Token creation form with live Shield Score preview
      TokenPage.tsx         Token detail + buy/sell trading panel
    components/
      Layout.tsx            Header, nav, wallet connect, footer
      ShieldBadge.tsx       Shield Score badge component
    hooks/
      useWallet.ts          Stacks wallet connection hook
    lib/
      api.ts                Backend API client
      mock-data.ts          Frontend mock tokens
      utils.ts              Shield Score calculation, formatters
```

## License

ISC
