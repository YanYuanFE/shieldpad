;; title: shield-amm
;; version: 1.0.0
;; summary: Bonding curve AMM with virtual reserves for Shield token trading
;; description: Allows trading Shield tokens against STX using a constant-product
;;   bonding curve with virtual reserves. Supports graduation (LP lock).

;; ============================================================================
;; Trait Reference (must be at top)
;; ============================================================================

(use-trait sip-010-ft-trait .shield-token.sip-010-trait)

;; ============================================================================
;; Constants
;; ============================================================================

(define-constant CONTRACT-DEPLOYER tx-sender)

;; Error codes
(define-constant ERR-NOT-AUTHORIZED (err u2001))
(define-constant ERR-POOL-ALREADY-EXISTS (err u2002))
(define-constant ERR-POOL-NOT-FOUND (err u2003))
(define-constant ERR-POOL-COMPLETED (err u2004))
(define-constant ERR-INSUFFICIENT-AMOUNT (err u2005))
(define-constant ERR-SLIPPAGE-TOO-HIGH (err u2006))
(define-constant ERR-ZERO-AMOUNT (err u2007))
(define-constant ERR-TRANSFER-FAILED (err u2008))
(define-constant ERR-LP-STILL-LOCKED (err u2009))
(define-constant ERR-ASSET-CHECK-FAILED (err u2010))

;; Fee: 0.3% (3/1000)
(define-constant FEE-NUMERATOR u997)
(define-constant FEE-DENOMINATOR u1000)

;; Default virtual reserves
(define-constant DEFAULT-VIRTUAL-STX u30000000)       ;; 30 STX (6 decimals in micro-STX)
(define-constant DEFAULT-VIRTUAL-TOKENS u800000000000) ;; 800,000 tokens (6 decimals)

;; ============================================================================
;; Data Maps
;; ============================================================================

(define-map bonding-curves
  principal  ;; token contract principal
  {
    virtual-stx-reserves: uint,
    virtual-token-reserves: uint,
    real-stx-reserves: uint,
    real-token-reserves: uint,
    creator: principal,
    complete: bool,
    lp-locked-until: uint,     ;; block height until LP is locked
    max-wallet-percent: uint,  ;; shield param snapshot
    max-tx-percent: uint       ;; shield param snapshot
  }
)

;; ============================================================================
;; Data Variables
;; ============================================================================

(define-data-var pool-count uint u0)

;; ============================================================================
;; Private Functions
;; ============================================================================

;; Calculate tokens out for a given STX input (buy)
;; tokens_out = (FEE_NUM * virtual_token_reserves * stx_in) /
;;              (FEE_DEN * virtual_stx_reserves + FEE_NUM * stx_in)
(define-private (calc-tokens-out (virtual-stx uint) (virtual-tokens uint) (stx-in uint))
  (let
    (
      (numerator (* (* FEE-NUMERATOR virtual-tokens) stx-in))
      (denominator (+ (* FEE-DENOMINATOR virtual-stx) (* FEE-NUMERATOR stx-in)))
    )
    (/ numerator denominator)
  )
)

;; Calculate STX out for a given token input (sell)
;; stx_out = (FEE_NUM * virtual_stx_reserves * tokens_in) /
;;           (FEE_DEN * virtual_token_reserves + FEE_NUM * tokens_in)
(define-private (calc-stx-out (virtual-stx uint) (virtual-tokens uint) (tokens-in uint))
  (let
    (
      (numerator (* (* FEE-NUMERATOR virtual-stx) tokens-in))
      (denominator (+ (* FEE-DENOMINATOR virtual-tokens) (* FEE-NUMERATOR tokens-in)))
    )
    (/ numerator denominator)
  )
)

;; ============================================================================
;; Public Functions
;; ============================================================================

;; Create a new bonding curve pool for a Shield token.
;; The creator transfers real tokens into this contract.
(define-public (create-pool
    (token-contract <sip-010-ft-trait>)
    (token-amount uint)
    (max-wallet uint)
    (max-tx uint)
    (lp-lock-blocks uint)
  )
  (let
    (
      (token-principal (contract-of token-contract))
      (caller tx-sender)
      (lock-until (+ stacks-block-height lp-lock-blocks))
    )
    ;; Ensure pool doesn't already exist
    (asserts! (is-none (map-get? bonding-curves token-principal)) ERR-POOL-ALREADY-EXISTS)
    ;; Must provide tokens
    (asserts! (> token-amount u0) ERR-ZERO-AMOUNT)
    ;; Transfer tokens from creator to this contract.
    ;; In Clarity 4, we use as-contract? with allowances. Since we're receiving
    ;; tokens (not sending), we don't need asset allowances here -- the caller
    ;; sends tokens to the contract using a direct contract-call.
    ;; The token's transfer checks tx-sender == sender, so caller must be sender.
    ;; We use as-contract? with empty allowances just to get the contract principal.
    (let
      (
        (self (try! (as-contract? () tx-sender)))
      )
      (try! (contract-call? token-contract transfer token-amount caller self none))
    )
    ;; Create the bonding curve entry
    (map-set bonding-curves token-principal
      {
        virtual-stx-reserves: DEFAULT-VIRTUAL-STX,
        virtual-token-reserves: (+ DEFAULT-VIRTUAL-TOKENS token-amount),
        real-stx-reserves: u0,
        real-token-reserves: token-amount,
        creator: caller,
        complete: false,
        lp-locked-until: lock-until,
        max-wallet-percent: max-wallet,
        max-tx-percent: max-tx
      }
    )
    ;; Increment pool count
    (var-set pool-count (+ (var-get pool-count) u1))
    ;; Emit event
    (print {
      event: "pool-created",
      token: token-principal,
      creator: caller,
      token-amount: token-amount,
      lp-locked-until: lock-until
    })
    (ok true)
  )
)

;; Buy tokens with STX
(define-public (buy
    (token-contract <sip-010-ft-trait>)
    (stx-amount uint)
    (min-tokens-out uint)
  )
  (let
    (
      (token-principal (contract-of token-contract))
      (pool (unwrap! (map-get? bonding-curves token-principal) ERR-POOL-NOT-FOUND))
      (caller tx-sender)
      (v-stx (get virtual-stx-reserves pool))
      (v-tokens (get virtual-token-reserves pool))
      (r-stx (get real-stx-reserves pool))
      (r-tokens (get real-token-reserves pool))
      (tokens-out (calc-tokens-out v-stx v-tokens stx-amount))
    )
    ;; Pool must not be completed/graduated
    (asserts! (not (get complete pool)) ERR-POOL-COMPLETED)
    ;; Must send some STX
    (asserts! (> stx-amount u0) ERR-ZERO-AMOUNT)
    ;; Slippage check
    (asserts! (>= tokens-out min-tokens-out) ERR-SLIPPAGE-TOO-HIGH)
    ;; Ensure enough real tokens in the pool
    (asserts! (<= tokens-out r-tokens) ERR-INSUFFICIENT-AMOUNT)
    ;; Transfer STX from buyer to this contract
    ;; Use as-contract? with empty allowances to get self address, then transfer
    (let
      (
        (self (try! (as-contract? () tx-sender)))
      )
      (try! (stx-transfer? stx-amount caller self))
    )
    ;; Transfer tokens from this contract to buyer using as-contract? with
    ;; with-all-assets-unsafe since token is dynamic (trait param).
    ;; Inner body must not return a response, so we unwrap with try! inside.
    (try! (as-contract? ((with-all-assets-unsafe))
      (try! (contract-call? token-contract transfer tokens-out tx-sender caller none))
    ))
    ;; Update reserves
    (map-set bonding-curves token-principal
      (merge pool {
        virtual-stx-reserves: (+ v-stx stx-amount),
        virtual-token-reserves: (- v-tokens tokens-out),
        real-stx-reserves: (+ r-stx stx-amount),
        real-token-reserves: (- r-tokens tokens-out)
      })
    )
    ;; Emit event
    (print {
      event: "buy",
      token: token-principal,
      buyer: caller,
      stx-in: stx-amount,
      tokens-out: tokens-out
    })
    (ok tokens-out)
  )
)

;; Sell tokens for STX
(define-public (sell
    (token-contract <sip-010-ft-trait>)
    (token-amount uint)
    (min-stx-out uint)
  )
  (let
    (
      (token-principal (contract-of token-contract))
      (pool (unwrap! (map-get? bonding-curves token-principal) ERR-POOL-NOT-FOUND))
      (caller tx-sender)
      (v-stx (get virtual-stx-reserves pool))
      (v-tokens (get virtual-token-reserves pool))
      (r-stx (get real-stx-reserves pool))
      (r-tokens (get real-token-reserves pool))
      (stx-out (calc-stx-out v-stx v-tokens token-amount))
    )
    ;; Pool must not be completed
    (asserts! (not (get complete pool)) ERR-POOL-COMPLETED)
    ;; Must sell some tokens
    (asserts! (> token-amount u0) ERR-ZERO-AMOUNT)
    ;; Slippage check
    (asserts! (>= stx-out min-stx-out) ERR-SLIPPAGE-TOO-HIGH)
    ;; Ensure enough real STX in the pool
    (asserts! (<= stx-out r-stx) ERR-INSUFFICIENT-AMOUNT)
    ;; Transfer tokens from seller to this contract
    (let
      (
        (self (try! (as-contract? () tx-sender)))
      )
      (try! (contract-call? token-contract transfer token-amount caller self none))
    )
    ;; Transfer STX from this contract to seller
    (try! (as-contract? ((with-stx stx-out))
      (try! (stx-transfer? stx-out tx-sender caller))
    ))
    ;; Update reserves
    (map-set bonding-curves token-principal
      (merge pool {
        virtual-stx-reserves: (- v-stx stx-out),
        virtual-token-reserves: (+ v-tokens token-amount),
        real-stx-reserves: (- r-stx stx-out),
        real-token-reserves: (+ r-tokens token-amount)
      })
    )
    ;; Emit event
    (print {
      event: "sell",
      token: token-principal,
      seller: caller,
      tokens-in: token-amount,
      stx-out: stx-out
    })
    (ok stx-out)
  )
)

;; Mark pool as graduated (complete) - only creator or deployer
(define-public (graduate-pool (token-contract <sip-010-ft-trait>))
  (let
    (
      (token-principal (contract-of token-contract))
      (pool (unwrap! (map-get? bonding-curves token-principal) ERR-POOL-NOT-FOUND))
    )
    (asserts! (or (is-eq tx-sender (get creator pool)) (is-eq tx-sender CONTRACT-DEPLOYER))
              ERR-NOT-AUTHORIZED)
    (asserts! (not (get complete pool)) ERR-POOL-COMPLETED)
    ;; LP lock must have expired
    (asserts! (>= stacks-block-height (get lp-locked-until pool)) ERR-LP-STILL-LOCKED)
    (map-set bonding-curves token-principal
      (merge pool { complete: true })
    )
    (print {
      event: "pool-graduated",
      token: token-principal
    })
    (ok true)
  )
)

;; ============================================================================
;; Read-Only Functions
;; ============================================================================

;; Get current price: STX per token (scaled by 1e6 for precision)
(define-read-only (get-price (token principal))
  (match (map-get? bonding-curves token)
    pool
      (let
        (
          (v-stx (get virtual-stx-reserves pool))
          (v-tokens (get virtual-token-reserves pool))
        )
        ;; price = virtual-stx / virtual-tokens, scaled by 1e6
        (ok (/ (* v-stx u1000000) v-tokens))
      )
    ERR-POOL-NOT-FOUND
  )
)

;; Get full pool info
(define-read-only (get-pool-info (token principal))
  (match (map-get? bonding-curves token)
    pool (ok pool)
    ERR-POOL-NOT-FOUND
  )
)

;; Get pool count
(define-read-only (get-pool-count)
  (ok (var-get pool-count))
)

;; Estimate tokens out for a given STX input
(define-read-only (estimate-buy (token principal) (stx-amount uint))
  (match (map-get? bonding-curves token)
    pool
      (ok (calc-tokens-out
        (get virtual-stx-reserves pool)
        (get virtual-token-reserves pool)
        stx-amount
      ))
    ERR-POOL-NOT-FOUND
  )
)

;; Estimate STX out for a given token input
(define-read-only (estimate-sell (token principal) (token-amount uint))
  (match (map-get? bonding-curves token)
    pool
      (ok (calc-stx-out
        (get virtual-stx-reserves pool)
        (get virtual-token-reserves pool)
        token-amount
      ))
    ERR-POOL-NOT-FOUND
  )
)
