;; title: shield-registry
;; version: 1.0.0
;; summary: Token registry with Shield Score calculation
;; description: Maintains a registry of Shield tokens and computes a safety
;;   score (0-100) based on anti-rug-pull parameters.

;; ============================================================================
;; Constants
;; ============================================================================

(define-constant CONTRACT-DEPLOYER tx-sender)

;; Error codes
(define-constant ERR-NOT-AUTHORIZED (err u3001))
(define-constant ERR-ALREADY-REGISTERED (err u3002))
(define-constant ERR-NOT-REGISTERED (err u3003))
(define-constant ERR-POOL-NOT-FOUND (err u3004))

;; ============================================================================
;; Data Variables
;; ============================================================================

(define-data-var token-count uint u0)

;; ============================================================================
;; Data Maps
;; ============================================================================

(define-map registered-tokens
  principal  ;; token contract principal
  {
    name: (string-ascii 32),
    symbol: (string-ascii 10),
    creator: principal,
    created-at: uint,       ;; block height at registration
    pool-contract: principal ;; which AMM pool contract
  }
)

;; Index map: token ID -> token principal (for enumeration)
(define-map token-by-index
  uint
  principal
)

;; ============================================================================
;; Public Functions
;; ============================================================================

;; Register a new token (called by anyone - typically by the creator or AMM)
(define-public (register-token
    (token-principal principal)
    (name (string-ascii 32))
    (symbol (string-ascii 10))
    (pool-contract principal)
  )
  (let
    (
      (caller tx-sender)
      (current-count (var-get token-count))
    )
    ;; Only deployer can register tokens
    (asserts! (is-eq tx-sender CONTRACT-DEPLOYER) ERR-NOT-AUTHORIZED)
    ;; Token must not already be registered
    (asserts! (is-none (map-get? registered-tokens token-principal)) ERR-ALREADY-REGISTERED)
    ;; Register the token
    (map-set registered-tokens token-principal
      {
        name: name,
        symbol: symbol,
        creator: caller,
        created-at: stacks-block-height,
        pool-contract: pool-contract
      }
    )
    ;; Store index mapping
    (map-set token-by-index current-count token-principal)
    ;; Increment count
    (var-set token-count (+ current-count u1))
    ;; Emit event
    (print {
      event: "token-registered",
      token: token-principal,
      name: name,
      symbol: symbol,
      creator: caller,
      index: current-count
    })
    (ok current-count)
  )
)

;; ============================================================================
;; Read-Only Functions
;; ============================================================================

;; Get token registration info
(define-read-only (get-token-info (token principal))
  (match (map-get? registered-tokens token)
    info (ok info)
    ERR-NOT-REGISTERED
  )
)

;; Get total registered token count
(define-read-only (get-token-count)
  (ok (var-get token-count))
)

;; Get token principal by index
(define-read-only (get-token-by-index (index uint))
  (map-get? token-by-index index)
)

;; ============================================================================
;; Shield Score Calculation (0-100)
;; ============================================================================
;;
;; Scoring breakdown:
;;   +30  if no further minting possible (minted flag = true)
;;   +25  if creator holds <= 5% of supply
;;   +20  if max-tx-percent is reasonable (> 0 and <= 200 = 2%)
;;   +15  if max-wallet-percent is reasonable (> 0 and <= 1000 = 10%)
;;   +10  if LP is time-locked (lp-locked-until > current block height)
;;
;; This function takes pre-fetched parameters to stay read-only and avoid
;; cross-contract calls (which aren't allowed in read-only in Clarity).
;; The frontend/caller fetches token + pool data and passes it in.

(define-read-only (get-shield-score
    (is-minted bool)
    (creator-balance uint)
    (total-supply uint)
    (max-tx-percent uint)
    (max-wallet-percent uint)
    (lp-locked-until uint)
  )
  (let
    (
      ;; +30 if no mint function available (minted = true means no more minting)
      (score-mint (if is-minted u30 u0))

      ;; +25 if creator holds <= 5% of supply
      ;; creator_balance <= total_supply * 500 / 10000
      (creator-threshold (/ (* total-supply u500) u10000))
      (score-creator (if (<= creator-balance creator-threshold) u25 u0))

      ;; +20 if max-tx-percent is set and reasonable (> 0 and <= 200)
      (score-tx (if (and (> max-tx-percent u0) (<= max-tx-percent u200)) u20 u0))

      ;; +15 if max-wallet-percent is set and reasonable (> 0 and <= 1000)
      (score-wallet (if (and (> max-wallet-percent u0) (<= max-wallet-percent u1000)) u15 u0))

      ;; +10 if LP is time-locked (lp-locked-until > current block height)
      (score-lp (if (> lp-locked-until stacks-block-height) u10 u0))
    )
    (ok (+ score-mint (+ score-creator (+ score-tx (+ score-wallet score-lp)))))
  )
)

;; Convenience: get all token info combined (registration + score inputs)
;; Returns registration data; caller computes score with get-shield-score
(define-read-only (get-all-token-info (token principal))
  (match (map-get? registered-tokens token)
    info
      (ok {
        name: (get name info),
        symbol: (get symbol info),
        creator: (get creator info),
        created-at: (get created-at info),
        pool-contract: (get pool-contract info),
        token-principal: token
      })
    ERR-NOT-REGISTERED
  )
)

;; Helper: compute score from on-chain data by providing the token + pool info
;; This is a "view" that the frontend calls with all data pre-assembled.
;; For a fully integrated version, the frontend:
;;   1. Calls shield-token.get-shield-params -> {minted, max-wallet-percent, max-tx-percent}
;;   2. Calls shield-token.get-balance(creator) -> creator-balance
;;   3. Calls shield-token.get-total-supply -> total-supply
;;   4. Calls shield-amm.get-pool-info(token) -> {lp-locked-until, ...}
;;   5. Calls this get-shield-score with all values
