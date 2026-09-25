# Microcosm

> **The Commerce OS on OKX X Layer**  
> *Coordinating work, authority, and settlement across humans, organizations, and autonomous software.*  
> *Built for OKX Dev Day 2026*

[![OKX X Layer](https://img.shields.io/badge/Network-OKX_X_Layer_(195/196)-blue.svg)](https://www.okx.com/xlayer)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.30-orange.svg)](https://soliditylang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)
[![FORGE 1.4](https://img.shields.io/badge/FORGE_1.4-Verified_(185_tests)-brightgreen.svg)](forge/PROOF_LEDGER.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

> **Commit capital first. Settle only what is proven.**

Microcosm connects commercial agreements to the conditions under which work is performed, the cryptographic evidence that it was completed, and the value that settles. It provides **Spaces**—durable, non-custodial coordination environments where people, organizations, contractors, evaluators, and autonomous software coordinate work, encumber capital, verify deliverables, and settle USDC on **OKX X Layer**.

Microcosm is the Commerce OS. It is not an unconstrained wallet, an AI chatbot wrapper, a bridge, or a generic project management dashboard. Wallets, applications, and autonomous agents connect to the Space lifecycle.

---

## The Problem: The Commercial Coordination Breakdown

Commercial economic activity is an **asynchronous, multi-stage, multi-party coordination problem** between distrusting actors. Onchain commerce historically breaks down across three fundamental gaps:

1. **The Counterparty Dilemma (Arrow's Information Paradox & Hold-Up)**:
   * A contractor (human developer, data provider, or GPU compute pipeline) cannot afford to expend capital or compute cycles without guaranteed, encumbered funds.
   * A client cannot afford to pay upfront before verifying that the deliverable satisfies the agreed performance rubric.
   * In legacy commerce, this requires 15–25% extractive middlemen (Upwork, Escrow.com, AWS Marketplace) or legal agreements with 60-day payment friction and non-payment risk.

2. **The Disconnect Between Offchain Execution and Onchain Settlement**:
   * Economic work happens offchain (compute, modeling, development, analysis).
   * Capital lives onchain (OKX X Layer).
   * Standard smart contracts are blind to deliverables, performance specifications, and evidence. In legacy crypto, tokens move detached from verifiable proof of work.

3. **The Fragility of Exception Handling**:
   * Real commerce is fraught with exceptions: deliverables fail quality criteria, deadlines lapse, specifications are misunderstood, or deliverables are subjective.
   * Without structured exception coordination, onchain systems collapse: capital is permanently stranded in rigid escrows, buyers steal work by demanding refunds post-delivery, or providers get paid for substandard output.

---

## The Solution: `Space` as the Unified Coordination Primitive

Microcosm eliminates fragmented vocabulary (`Pact`, `Path`, `Envelope`, `Mandate`). **`Space`** is the single external kernel noun. 

A **Space** is a durable, bounded coordination context uniting:

```text
SPACE
  ├─ Treasury Context: Non-custodial USDC balance committed on OKX X Layer
  ├─ Participants: Clients, Contractors, Evaluators, Dispute Courts, Autonomous Delegates
  ├─ Rules & Bounds: Max per-transaction caps, rolling daily velocity, counterparty allowlist
  ├─ Work State Machine: Open → Funded → Submitted → Completed / Rejected / Adjudicating
  ├─ Exception Engine: OpenRails Gaia 100% restitution refunds & Internet Court resolution
  └─ Audit & Provenance: Immutable event stream, EIP-712 attestations & settlement receipts
```

```text
CLIENT / OPERATOR ──┐
CONTRACTOR        ──┼───> [ SPACE COORDINATION CONTEXT ] ───> ONCHAIN FINANCIAL KERNEL (X LAYER)
EVALUATOR / COURT ──┤              (Rules, Work Orders, Escrows)                 │
AUTONOMOUS AGENT  ──┘                                                            ▼
                                                                        ATOMIC USDC SETTLEMENT
```

---

## The Space Commerce Lifecycle

Every commercial engagement inside a Space progresses through an explicit, auditable state machine:

```text
1. WORK ORDER CREATION
   Client & Provider bind a Work Order with explicit budget, deadline & rubricHash.
                            │
                            ▼
2. CAPITAL ENCUMBRANCE (ESCROW)
   Funds are committed on OKX X Layer (Open → Funded).
   Provider has cryptographic proof of guaranteed payment before expending resources.
                            │
                            ▼
3. DELIVERABLE SUBMISSION
   Provider completes work offchain and submits cryptographic proof (deliverableHash + IPFS evidence).
   State transitions to Submitted. Capital CANNOT move without deliverable evidence.
                            │
                            ▼
4. EVALUATION & DISPUTE TRIAGE
                            │
   ┌────────────────────────┼────────────────────────┐
   │                        │                        │
[APPROVED]              [REJECTED]              [CONTESTED]
   │                        │                        │
   ▼                        ▼                        ▼
5a. ATOMIC SETTLEMENT   5b. GAIA EXCEPTION       5c. INTERNET COURT
SettlementRouter        Structured restitution:  Referred to IAdjudicator;
releases USDC to        100% of escrow returned  payouts halted; neutral court
provider on X Layer     to Space treasury;       verdict settles or refunds;
with EIP-712 proof.     $0 capital stranded.     time-lock escape prevents lockup.
```

---

## Authority Model & Boundary Vocabulary

| Surface / Actor | Responsibility in the Space | What It Cannot Claim |
| :--- | :--- | :--- |
| **Space Client / Operator** | Creates Space, commits treasury, establishes spending rules, issues Work Orders | Cannot unilaterally seize or claw back contractor escrows without valid evaluation or court resolution |
| **Provider / Contractor** | Fulfills Work Orders, submits deliverable hashes and IPFS evidence via `work_submit` | Cannot claim escrowed payment without verified deliverable proof and evaluator approval |
| **Evaluator / Adjudicator** | Evaluates deliverables against the agreed rubric, or arbitrates subjective disputes (`IAdjudicator.sol`) | Cannot redirect funds to unapproved counterparties or breach Space daily velocity caps |
| **Autonomous Delegate** | Executes tasks via MCP/API, requests bounded disbursements within Space rules | Cannot bypass Space boundaries, access master private keys, or drain funds outside policy |
| **OKX X Layer Financial Kernel** | Non-custodial contracts execute escrow release, replay protection, and EIP-712 settlement | Cannot release funds without valid deliverable proof and authorized signatures |

### Boundary Vocabulary
* **`INTENT != SETTLEMENT`** — An action request or intent is not an executed onchain transfer.
* **`DELIVERABLE SUBMITTED != ESCROW RELEASED`** — Submitting proof locks evidence onchain; funds release only upon verified evaluation.
* **`WORK REJECTED != CAPITAL LOST`** — Rejected or expired work triggers an OpenRails Gaia exception; 100% of escrow returns to the Space treasury ($0 lost).
* **`DISPUTE != FROZEN CAPITAL`** — Contested deliverables route to an Internet Court (`IAdjudicator.sol`) with time-lock escape hatches preventing stranded escrows.
* **`EIP-712 SIGNATURE != CROSS-CHAIN REPLAYABLE`** — Attestations bind chain ID (195/196) and verifying contract; execution on foreign chains is cryptographically invalid.

---

## Concrete Audited Test Vector

The verified demonstration scenario (`scripts/demo-procurement-space.mjs`) exercises the complete coordination and exception lifecycle with exact numbers:

| Step / Measure | Amount (USDC) | Meaning in the Space |
| :--- | ---:| :--- |
| **Initial Space Treasury** | `$5,000.00` | Committed capital on OKX X Layer |
| **Per-Transaction Cap** | `$500.00` | Bounded disbursement ceiling |
| **Daily Velocity Limit** | `$2,000.00` | Rolling 24-hour spending budget |
| **Work Order #1 (GPU Compute)** | `$350.00` | Compliant work escrow; deliverable verified; settled on X Layer |
| **Adversarial Attempt** | `$900.00` | Out-of-bounds request; deterministically blocked (`DenialProof`) |
| **Work Order #2 (Rejected Work)** | `$200.00` | Quality failure; Gaia exception refunds 100% to Space ($0 lost) |
| **Work Order #3 (Court Dispute)** | `$300.00` | Subjective research; referred to Internet Court; settled upon verdict |
| **Final Space Treasury** | `$4,350.00` | Exactly `$650` settled for verified work; `$0` lost to failure or theft |

---

## Onchain Smart Contracts (OKX X Layer)

Microcosm contracts are compiled with Solidity 0.8.30 for EVM Cancun/Shanghai compatibility on OKX X Layer:

* **`SettlementRouter.sol`**: Nonce-ordered direct settlement with EIP-712 cryptographic attestation and replay defense.
* **`AgenticCommerce.sol`**: Work Order state machine, deliverable proof binding, Gaia restitution refunds, and Internet Court adjudication adapter.
* **`ClaimEscrow.sol`**: Conditional, non-custodial escrow holding funds during active work execution.
* **`EnvelopeRegistry.sol`**: Anchors Space policy commitments and controller key rotations onchain.
* **`IAdjudicator.sol`**: Standard interface for decentralized dispute resolution (compatible with GenLayer Internet Court).

---

## Quickstart & Verification

Microcosm operates under the **FORGE 1.4** control plane. Every component is locally runnable and verifiable without external hidden dependencies:

```bash
# 1. Run full test suite (185 tests: 36 contracts, 20 policy engine, 95 MCP, 23 server, 11 SDK)
make test

# 2. Run contracts suite alone (Foundry)
make test-contracts

# 3. Run Space policy engine tests
npm run test:policy

# 4. Run Model Context Protocol (MCP) server tests
npm run test:mcp

# 5. Run full proof ledger verification gate (Audits 23 claims)
make verify

# 6. Run live 9-step end-to-end commerce simulation
npm run demo
```

---

## Documentation Map

* [`WHITEPAPER.md`](WHITEPAPER.md) — The canonical systems whitepaper: A Commerce Operating System for Human-Agent Economic Coordination.
* [`MILESTONES.md`](MILESTONES.md) — Canonical milestone specification and roadmap (Track 1 Hackathon + Track 2 Full Commerce OS).
* [`AGENTS.md`](AGENTS.md) — Ground rules, FORGE 1.4 control plane, single kernel noun rule.
* [`BUILD_FOUNDRY.md`](BUILD_FOUNDRY.md) — Evidence vocabulary, source-of-truth rules, stop conditions.
* [`Repository_Starter_Virtuous_Build_Cycle.md`](Repository_Starter_Virtuous_Build_Cycle.md) — Engineering governance and build cycle.
* [`forge/PRODUCT.md`](forge/PRODUCT.md) — Product definition and load-bearing mechanisms.
* [`forge/INVARIANTS.md`](forge/INVARIANTS.md) — System invariants that must never break.
* [`forge/ARCHITECTURE.md`](forge/ARCHITECTURE.md) — Detailed technical architecture.
* [`forge/PROOF_LEDGER.md`](forge/PROOF_LEDGER.md) — The 23 audited proof claims and execution commands.
* [`forge/DEMO_SCRIPT.md`](forge/DEMO_SCRIPT.md) — 3-minute video walkthrough script.
* [`forge/SUBMISSION.md`](forge/SUBMISSION.md) — OKX Dev Day 2026 hackathon submission package.
* [`AGENT_HANDOFF.md`](AGENT_HANDOFF.md) — Context and roadmap for incoming engineering agents.
