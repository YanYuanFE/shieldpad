import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const TOKEN_CONTRACT = "shield-token";
const AMM_CONTRACT = "shield-amm";
const MAX_SUPPLY = 1_000_000_000_000n; // 1M tokens * 1e6 decimals

// Default virtual reserves from the contract
const DEFAULT_VIRTUAL_STX = 30_000_000n;       // 30 STX
const DEFAULT_VIRTUAL_TOKENS = 800_000_000_000n; // 800K tokens

// Pool token amount for tests
const POOL_TOKEN_AMOUNT = 200_000_000_000n; // 200K tokens

/**
 * Helper: mint tokens and set up AMM contract address.
 * Mints full supply to deployer and sets the AMM contract as exempt from wallet limits.
 * Also relaxes shield params so pool creation and trading work without limit issues.
 */
function setupTokenAndAmm() {
  // Mint full supply to deployer
  simnet.callPublicFn(TOKEN_CONTRACT, "mint", [Cl.uint(MAX_SUPPLY), Cl.principal(deployer)], deployer);

  // Set AMM contract address on the token so it is exempt from wallet limits
  const ammAddress = `${deployer}.${AMM_CONTRACT}`;
  simnet.callPublicFn(TOKEN_CONTRACT, "set-amm-contract", [Cl.principal(ammAddress)], deployer);

  // Defaults are already wide-open (10000/10000), no need to widen.
}

/**
 * Helper: set up token, AMM, and create a pool.
 */
function setupPool() {
  setupTokenAndAmm();

  // Create pool - deployer transfers tokens to the AMM bonding curve
  simnet.callPublicFn(
    AMM_CONTRACT,
    "create-pool",
    [
      Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
      Cl.uint(POOL_TOKEN_AMOUNT),
      Cl.uint(500),  // max-wallet snapshot: 5%
      Cl.uint(100),  // max-tx snapshot: 1%
      Cl.uint(100),  // LP lock for 100 blocks
    ],
    deployer
  );
}

describe("shield-amm", () => {
  // ========================================================================
  // Pool Creation
  // ========================================================================

  describe("create-pool", () => {
    it("creates pool with correct initial reserves", () => {
      setupTokenAndAmm();

      const result = simnet.callPublicFn(
        AMM_CONTRACT,
        "create-pool",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(POOL_TOKEN_AMOUNT),
          Cl.uint(500),
          Cl.uint(100),
          Cl.uint(100),
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify pool info by checking individual fields
      const tokenPrincipal = `${deployer}.${TOKEN_CONTRACT}`;
      const poolInfo = simnet.callReadOnlyFn(
        AMM_CONTRACT,
        "get-pool-info",
        [Cl.principal(tokenPrincipal)],
        deployer
      );

      // poolInfo.result is (ok <tuple>); access the tuple fields
      const fields = poolInfo.result.value.value;
      expect(fields["virtual-stx-reserves"]).toBeUint(DEFAULT_VIRTUAL_STX);
      expect(fields["virtual-token-reserves"]).toBeUint(DEFAULT_VIRTUAL_TOKENS + POOL_TOKEN_AMOUNT);
      expect(fields["real-stx-reserves"]).toBeUint(0n);
      expect(fields["real-token-reserves"]).toBeUint(POOL_TOKEN_AMOUNT);
      expect(fields["creator"]).toBePrincipal(deployer);
      expect(fields["complete"]).toBeBool(false);
      expect(fields["max-wallet-percent"]).toBeUint(500n);
      expect(fields["max-tx-percent"]).toBeUint(100n);
      // lp-locked-until should be at least 100 blocks from a recent block
      expect(fields["lp-locked-until"].value).toBeGreaterThanOrEqual(100n);

      // Verify pool count
      const count = simnet.callReadOnlyFn(AMM_CONTRACT, "get-pool-count", [], deployer);
      expect(count.result).toBeOk(Cl.uint(1));
    });

    it("fails to create duplicate pool", () => {
      setupPool();

      // Try to create the same pool again
      const result = simnet.callPublicFn(
        AMM_CONTRACT,
        "create-pool",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(POOL_TOKEN_AMOUNT),
          Cl.uint(500),
          Cl.uint(100),
          Cl.uint(100),
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(2002));
    });
  });

  // ========================================================================
  // Buy
  // ========================================================================

  describe("buy", () => {
    it("user sends STX and receives tokens, reserves update correctly", () => {
      setupPool();

      const stxAmount = 1_000_000n; // 1 STX

      // Estimate tokens out first
      const tokenPrincipal = `${deployer}.${TOKEN_CONTRACT}`;
      const estimate = simnet.callReadOnlyFn(
        AMM_CONTRACT,
        "estimate-buy",
        [Cl.principal(tokenPrincipal), Cl.uint(stxAmount)],
        wallet1
      );

      // Buy tokens as wallet1
      const result = simnet.callPublicFn(
        AMM_CONTRACT,
        "buy",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(stxAmount),
          Cl.uint(0), // no slippage protection for this test
        ],
        wallet1
      );
      // estimate.result is (ok <uint>), so estimate.result.value is the Cl.uint value
      expect(result.result).toBeOk(estimate.result.value);

      // Verify wallet1 received tokens
      const balance = simnet.callReadOnlyFn(
        TOKEN_CONTRACT,
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(balance.result).toBeOk(estimate.result.value);

      // Verify pool reserves updated: real-stx should have increased by stx-amount
      const poolInfo = simnet.callReadOnlyFn(
        AMM_CONTRACT,
        "get-pool-info",
        [Cl.principal(tokenPrincipal)],
        deployer
      );
      // poolInfo.result is (ok {tuple}), .value is the ResponseOk value,
      // which is a tuple: { type: "tuple", value: { "real-stx-reserves": ClarityValue, ... } }
      const poolTuple = poolInfo.result.value.value;
      expect(poolTuple["real-stx-reserves"]).toBeUint(stxAmount);
    });

    it("slippage protection works (min-tokens-out too high)", () => {
      setupPool();

      const stxAmount = 1_000_000n; // 1 STX

      // Set min-tokens-out extremely high so it fails
      const result = simnet.callPublicFn(
        AMM_CONTRACT,
        "buy",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(stxAmount),
          Cl.uint(999_999_999_999n), // absurdly high min
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(2006)); // ERR-SLIPPAGE-TOO-HIGH
    });
  });

  // ========================================================================
  // Sell
  // ========================================================================

  describe("sell", () => {
    it("user sends tokens and receives STX, reserves update correctly", () => {
      setupPool();

      const stxBuyAmount = 1_000_000n; // 1 STX

      // First buy some tokens as wallet1
      const buyResult = simnet.callPublicFn(
        AMM_CONTRACT,
        "buy",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(stxBuyAmount),
          Cl.uint(0),
        ],
        wallet1
      );
      expect(buyResult.result.type).toBe("ok");

      // Get wallet1's token balance after buy
      // balance result is (ok <uint>), .value is the uint ClarityValue, .value is the BigInt
      const balAfterBuy = simnet.callReadOnlyFn(
        TOKEN_CONTRACT,
        "get-balance",
        [Cl.principal(wallet1)],
        deployer
      );
      const tokensHeld = balAfterBuy.result.value.value;
      expect(tokensHeld).toBeGreaterThan(0n);

      // Sell half the tokens
      const sellAmount = tokensHeld / 2n;

      // Estimate STX out (uses current pool state after the buy)
      const tokenPrincipal = `${deployer}.${TOKEN_CONTRACT}`;
      const estimateSell = simnet.callReadOnlyFn(
        AMM_CONTRACT,
        "estimate-sell",
        [Cl.principal(tokenPrincipal), Cl.uint(sellAmount)],
        wallet1
      );

      const sellResult = simnet.callPublicFn(
        AMM_CONTRACT,
        "sell",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(sellAmount),
          Cl.uint(0), // no slippage protection
        ],
        wallet1
      );
      expect(sellResult.result).toBeOk(estimateSell.result.value);
    });

    it("slippage protection works on sell", () => {
      setupPool();

      // Buy some tokens first (1 STX)
      const buyResult = simnet.callPublicFn(
        AMM_CONTRACT,
        "buy",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(1_000_000n),
          Cl.uint(0),
        ],
        wallet1
      );
      expect(buyResult.result.type).toBe("ok");

      // Get token balance
      const bal = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-balance", [Cl.principal(wallet1)], deployer);
      const tokensHeld = bal.result.value.value;
      expect(tokensHeld).toBeGreaterThan(0n);

      // Sell with absurdly high min-stx-out
      const result = simnet.callPublicFn(
        AMM_CONTRACT,
        "sell",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(tokensHeld),
          Cl.uint(999_999_999_999n), // absurdly high min
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(2006)); // ERR-SLIPPAGE-TOO-HIGH
    });
  });

  // ========================================================================
  // Read-Only: Pricing and Estimates
  // ========================================================================

  describe("get-price", () => {
    it("returns a reasonable price after pool creation", () => {
      setupPool();

      const tokenPrincipal = `${deployer}.${TOKEN_CONTRACT}`;
      const priceResult = simnet.callReadOnlyFn(
        AMM_CONTRACT,
        "get-price",
        [Cl.principal(tokenPrincipal)],
        deployer
      );
      // price = virtual-stx / virtual-tokens * 1e6
      // = 30_000_000 * 1_000_000 / (800_000_000_000 + 200_000_000_000)
      // = 30_000_000_000_000 / 1_000_000_000_000 = 30
      const expectedPrice = (DEFAULT_VIRTUAL_STX * 1_000_000n) / (DEFAULT_VIRTUAL_TOKENS + POOL_TOKEN_AMOUNT);
      expect(priceResult.result).toBeOk(Cl.uint(expectedPrice));
    });
  });

  describe("estimate-buy", () => {
    it("estimate matches actual buy output", () => {
      setupPool();

      const stxAmount = 2_000_000n; // 2 STX
      const tokenPrincipal = `${deployer}.${TOKEN_CONTRACT}`;

      // Get estimate
      const estimate = simnet.callReadOnlyFn(
        AMM_CONTRACT,
        "estimate-buy",
        [Cl.principal(tokenPrincipal), Cl.uint(stxAmount)],
        wallet1
      );

      // Perform actual buy
      const buyResult = simnet.callPublicFn(
        AMM_CONTRACT,
        "buy",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(stxAmount),
          Cl.uint(0),
        ],
        wallet1
      );

      // The actual buy return should match the estimate
      expect(buyResult.result).toBeOk(estimate.result.value);
    });
  });

  describe("estimate-sell", () => {
    it("estimate matches actual sell output", () => {
      setupPool();

      // First buy some tokens (1 STX worth)
      const buyResult = simnet.callPublicFn(
        AMM_CONTRACT,
        "buy",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(1_000_000n),
          Cl.uint(0),
        ],
        wallet1
      );
      expect(buyResult.result.type).toBe("ok");

      // Get wallet1 token balance
      const bal = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-balance", [Cl.principal(wallet1)], deployer);
      const tokensHeld = bal.result.value.value;
      expect(tokensHeld).toBeGreaterThan(0n);

      const tokenPrincipal = `${deployer}.${TOKEN_CONTRACT}`;

      // Get sell estimate (uses current pool state after buy)
      const estimate = simnet.callReadOnlyFn(
        AMM_CONTRACT,
        "estimate-sell",
        [Cl.principal(tokenPrincipal), Cl.uint(tokensHeld)],
        wallet1
      );

      // Perform actual sell
      const sellResult = simnet.callPublicFn(
        AMM_CONTRACT,
        "sell",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(tokensHeld),
          Cl.uint(0),
        ],
        wallet1
      );

      // Actual sell return should match estimate
      expect(sellResult.result).toBeOk(estimate.result.value);
    });
  });

  // ========================================================================
  // Graduate Pool
  // ========================================================================

  describe("graduate-pool", () => {
    it("fails if LP is still locked", () => {
      setupPool(); // LP locked for 100 blocks

      const result = simnet.callPublicFn(
        AMM_CONTRACT,
        "graduate-pool",
        [Cl.contractPrincipal(deployer, TOKEN_CONTRACT)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(2009)); // ERR-LP-STILL-LOCKED
    });

    it("only creator or deployer can graduate", () => {
      setupPool();

      // wallet2 is neither creator nor deployer
      const result = simnet.callPublicFn(
        AMM_CONTRACT,
        "graduate-pool",
        [Cl.contractPrincipal(deployer, TOKEN_CONTRACT)],
        wallet2
      );
      expect(result.result).toBeErr(Cl.uint(2001)); // ERR-NOT-AUTHORIZED
    });

    it("deployer can graduate after LP lock expires", () => {
      setupTokenAndAmm();

      // Create pool with LP lock of 0 blocks (immediately unlocked)
      simnet.callPublicFn(
        AMM_CONTRACT,
        "create-pool",
        [
          Cl.contractPrincipal(deployer, TOKEN_CONTRACT),
          Cl.uint(POOL_TOKEN_AMOUNT),
          Cl.uint(500),
          Cl.uint(100),
          Cl.uint(0), // LP lock for 0 blocks = immediately unlocked
        ],
        deployer
      );

      // Graduate immediately since LP lock is 0
      const result = simnet.callPublicFn(
        AMM_CONTRACT,
        "graduate-pool",
        [Cl.contractPrincipal(deployer, TOKEN_CONTRACT)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify pool is now marked complete
      const tokenPrincipal = `${deployer}.${TOKEN_CONTRACT}`;
      const poolInfo = simnet.callReadOnlyFn(
        AMM_CONTRACT,
        "get-pool-info",
        [Cl.principal(tokenPrincipal)],
        deployer
      );

      // poolInfo.result is (ok <tuple>)
      // .value is the ResponseOk inner value (the tuple ClarityValue)
      // .value (tuple ClarityValue).value is the object with field keys
      const poolFields = poolInfo.result.value.value;
      expect(poolFields["complete"]).toBeBool(true);
    });
  });
});
