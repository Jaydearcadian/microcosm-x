# ARCHITECTURE — Microcosm on OKX X Layer

## High-Level Topology

```text
               EXISTING WORLD (Where Actors Already Live)
 ┌─────────────────────────────────────────────────────────────┐
 │ Humans (UI / Web / API)       Autonomous Agents (MCP / SDK) │
 └──────────────────────────────┬──────────────────────────────┘
                                │
                        Interface Boundary
                      MCP / REST API / SDK
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                         MICROCOSM                           │
 │                                                             │
 │                      ┌──────────────┐                       │
 │                      │    SPACE     │                       │
 │                      │  container   │                       │
 │                      └──────┬───────┘                       │
 │                             │                               │
 │        ┌────────────────────┴────────────────────┐          │
 │        ▼                                         ▼          │
 │   Space Membership & Rules            Policy & Envelope     │
 │   - People & Agents                   - Max transaction     │
 │   - Roles (Admin, Agent, Viewer)      - Budget & velocity   │
 │   - Counterparty Allowlist            - Expiry / Schedules  │
 └─────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                  SETTLEMENT KERNEL                         │
 │                                                             │
 │   - Authorization & Intent Evaluation                       │
 │   - Payment Lifecycle Machine                               │
 │   - Reversible Escrow Planning                              │
 │   - Structured Receipts & Immutable Ledger                  │
 └─────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │             ONCHAIN SUBSTRATE: OKX X LAYER                  │
 │                                                             │
 │   - Chain ID: 1952 (Testnet) / 196 (Mainnet)                │
 │   - Native USDC Asset Contract                             │
 │   - SettlementRouter.sol (Direct disburse & permit)        │
 │   - ClaimEscrow.sol (Unclaimed / conditional payouts)      │
 │   - EnvelopeRegistry.sol (anchors signed policy envelopes)  │
 └─────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

### 1. Interface Layer (MCP First)
- **Model Context Protocol (MCP)** server exposes clean, domain-appropriate tools:
  - `spaces_list()` / `spaces_get()`
  - `spaces_capabilities(spaceId)`: Informs an agent what it is permitted to do.
  - `payments_request(spaceId, recipient, amount, reason, memo)`
  - `activity_list(spaceId)`
- **No jargon leaking**: The agent interacts with high-level capabilities, not internal cryptographic primitives.

### 2. Space & Policy Engine
- Maintains state for active Spaces.
- Enforces strict constraints:
  - `maxPerTransaction`: hard ceiling on any single disbursement.
  - `spendingLimitPeriod`: rolling daily/weekly budget caps.
  - `allowedCounterparties`: address or verified alias whitelist.
- If all rules pass → generates an approved `PaymentIntent`.
- If any rule fails → generates an auditable `DenialProof`.

### 3. Settlement Kernel
- Converts approved `PaymentIntent` into an onchain settlement transaction.
- Supports gasless execution (relayer-sponsored gas on X Layer) and dual-signature claim escrows.
- Emits standardized `PaymentReceipt` containing full provenance.

### 4. OKX X Layer Settlement
- Deployed Solidity contracts compiled for standard EVM (Cancun / Shanghai):
  - `SettlementRouter.sol`: Routes funds directly to recipients upon presentation of valid EIP-712 authorizations.
  - `ClaimEscrow.sol`: Holds funds for recipients without provisioned wallets until claimed via verified attestation.
