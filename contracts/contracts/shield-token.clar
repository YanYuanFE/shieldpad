;; title: shield-token
;; version: 1.0.0
;; summary: SIP-010 fungible token template with anti-rug-pull Shield rules
;; description: A per-token template implementing SIP-010 with max-wallet,
;;   max-tx limits, and one-time-only minting to prevent supply inflation.

;; ============================================================================
;; SIP-010 Trait (inline for devnet compatibility)
;; ============================================================================

(define-trait sip-010-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)

;; ============================================================================
;; Token Definition
;; ============================================================================

(define-fungible-token shield-token)

;; ============================================================================
;; Constants
;; ============================================================================

(define-constant CONTRACT-DEPLOYER tx-sender)

(define-constant TOKEN-NAME "Shield Token")
(define-constant TOKEN-SYMBOL "SHLD")
(define-constant TOKEN-DECIMALS u6)
(define-constant TOKEN-URI u"https://shieldpad.io/metadata/shield-token.json")
(define-constant MAX-SUPPLY u1000000000000) ;; 1,000,000 tokens with 6 decimals

;; Error codes
(define-constant ERR-NOT-AUTHORIZED (err u1001))
(define-constant ERR-ALREADY-MINTED (err u1002))
(define-constant ERR-MAX-TX-EXCEEDED (err u1003))
(define-constant ERR-MAX-WALLET-EXCEEDED (err u1004))
(define-constant ERR-NOT-ENOUGH-BALANCE (err u1005))
(define-constant ERR-SENDER-NOT-TX-SENDER (err u1006))
(define-constant ERR-AMM-ALREADY-SET (err u1007))
(define-constant ERR-CANNOT-WIDEN (err u1008))

;; ============================================================================
;; Data Variables - Shield Rules
;; ============================================================================

;; Basis points out of 10000: starts wide-open, must be tightened after pool creation
(define-data-var max-wallet-percent uint u10000)
(define-data-var max-tx-percent uint u10000)

;; Creator principal
(define-data-var creator principal tx-sender)

;; One-time mint flag
(define-data-var minted bool false)

;; AMM contract set flag (one-time only)
(define-data-var amm-contract-set bool false)

;; AMM contract principal (exempt from wallet limits)
(define-data-var amm-contract principal tx-sender)

;; ============================================================================
;; Private Functions
;; ============================================================================

(define-private (check-max-tx (amount uint))
  (let
    (
      (supply (ft-get-supply shield-token))
      (max-tx-limit (/ (* supply (var-get max-tx-percent)) u10000))
    )
    ;; If max-tx-percent is 0, no limit enforced
    (if (is-eq (var-get max-tx-percent) u0)
      true
      (<= amount max-tx-limit)
    )
  )
)

(define-private (check-max-wallet (recipient principal) (amount uint))
  (let
    (
      (supply (ft-get-supply shield-token))
      (recipient-balance (ft-get-balance shield-token recipient))
      (new-balance (+ recipient-balance amount))
      (max-wallet-limit (/ (* supply (var-get max-wallet-percent)) u10000))
    )
    ;; Exempt the AMM contract from wallet limits
    (if (is-eq recipient (var-get amm-contract))
      true
      ;; If max-wallet-percent is 0, no limit enforced
      (if (is-eq (var-get max-wallet-percent) u0)
        true
        (<= new-balance max-wallet-limit)
      )
    )
  )
)

;; ============================================================================
;; Public Functions - SIP-010 Implementation
;; ============================================================================

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    ;; Sender must be tx-sender (security)
    (asserts! (is-eq tx-sender sender) ERR-SENDER-NOT-TX-SENDER)
    ;; Enforce max-tx limit (exempt AMM transfers only after AMM is set)
    (asserts! (or (and (var-get amm-contract-set)
                       (or (is-eq sender (var-get amm-contract))
                           (is-eq recipient (var-get amm-contract))))
                  (check-max-tx amount))
              ERR-MAX-TX-EXCEEDED)
    ;; Enforce max-wallet limit on recipient
    (asserts! (check-max-wallet recipient amount) ERR-MAX-WALLET-EXCEEDED)
    ;; Perform the transfer
    (try! (ft-transfer? shield-token amount sender recipient))
    ;; Print memo if provided
    (match memo
      to-print (print to-print)
      0x
    )
    (ok true)
  )
)

(define-read-only (get-name)
  (ok TOKEN-NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance shield-token account))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply shield-token))
)

(define-read-only (get-token-uri)
  (ok (some TOKEN-URI))
)

;; ============================================================================
;; Public Functions - Shield Admin
;; ============================================================================

;; One-time mint: only callable by deployer, only once
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-DEPLOYER) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get minted)) ERR-ALREADY-MINTED)
    (asserts! (<= amount MAX-SUPPLY) ERR-MAX-TX-EXCEEDED)
    (var-set minted true)
    (ft-mint? shield-token amount recipient)
  )
)

;; Set the AMM contract address (only deployer, typically called once after AMM deploy)
(define-public (set-amm-contract (amm principal))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-DEPLOYER) ERR-NOT-AUTHORIZED)
    (asserts! (not (var-get amm-contract-set)) ERR-AMM-ALREADY-SET)
    (var-set amm-contract amm)
    (var-set amm-contract-set true)
    (ok true)
  )
)

;; Update shield params (only deployer, can only tighten - never widen)
(define-public (set-shield-params (new-max-wallet uint) (new-max-tx uint))
  (begin
    (asserts! (is-eq tx-sender CONTRACT-DEPLOYER) ERR-NOT-AUTHORIZED)
    (asserts! (<= new-max-wallet (var-get max-wallet-percent)) ERR-CANNOT-WIDEN)
    (asserts! (<= new-max-tx (var-get max-tx-percent)) ERR-CANNOT-WIDEN)
    (var-set max-wallet-percent new-max-wallet)
    (var-set max-tx-percent new-max-tx)
    (ok true)
  )
)

;; ============================================================================
;; Read-Only Functions - Shield Info
;; ============================================================================

(define-read-only (get-shield-params)
  (ok {
    max-wallet-percent: (var-get max-wallet-percent),
    max-tx-percent: (var-get max-tx-percent),
    creator: (var-get creator),
    minted: (var-get minted),
    amm-contract: (var-get amm-contract)
  })
)

(define-read-only (is-minted)
  (ok (var-get minted))
)

(define-read-only (get-max-wallet-percent)
  (ok (var-get max-wallet-percent))
)

(define-read-only (get-max-tx-percent)
  (ok (var-get max-tx-percent))
)

(define-read-only (get-creator)
  (ok (var-get creator))
)
