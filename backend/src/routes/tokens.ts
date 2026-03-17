import { Router, Request, Response, type IRouter } from "express";
import fs from "node:fs";
import { Cl } from "@stacks/transactions";
import { config } from "../config";
import {
  callReadOnly,
  deployContract,
  callContractFn,
  waitForTx,
  getNonce,
  parseClarityValue,
  unwrapValue,
} from "../lib/stacks";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helper: coerce Express v5 param (string | string[]) to string
// ---------------------------------------------------------------------------

function paramStr(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

function queryStr(val: unknown): string {
  if (typeof val === "string") return val;
  if (Array.isArray(val) && typeof val[0] === "string") return val[0];
  return "";
}

// ---------------------------------------------------------------------------
// Helper: fetch all on-chain data for a single token principal
// ---------------------------------------------------------------------------

async function fetchTokenData(tokenPrincipal: string) {
  const [contractAddr, contractName] = tokenPrincipal.split(".");

  // 1. Registry token info
  const tokenInfoCV = await callReadOnly(
    config.deployerAddress,
    config.registryContractName,
    "get-token-info",
    [Cl.principal(tokenPrincipal)]
  );
  const tokenInfo = parseClarityValue(tokenInfoCV);

  // 2. AMM pool info
  const poolInfoCV = await callReadOnly(
    config.deployerAddress,
    config.ammContractName,
    "get-pool-info",
    [Cl.principal(tokenPrincipal)]
  );
  const poolInfo = parseClarityValue(poolInfoCV);

  // 3. AMM price
  const priceCV = await callReadOnly(
    config.deployerAddress,
    config.ammContractName,
    "get-price",
    [Cl.principal(tokenPrincipal)]
  );
  const price = unwrapValue(priceCV);

  // 4. Shield params from token contract
  const shieldParamsCV = await callReadOnly(
    contractAddr,
    contractName,
    "get-shield-params",
    []
  );
  const shieldParams = parseClarityValue(shieldParamsCV);

  // 5. Total supply
  const totalSupplyCV = await callReadOnly(
    contractAddr,
    contractName,
    "get-total-supply",
    []
  );
  const totalSupply = unwrapValue(totalSupplyCV);

  // 6. Creator balance
  const creatorAddr =
    tokenInfo?.creator?.value || tokenInfo?.creator || config.deployerAddress;
  const creatorBalanceCV = await callReadOnly(
    contractAddr,
    contractName,
    "get-balance",
    [Cl.principal(typeof creatorAddr === "string" ? creatorAddr : config.deployerAddress)]
  );
  const creatorBalance = unwrapValue(creatorBalanceCV);

  // 7. Shield score
  const isMinted = shieldParams?.minted?.value ?? shieldParams?.minted ?? false;
  const maxTxPct =
    Number(shieldParams?.["max-tx-percent"]?.value ?? shieldParams?.["max-tx-percent"] ?? 0);
  const maxWalletPct =
    Number(shieldParams?.["max-wallet-percent"]?.value ?? shieldParams?.["max-wallet-percent"] ?? 0);
  const lpLockedUntil =
    Number(poolInfo?.["lp-locked-until"]?.value ?? poolInfo?.["lp-locked-until"] ?? 0);

  const shieldScoreCV = await callReadOnly(
    config.deployerAddress,
    config.registryContractName,
    "get-shield-score",
    [
      Cl.bool(!!isMinted),
      Cl.uint(Number(creatorBalance) || 0),
      Cl.uint(Number(totalSupply) || 0),
      Cl.uint(maxTxPct),
      Cl.uint(maxWalletPct),
      Cl.uint(lpLockedUntil),
    ]
  );
  const shieldScore = unwrapValue(shieldScoreCV);

  return {
    contractAddress: tokenPrincipal,
    name: tokenInfo?.name?.value ?? tokenInfo?.name ?? "",
    symbol: tokenInfo?.symbol?.value ?? tokenInfo?.symbol ?? "",
    creator: typeof creatorAddr === "string" ? creatorAddr : config.deployerAddress,
    createdAt: Number(tokenInfo?.["created-at"]?.value ?? tokenInfo?.["created-at"] ?? 0),
    totalSupply: Number(totalSupply),
    price: Number(price),
    shieldScore: Number(shieldScore),
    poolInfo: {
      virtualStxReserves: Number(
        poolInfo?.["virtual-stx-reserves"]?.value ?? poolInfo?.["virtual-stx-reserves"] ?? 0
      ),
      virtualTokenReserves: Number(
        poolInfo?.["virtual-token-reserves"]?.value ?? poolInfo?.["virtual-token-reserves"] ?? 0
      ),
      realStxReserves: Number(
        poolInfo?.["real-stx-reserves"]?.value ?? poolInfo?.["real-stx-reserves"] ?? 0
      ),
      realTokenReserves: Number(
        poolInfo?.["real-token-reserves"]?.value ?? poolInfo?.["real-token-reserves"] ?? 0
      ),
      creator: poolInfo?.creator?.value ?? poolInfo?.creator ?? "",
      complete: poolInfo?.complete?.value ?? poolInfo?.complete ?? false,
      lpLockedUntil,
      maxWalletPercent: Number(
        poolInfo?.["max-wallet-percent"]?.value ?? poolInfo?.["max-wallet-percent"] ?? 0
      ),
      maxTxPercent: Number(
        poolInfo?.["max-tx-percent"]?.value ?? poolInfo?.["max-tx-percent"] ?? 0
      ),
    },
    creatorBalance: Number(creatorBalance) || 0,
    shieldParams: {
      maxWalletPercent: maxWalletPct,
      maxTxPercent: maxTxPct,
      creator: typeof creatorAddr === "string" ? creatorAddr : config.deployerAddress,
      minted: !!isMinted,
      ammContract:
        shieldParams?.["amm-contract"]?.value ?? shieldParams?.["amm-contract"] ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/tokens - List all tokens
// ---------------------------------------------------------------------------

router.get("/", async (_req: Request, res: Response) => {
  try {
    const countCV = await callReadOnly(
      config.deployerAddress,
      config.registryContractName,
      "get-token-count",
      []
    );
    const count = Number(unwrapValue(countCV));

    if (count === 0) {
      res.json({ tokens: [] });
      return;
    }

    const tokens = [];

    for (let i = 0; i < count; i++) {
      try {
        const indexCV = await callReadOnly(
          config.deployerAddress,
          config.registryContractName,
          "get-token-by-index",
          [Cl.uint(i)]
        );
        const principal = unwrapValue(indexCV);

        if (!principal) continue;

        const tokenPrincipal =
          typeof principal === "string"
            ? principal
            : typeof principal === "object" && principal.value
              ? String(principal.value)
              : String(principal);

        const tokenData = await fetchTokenData(tokenPrincipal);
        tokens.push(tokenData);
      } catch (err) {
        console.error(`Error fetching token at index ${i}:`, err);
      }
    }

    res.json({ tokens });
  } catch (err) {
    console.error("Chain unreachable:", err);
    res.status(503).json({ error: "Chain unavailable" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/tokens/:address - Single token detail
// ---------------------------------------------------------------------------

router.get("/:address", async (req: Request, res: Response) => {
  const tokenAddress = paramStr(req.params.address);

  if (!tokenAddress || !tokenAddress.includes(".")) {
    res.status(400).json({ error: "Invalid token address. Expected format: ST...ADDR.contract-name" });
    return;
  }

  try {
    const tokenData = await fetchTokenData(tokenAddress);
    res.json(tokenData);
  } catch (err) {
    console.error(`Chain call failed for ${tokenAddress}:`, err);
    res.status(404).json({ error: "Token not found" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/tokens/create - Deploy a new token
// ---------------------------------------------------------------------------

router.post("/create", async (req: Request, res: Response) => {
  const {
    name,
    symbol,
    maxSupply,
    maxWalletPercent,
    maxTxPercent,
    lpLockBlocks,
    poolPercent,
  } = req.body;

  if (!name || !symbol) {
    res.status(400).json({ error: "name and symbol are required" });
    return;
  }

  const contractName = `shield-${symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

  try {
    let template = fs.readFileSync(config.tokenTemplatePath, "utf-8");

    template = template.replace(
      '(define-constant TOKEN-NAME "Shield Token")',
      `(define-constant TOKEN-NAME "${name.slice(0, 32)}")`
    );
    template = template.replace(
      '(define-constant TOKEN-SYMBOL "SHLD")',
      `(define-constant TOKEN-SYMBOL "${symbol.slice(0, 10)}")`
    );

    if (maxSupply) {
      template = template.replace(
        "(define-constant MAX-SUPPLY u1000000000000)",
        `(define-constant MAX-SUPPLY u${maxSupply})`
      );
    }

    // Token template now starts with wide-open params (u10000),
    // which will be tightened after pool creation.

    // Step 1: Deploy token contract
    console.log(`[create] Deploying ${contractName}...`);
    const result = await deployContract(contractName, template);
    const tokenPrincipal = `${config.deployerAddress}.${contractName}`;
    const ammPrincipal = `${config.deployerAddress}.${config.ammContractName}`;

    // Step 2: Wait for deploy tx to be mined
    console.log(`[create] Waiting for deploy tx ${result.txId}...`);
    const deployStatus = await waitForTx(result.txId);
    if (deployStatus !== "success") {
      throw new Error(`Deploy tx failed: ${deployStatus}`);
    }

    // Step 3: Mint tokens to deployer (one-time)
    const supply = maxSupply || 1000000000000;
    console.log(`[create] Minting ${supply} tokens...`);
    const mintTxId = await callContractFn(
      config.deployerAddress, contractName, "mint",
      [Cl.uint(supply), Cl.principal(config.deployerAddress)]
    );
    await waitForTx(mintTxId);

    // Step 4: Set AMM contract on token
    console.log(`[create] Setting AMM contract...`);
    const setAmmTxId = await callContractFn(
      config.deployerAddress, contractName, "set-amm-contract",
      [Cl.principal(ammPrincipal)]
    );
    await waitForTx(setAmmTxId);

    // Step 5: Create AMM pool
    const pct = Math.min(Math.max(poolPercent ?? 80, 10), 100) / 100;
    const poolTokens = Math.floor(supply * pct);
    console.log(`[create] Creating pool with ${poolTokens} tokens...`);
    const poolTxId = await callContractFn(
      config.deployerAddress, config.ammContractName, "create-pool",
      [
        Cl.contractPrincipal(config.deployerAddress, contractName),
        Cl.uint(poolTokens),
        Cl.uint(maxWalletPercent ?? 500),
        Cl.uint(maxTxPercent ?? 100),
        Cl.uint(lpLockBlocks ?? 1000),
      ]
    );
    await waitForTx(poolTxId);

    // Step 6: Tighten shield params from wide-open to desired values
    console.log(`[create] Tightening shield params...`);
    const tightenTxId = await callContractFn(
      config.deployerAddress, contractName, "set-shield-params",
      [Cl.uint(maxWalletPercent ?? 500), Cl.uint(maxTxPercent ?? 100)]
    );
    await waitForTx(tightenTxId);

    // Step 7: Register in registry
    console.log(`[create] Registering token...`);
    const regTxId = await callContractFn(
      config.deployerAddress, config.registryContractName, "register-token",
      [
        Cl.principal(tokenPrincipal),
        Cl.stringAscii(name.slice(0, 32)),
        Cl.stringAscii(symbol.slice(0, 10)),
        Cl.principal(ammPrincipal),
      ]
    );
    await waitForTx(regTxId);

    console.log(`[create] Token ${contractName} fully set up!`);

    res.json({
      txId: result.txId,
      contractAddress: tokenPrincipal,
      contractName: result.contractName,
      name,
      symbol,
      maxWalletPercent: maxWalletPercent ?? 500,
      maxTxPercent: maxTxPercent ?? 100,
      lpLockBlocks: lpLockBlocks ?? 0,
    });
  } catch (err: any) {
    console.error("Token deploy failed:", err?.message);
    res.status(500).json({ error: "Token deployment failed", details: err?.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/tokens/:address/estimate-buy?amount=X
// ---------------------------------------------------------------------------

router.get("/:address/estimate-buy", async (req: Request, res: Response) => {
  const tokenAddress = paramStr(req.params.address);
  const amount = parseInt(queryStr(req.query.amount), 10);

  if (!tokenAddress || !tokenAddress.includes(".")) {
    res.status(400).json({ error: "Invalid token address" });
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: "amount query parameter is required and must be > 0" });
    return;
  }

  try {
    const resultCV = await callReadOnly(
      config.deployerAddress,
      config.ammContractName,
      "estimate-buy",
      [Cl.principal(tokenAddress), Cl.uint(amount)]
    );
    const tokensOut = unwrapValue(resultCV);

    res.json({
      tokenAddress,
      stxAmount: amount,
      estimatedTokens: Number(tokensOut),
    });
  } catch (err) {
    console.error("estimate-buy failed:", err);
    res.status(500).json({ error: "Estimate failed" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/tokens/:address/estimate-sell?amount=X
// ---------------------------------------------------------------------------

router.get("/:address/estimate-sell", async (req: Request, res: Response) => {
  const tokenAddress = paramStr(req.params.address);
  const amount = parseInt(queryStr(req.query.amount), 10);

  if (!tokenAddress || !tokenAddress.includes(".")) {
    res.status(400).json({ error: "Invalid token address" });
    return;
  }

  if (isNaN(amount) || amount <= 0) {
    res.status(400).json({ error: "amount query parameter is required and must be > 0" });
    return;
  }

  try {
    const resultCV = await callReadOnly(
      config.deployerAddress,
      config.ammContractName,
      "estimate-sell",
      [Cl.principal(tokenAddress), Cl.uint(amount)]
    );
    const stxOut = unwrapValue(resultCV);

    res.json({
      tokenAddress,
      tokenAmount: amount,
      estimatedStx: Number(stxOut),
    });
  } catch (err) {
    console.error("estimate-sell failed:", err);
    res.status(500).json({ error: "Estimate failed" });
  }
});

export default router;
