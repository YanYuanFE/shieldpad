import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const REGISTRY_CONTRACT = "shield-registry";

describe("shield-registry", () => {
  // ========================================================================
  // Token Registration
  // ========================================================================

  describe("register-token", () => {
    it("registers a token with correct data", () => {
      const tokenPrincipal = `${deployer}.shield-token`;
      const poolPrincipal = `${deployer}.shield-amm`;

      const result = simnet.callPublicFn(
        REGISTRY_CONTRACT,
        "register-token",
        [
          Cl.principal(tokenPrincipal),
          Cl.stringAscii("Shield Token"),
          Cl.stringAscii("SHLD"),
          Cl.principal(poolPrincipal),
        ],
        deployer
      );
      // Returns the index (0 for first token)
      expect(result.result).toBeOk(Cl.uint(0));

      // Verify stored data via get-token-info
      const info = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-token-info",
        [Cl.principal(tokenPrincipal)],
        deployer
      );

      // info.result is (ok <tuple>)
      // .value is the ResponseOk inner value (tuple ClarityValue)
      // .value (tuple ClarityValue).value is the object with field keys
      const tupleFields = info.result.value.value;
      expect(tupleFields["name"]).toBeAscii("Shield Token");
      expect(tupleFields["symbol"]).toBeAscii("SHLD");
      expect(tupleFields["creator"]).toBePrincipal(deployer);
      expect(tupleFields["pool-contract"]).toBePrincipal(poolPrincipal);
      // created-at should be a uint (block height at registration time)
      expect(tupleFields["created-at"].type).toBe("uint");
    });

    it("non-deployer cannot register a token", () => {
      const tokenPrincipal = `${deployer}.shield-token`;
      const poolPrincipal = `${deployer}.shield-amm`;

      const result = simnet.callPublicFn(
        REGISTRY_CONTRACT,
        "register-token",
        [
          Cl.principal(tokenPrincipal),
          Cl.stringAscii("Shield Token"),
          Cl.stringAscii("SHLD"),
          Cl.principal(poolPrincipal),
        ],
        wallet1
      );
      expect(result.result).toBeErr(Cl.uint(3001)); // ERR-NOT-AUTHORIZED
    });

    it("fails to register a duplicate token", () => {
      const tokenPrincipal = `${deployer}.shield-token`;
      const poolPrincipal = `${deployer}.shield-amm`;

      // First registration
      simnet.callPublicFn(
        REGISTRY_CONTRACT,
        "register-token",
        [
          Cl.principal(tokenPrincipal),
          Cl.stringAscii("Shield Token"),
          Cl.stringAscii("SHLD"),
          Cl.principal(poolPrincipal),
        ],
        deployer
      );

      // Second registration of same token should fail
      const result = simnet.callPublicFn(
        REGISTRY_CONTRACT,
        "register-token",
        [
          Cl.principal(tokenPrincipal),
          Cl.stringAscii("Shield Token"),
          Cl.stringAscii("SHLD"),
          Cl.principal(poolPrincipal),
        ],
        deployer
      );
      expect(result.result).toBeErr(Cl.uint(3002)); // ERR-ALREADY-REGISTERED
    });
  });

  // ========================================================================
  // Token Count
  // ========================================================================

  describe("get-token-count", () => {
    it("starts at zero", () => {
      const result = simnet.callReadOnlyFn(REGISTRY_CONTRACT, "get-token-count", [], deployer);
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("increments correctly after registrations", () => {
      const poolPrincipal = `${deployer}.shield-amm`;

      // Register first token
      simnet.callPublicFn(
        REGISTRY_CONTRACT,
        "register-token",
        [
          Cl.principal(`${deployer}.shield-token`),
          Cl.stringAscii("Shield Token"),
          Cl.stringAscii("SHLD"),
          Cl.principal(poolPrincipal),
        ],
        deployer
      );

      const count1 = simnet.callReadOnlyFn(REGISTRY_CONTRACT, "get-token-count", [], deployer);
      expect(count1.result).toBeOk(Cl.uint(1));

      // Register second token (using wallet1 address as a different token principal)
      simnet.callPublicFn(
        REGISTRY_CONTRACT,
        "register-token",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Another Token"),
          Cl.stringAscii("ATK"),
          Cl.principal(poolPrincipal),
        ],
        deployer
      );

      const count2 = simnet.callReadOnlyFn(REGISTRY_CONTRACT, "get-token-count", [], deployer);
      expect(count2.result).toBeOk(Cl.uint(2));
    });
  });

  // ========================================================================
  // Token by Index
  // ========================================================================

  describe("get-token-by-index", () => {
    it("returns correct principal for registered tokens", () => {
      const tokenPrincipal = `${deployer}.shield-token`;
      const poolPrincipal = `${deployer}.shield-amm`;

      // Register a token
      simnet.callPublicFn(
        REGISTRY_CONTRACT,
        "register-token",
        [
          Cl.principal(tokenPrincipal),
          Cl.stringAscii("Shield Token"),
          Cl.stringAscii("SHLD"),
          Cl.principal(poolPrincipal),
        ],
        deployer
      );

      // get-token-by-index returns optional, not response
      const result = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-token-by-index",
        [Cl.uint(0)],
        deployer
      );
      expect(result.result).toBeSome(Cl.principal(tokenPrincipal));
    });

    it("returns none for non-existent index", () => {
      const result = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-token-by-index",
        [Cl.uint(999)],
        deployer
      );
      expect(result.result).toBeNone();
    });
  });

  // ========================================================================
  // Shield Score
  // ========================================================================

  describe("get-shield-score", () => {
    it("returns perfect score (100) when all criteria are met", () => {
      // Criteria for perfect score:
      //   +30: is-minted = true
      //   +25: creator-balance <= 5% of supply
      //   +20: max-tx-percent > 0 and <= 200
      //   +15: max-wallet-percent > 0 and <= 1000
      //   +10: lp-locked-until > current block height

      const totalSupply = 1_000_000_000_000n;
      const creatorBalance = 0n; // creator holds 0%
      const lpLockUntil = BigInt(simnet.blockHeight) + 1000n;

      const result = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-shield-score",
        [
          Cl.bool(true),           // is-minted
          Cl.uint(creatorBalance), // creator-balance
          Cl.uint(totalSupply),    // total-supply
          Cl.uint(100),            // max-tx-percent (1%, reasonable)
          Cl.uint(500),            // max-wallet-percent (5%, reasonable)
          Cl.uint(lpLockUntil),    // lp-locked-until
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(100));
    });

    it("returns partial scores", () => {
      // is-minted = true -> +30
      // creator holds 6% (> 5% threshold) -> +0
      // max-tx = 100 (reasonable) -> +20
      // max-wallet = 2000 (> 1000, not reasonable) -> +0
      // lp-locked in past -> +0
      // Total: 50

      const totalSupply = 1_000_000_000_000n;
      const creatorBalance = 60_000_000_000n; // 6%

      const result = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-shield-score",
        [
          Cl.bool(true),           // is-minted (+30)
          Cl.uint(creatorBalance), // > 5% (+0)
          Cl.uint(totalSupply),
          Cl.uint(100),            // reasonable max-tx (+20)
          Cl.uint(2000),           // > 1000, not reasonable (+0)
          Cl.uint(0),              // lp not locked (+0)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(50)); // 30 + 0 + 20 + 0 + 0
    });

    it("returns zero score when no criteria are met", () => {
      const totalSupply = 1_000_000_000_000n;

      const result = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-shield-score",
        [
          Cl.bool(false),        // not minted (+0)
          Cl.uint(totalSupply),  // creator holds 100% (+0)
          Cl.uint(totalSupply),
          Cl.uint(0),            // max-tx disabled (+0)
          Cl.uint(0),            // max-wallet disabled (+0)
          Cl.uint(0),            // LP not locked (+0)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("creator at exactly 5% threshold scores the creator points", () => {
      const totalSupply = 1_000_000_000_000n;
      // creator-balance = total-supply * 500 / 10000 = exactly 5%
      const creatorBalance = totalSupply * 500n / 10000n; // 50,000,000,000

      const result = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-shield-score",
        [
          Cl.bool(false),          // not minted (+0)
          Cl.uint(creatorBalance), // exactly at threshold (+25)
          Cl.uint(totalSupply),
          Cl.uint(0),              // disabled (+0)
          Cl.uint(0),              // disabled (+0)
          Cl.uint(0),              // not locked (+0)
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(25)); // only creator score
    });

    it("max-tx at boundary 200 and max-wallet at boundary 1000 are reasonable", () => {
      const totalSupply = 1_000_000_000_000n;

      const result = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-shield-score",
        [
          Cl.bool(false),
          Cl.uint(totalSupply), // creator holds all -> +0
          Cl.uint(totalSupply),
          Cl.uint(200),         // max-tx exactly at upper bound -> +20
          Cl.uint(1000),        // max-wallet exactly at upper bound -> +15
          Cl.uint(0),           // not locked -> +0
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(35)); // 0 + 0 + 20 + 15 + 0
    });

    it("max-tx at 201 and max-wallet at 1001 are not reasonable", () => {
      const totalSupply = 1_000_000_000_000n;

      const result = simnet.callReadOnlyFn(
        REGISTRY_CONTRACT,
        "get-shield-score",
        [
          Cl.bool(false),
          Cl.uint(totalSupply),
          Cl.uint(totalSupply),
          Cl.uint(201),         // max-tx above threshold -> +0
          Cl.uint(1001),        // max-wallet above threshold -> +0
          Cl.uint(0),
        ],
        deployer
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });
  });
});
