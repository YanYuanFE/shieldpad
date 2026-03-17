import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const TOKEN_CONTRACT = "shield-token";
const MAX_SUPPLY = 1_000_000_000_000n; // 1M tokens * 1e6 decimals

describe("shield-token", () => {
  // ========================================================================
  // Initial State
  // ========================================================================

  describe("initial state", () => {
    it("token is not minted initially", () => {
      const result = simnet.callReadOnlyFn(TOKEN_CONTRACT, "is-minted", [], deployer);
      expect(result.result).toBeOk(Cl.bool(false));
    });

    it("returns correct token name", () => {
      const result = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-name", [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii("Shield Token"));
    });

    it("returns correct token symbol", () => {
      const result = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-symbol", [], deployer);
      expect(result.result).toBeOk(Cl.stringAscii("SHLD"));
    });

    it("returns correct decimals", () => {
      const result = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-decimals", [], deployer);
      expect(result.result).toBeOk(Cl.uint(6));
    });

    it("total supply is zero before minting", () => {
      const result = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-total-supply", [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("deployer balance is zero before minting", () => {
      const result = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-balance", [Cl.principal(deployer)], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });

  // ========================================================================
  // Minting
  // ========================================================================

  describe("mint", () => {
    it("deployer can mint the full supply once", () => {
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "mint",
        [Cl.uint(MAX_SUPPLY), Cl.principal(deployer)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify total supply
      const supply = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-total-supply", [], deployer);
      expect(supply.result).toBeOk(Cl.uint(MAX_SUPPLY));

      // Verify deployer balance
      const balance = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-balance", [Cl.principal(deployer)], deployer);
      expect(balance.result).toBeOk(Cl.uint(MAX_SUPPLY));

      // Verify minted flag is now true
      const minted = simnet.callReadOnlyFn(TOKEN_CONTRACT, "is-minted", [], deployer);
      expect(minted.result).toBeOk(Cl.bool(true));
    });

    it("second mint attempt fails with ERR-ALREADY-MINTED", () => {
      // First mint
      simnet.callPublicFn(TOKEN_CONTRACT, "mint", [Cl.uint(MAX_SUPPLY), Cl.principal(deployer)], deployer);

      // Second mint should fail
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "mint",
        [Cl.uint(1_000_000n), Cl.principal(deployer)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1002));
    });

    it("non-deployer cannot mint", () => {
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "mint",
        [Cl.uint(MAX_SUPPLY), Cl.principal(wallet1)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1001));
    });
  });

  // ========================================================================
  // Transfer
  // ========================================================================

  describe("transfer", () => {
    it("basic transfer works within limits", () => {
      // Mint tokens to deployer
      simnet.callPublicFn(TOKEN_CONTRACT, "mint", [Cl.uint(MAX_SUPPLY), Cl.principal(deployer)], deployer);

      // Tighten shield params: 5% max-wallet, 1% max-tx
      simnet.callPublicFn(TOKEN_CONTRACT, "set-shield-params", [Cl.uint(500), Cl.uint(100)], deployer);

      // Transfer 1% of supply (the max-tx limit) = 10,000,000,000
      const transferAmount = 10_000_000_000n;
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "transfer",
        [Cl.uint(transferAmount), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify balances
      const bal1 = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-balance", [Cl.principal(wallet1)], deployer);
      expect(bal1.result).toBeOk(Cl.uint(transferAmount));
    });

    it("max-tx limit is enforced (transfer > 1% of supply fails)", () => {
      // Mint tokens to deployer
      simnet.callPublicFn(TOKEN_CONTRACT, "mint", [Cl.uint(MAX_SUPPLY), Cl.principal(deployer)], deployer);

      // Tighten shield params: 5% max-wallet, 1% max-tx
      simnet.callPublicFn(TOKEN_CONTRACT, "set-shield-params", [Cl.uint(500), Cl.uint(100)], deployer);

      // Try to transfer more than 1% of supply
      // 1% of 1,000,000,000,000 = 10,000,000,000
      // Transfer 10,000,000,001 should fail
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "transfer",
        [Cl.uint(10_000_000_001n), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1003));
    });

    it("max-wallet limit is enforced (recipient cannot hold > 5% of supply)", () => {
      // Mint tokens to deployer
      simnet.callPublicFn(TOKEN_CONTRACT, "mint", [Cl.uint(MAX_SUPPLY), Cl.principal(deployer)], deployer);

      // Tighten shield params: 5% max-wallet, 1% max-tx
      simnet.callPublicFn(TOKEN_CONTRACT, "set-shield-params", [Cl.uint(500), Cl.uint(100)], deployer);

      // 5% of supply = 50,000,000,000
      // Transfer 5 batches of 1% each (10,000,000,000 each) = total 50,000,000,000
      // First 5 transfers should work (getting wallet1 to exactly 5%)
      for (let i = 0; i < 5; i++) {
        const res = simnet.callPublicFn(
          TOKEN_CONTRACT,
          "transfer",
          [Cl.uint(10_000_000_000n), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
          deployer
        );
        expect(res.result).toBeOk(Cl.bool(true));
      }

      // Now wallet1 has 50,000,000,000 which is exactly 5%
      // One more transfer should fail due to max-wallet
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "transfer",
        [Cl.uint(1n), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1004));
    });

    it("AMM contract is exempt from max-tx limit", () => {
      // Mint tokens to deployer
      simnet.callPublicFn(TOKEN_CONTRACT, "mint", [Cl.uint(MAX_SUPPLY), Cl.principal(deployer)], deployer);

      // Set AMM contract address
      const ammAddress = `${deployer}.shield-amm`;
      simnet.callPublicFn(TOKEN_CONTRACT, "set-amm-contract", [Cl.principal(ammAddress)], deployer);

      // Tighten shield params: 5% max-wallet, 1% max-tx
      simnet.callPublicFn(TOKEN_CONTRACT, "set-shield-params", [Cl.uint(500), Cl.uint(100)], deployer);

      // Transfer 3% of supply TO AMM (exceeds 1% max-tx) — should succeed
      const bigAmount = 30_000_000_000n; // 3% of supply
      const res = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "transfer",
        [Cl.uint(bigAmount), Cl.principal(deployer), Cl.principal(ammAddress), Cl.none()],
        deployer
      );
      expect(res.result).toBeOk(Cl.bool(true));
    });

    it("AMM contract is exempt from wallet limits", () => {
      // Mint tokens to deployer
      simnet.callPublicFn(TOKEN_CONTRACT, "mint", [Cl.uint(MAX_SUPPLY), Cl.principal(deployer)], deployer);

      // Set AMM contract address
      const ammAddress = `${deployer}.shield-amm`;
      simnet.callPublicFn(TOKEN_CONTRACT, "set-amm-contract", [Cl.principal(ammAddress)], deployer);

      // Tighten shield params: 5% max-wallet, 1% max-tx
      simnet.callPublicFn(TOKEN_CONTRACT, "set-shield-params", [Cl.uint(500), Cl.uint(100)], deployer);

      // Transfer a large amount (more than 5% but within tx limit) to AMM
      // We need to do multiple transfers since each is limited to 1% per tx
      // Transfer 1% at a time, 6 times to exceed 5% wallet limit
      for (let i = 0; i < 6; i++) {
        const res = simnet.callPublicFn(
          TOKEN_CONTRACT,
          "transfer",
          [Cl.uint(10_000_000_000n), Cl.principal(deployer), Cl.principal(ammAddress), Cl.none()],
          deployer
        );
        expect(res.result).toBeOk(Cl.bool(true));
      }

      // AMM now holds 60,000,000,000 which is 6% -- above the 5% wallet limit
      // This should have worked because AMM is exempt
      const ammBalance = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-balance", [Cl.principal(ammAddress)], deployer);
      expect(ammBalance.result).toBeOk(Cl.uint(60_000_000_000n));
    });
  });

  // ========================================================================
  // Shield Params Admin
  // ========================================================================

  describe("set-shield-params", () => {
    it("deployer can tighten shield params", () => {
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "set-shield-params",
        [Cl.uint(1000), Cl.uint(200)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      // Verify updated values
      const maxWallet = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-max-wallet-percent", [], deployer);
      expect(maxWallet.result).toBeOk(Cl.uint(1000));

      const maxTx = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-max-tx-percent", [], deployer);
      expect(maxTx.result).toBeOk(Cl.uint(200));
    });

    it("widening is rejected (ERR-CANNOT-WIDEN)", () => {
      // First tighten from default 10000/10000 to 500/100
      simnet.callPublicFn(TOKEN_CONTRACT, "set-shield-params", [Cl.uint(500), Cl.uint(100)], deployer);

      // Attempt to widen max-wallet from 500 to 1000 — should fail
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "set-shield-params",
        [Cl.uint(1000), Cl.uint(100)],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(1008));
    });

    it("non-deployer cannot update shield params", () => {
      const result = simnet.callPublicFn(
        TOKEN_CONTRACT,
        "set-shield-params",
        [Cl.uint(1000), Cl.uint(200)],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(1001));
    });
  });

  // ========================================================================
  // set-amm-contract (one-time)
  // ========================================================================

  describe("set-amm-contract", () => {
    it("deployer can set AMM contract once", () => {
      const ammAddress = `${deployer}.shield-amm`;
      const result = simnet.callPublicFn(TOKEN_CONTRACT, "set-amm-contract", [Cl.principal(ammAddress)], deployer);
      expect(result.result).toBeOk(Cl.bool(true));
    });

    it("second call fails with ERR-AMM-ALREADY-SET", () => {
      const ammAddress = `${deployer}.shield-amm`;
      // First call
      simnet.callPublicFn(TOKEN_CONTRACT, "set-amm-contract", [Cl.principal(ammAddress)], deployer);
      // Second call should fail
      const result = simnet.callPublicFn(TOKEN_CONTRACT, "set-amm-contract", [Cl.principal(ammAddress)], deployer);
      expect(result.result).toBeErr(Cl.uint(1007));
    });

    it("non-deployer cannot set AMM contract", () => {
      const ammAddress = `${deployer}.shield-amm`;
      const result = simnet.callPublicFn(TOKEN_CONTRACT, "set-amm-contract", [Cl.principal(ammAddress)], wallet1);
      expect(result.result).toBeErr(Cl.uint(1001));
    });
  });

  // ========================================================================
  // get-shield-params read-only
  // ========================================================================

  describe("get-shield-params", () => {
    it("returns correct default values (wide-open)", () => {
      const result = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-shield-params", [], deployer);
      const expected = Cl.tuple({
        "max-wallet-percent": Cl.uint(10000),
        "max-tx-percent": Cl.uint(10000),
        "creator": Cl.principal(deployer),
        "minted": Cl.bool(false),
        "amm-contract": Cl.principal(deployer),
      });
      expect(result.result).toBeOk(expected);
    });

    it("returns updated values after tightening", () => {
      simnet.callPublicFn(TOKEN_CONTRACT, "set-shield-params", [Cl.uint(800), Cl.uint(150)], deployer);

      const result = simnet.callReadOnlyFn(TOKEN_CONTRACT, "get-shield-params", [], deployer);
      const expected = Cl.tuple({
        "max-wallet-percent": Cl.uint(800),
        "max-tx-percent": Cl.uint(150),
        "creator": Cl.principal(deployer),
        "minted": Cl.bool(false),
        "amm-contract": Cl.principal(deployer),
      });
      expect(result.result).toBeOk(expected);
    });
  });
});
