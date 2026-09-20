# Microcosm Milestone & Roadmap Specification
**From First Demonstrable Slice to Full Commerce OS**  
*Governed by: `Repository_Starter_Virtuous_Build_Cycle.md` & `BUILD_FOUNDRY.md`*  
*Canonical Thesis: `WHITEPAPER.md` (Version 0.1 — September 2026)*

---

## Overview

This document defines the complete engineering milestone plan for Microcosm. Following the **Virtuous Build Cycle**, each milestone is defined not by vague aspirations ("build backend"), but by **concrete behavioral claims, invariants, inputs, evidence gates, and explicit limitations**.

The roadmap is structured into two sequential tracks:
1. **Track 1: Production Readiness & Hackathon Scope (Milestones M0 – M8)**: Proves the first complete vertical slice on OKX X Layer, including the persistent HTTP/SSE API, client SDK, testnet deployment, and Charcoal UI.
2. **Track 2: The Full Commerce OS Roadmap (Milestones M9 – M16)**: Realizes the long-term systems thesis outlined in [`WHITEPAPER.md`](WHITEPAPER.md), transforming Microcosm into an industrial-grade operating system for economic activity.

---

## Progress Ledger (Summary of Current Reality)

Status vocabulary strictly adheres to `BUILD_FOUNDRY.md`: `UNTESTED · PARTIAL · FAILED · VERIFIED · REGRESSED · BLOCKED`.

| Milestone | Scope / Claim | Status | Verification Evidence |
| :--- | :--- | :---: | :--- |
| **M0** | **Onchain Financial Kernel & Invariants** | `VERIFIED` | `make test-contracts` (36 Solidity tests pass) |
| **M1** | **Space Policy Kernel & EIP-712 Attestation** | `VERIFIED` | `npm run test:policy` (13 tests pass, byte-for-byte fixture) |
| **M2** | **Model Context Protocol (MCP) Server** | `VERIFIED` | `npm run test:mcp` (14 tests pass, 10 tools verified) |
| **M3** | **HTTP REST API & Server-Sent Events (SSE)** | `IN PROGRESS` | `packages/server` test suite (Pending build) |
| **M4** | **Persistent Storage Engine (Disk/SQLite)** | `IN PROGRESS` | `packages/policy-engine/src/storage` (Pending build) |
| **M5** | **Typed Client SDK & Curated Contract ABIs** | `IN PROGRESS` | `packages/client` test suite (Pending build) |
| **M6** | **Live OKX X Layer Testnet Broadcast & OKLink Verification** | `BLOCKED` | Blocked on funded private key (`EXT-01` in `FAILURES.md`) |
| **M7** | **Charcoal Visual Command Center (Frontend)** | `IN PROGRESS` | User handling full visual implementation |
| **M8** | **3-Minute Demo Video & OKX Dev Day 2026 Submission** | `PLANNED` | Script ready in `forge/DEMO_SCRIPT.md` |
| **M9** | **Real-Time Onchain Event Indexer & Reconciliation** | `PLANNED` | Phase 2 (Whitepaper Section 12) |
| **M10** | **Mathematical Authority Attenuation Tree ($B \subseteq A$)** | `PLANNED` | Phase 2 (Whitepaper Section 6.1) |
| **M11** | **Continuous Streaming & Usage-Metered Settlement** | `PLANNED` | Phase 2 (Whitepaper Section 8) |
| **M12** | **Multi-Party Threshold Governance (Space Multisig)** | `PLANNED` | Phase 3 (Whitepaper Section 5.1) |
| **M13** | **Native GenLayer Decentralized Internet Court** | `PLANNED` | Phase 3 (Whitepaper Section 11 & DEC-007) |
| **M14** | **Standardized Protocol Interoperability (A2A & AP2)** | `PLANNED` | Phase 3 (Whitepaper Section 15) |
| **M15** | **Multi-Tenant Enterprise Security & Fine-Grained Privacy** | `PLANNED` | Phase 4 (Whitepaper Section 20 & 21) |
| **M16** | **Cross-Chain Settlement Rails (Circle CCTP / OKX Bridge)** | `PLANNED` | Phase 4 (Whitepaper Section 26) |

---

# Track 1: Production Readiness & Hackathon Deliverables

### Milestone M0: Onchain Financial Kernel & Invariants
* **Claim**: Smart contracts deployable to OKX X Layer enforce atomic USDC settlement, non-custodial conditional escrow, EIP-712 signature verification, deliverable proof binding, Gaia restitution refunds, and Internet Court verdict callbacks without privilege escalation.
* **Contracts**: `SettlementRouter.sol`, `ClaimEscrow.sol`, `AgenticCommerce.sol`, `EnvelopeRegistry.sol`, `IAdjudicator.sol`.
* **Invariants Enforced**: `INV-1` (Atomic Nonce Ordering), `INV-2` (Zero Custodial Risk), `INV-3` (Deliverable Proof Binding), `INV-A1` (EIP-712 Replay Defense), `INV-A2` (Adjudication Integrity).
* **Evidence**: `make test-contracts` passes 36/36 Foundry tests with 0 failures across 5 suites.
* **Limitations**: Tested on local EVM pre-flight; live testnet broadcast pending funded key.

---

### Milestone M1: Space Policy Kernel & EIP-712 Attestation
* **Claim**: The pure policy engine deterministically bounds agent spending (per-transaction cap, rolling daily velocity, counterparty allowlist), issues structured `DenialProof` artifacts upon violation, and produces EIP-712 authorization digests matching onchain contracts byte-for-byte.
* **Package**: `packages/policy-engine/`.
* **Evidence**: `npm run test:policy` passes 13/13 tests. Test `ATTEST-JS-2` proves offchain digest matches onchain fixture `0x6de0e9235ca74a6f96f11a80d14e386e6969fe4ad84d3a35b802c40b720f3999`.
* **Limitations**: Operates in Node.js runtime memory.

---

### Milestone M2: Model Context Protocol (MCP) Server
* **Claim**: Autonomous agents running in Claude, Cursor, or external scripts can discover Space capabilities, create Work Orders, submit deliverable proofs, evaluate deliverables, request verdicts, and inspect audit activity over standard stdio MCP tools.
* **Package**: `mcp/` exposing 10 tools (`spaces_*`, `work_*`, `payments_*`, `activity_*`).
* **Evidence**: `npm run test:mcp` passes 14/14 tests.
* **Limitations**: Runs over local stdio transport; external cloud agents require local machine to be online.

---

### Milestone M3: HTTP REST API & Server-Sent Events (SSE) Server
* **Claim**: Web applications, external scripts, and backend services can query Spaces, create Work Orders, trigger evaluations, and subscribe to real-time activity streams over standard HTTP and SSE without semantic drift from MCP.
* **Input**: HTTP requests matching canonical Space operations.
* **Behavior**:
  * `GET /api/spaces`, `GET /api/spaces/:id`: Retrieve Space state, rules, and treasury balance.
  * `POST /api/spaces`: Initialize a new Space.
  * `GET /api/spaces/:id/work`, `POST /api/spaces/:id/work`: List and create Work Orders with escrow funding.
  * `POST /api/spaces/:id/work/:jobId/submit`: Record deliverable hash and IPFS evidence URI.
  * `POST /api/spaces/:id/work/:jobId/evaluate`: Evaluator approval (settlement) or rejection (Gaia refund).
  * `POST /api/spaces/:id/work/:jobId/adjudicate`: Internet Court verdict resolution.
  * `POST /api/spaces/:id/payments`: Bounded disbursement request.
  * `GET /api/spaces/:id/activity`: Paginated audit provenance trail.
  * `GET /api/spaces/:id/events`: Real-time Server-Sent Events stream for instant UI updates.
* **Target Invariant**: **Transport must not change semantics**. A REST call and an MCP call produce identical business state.
* **Evidence**: Automated integration suite running full HTTP lifecycle tests.

---

### Milestone M4: Persistent Storage Engine (Disk/SQLite)
* **Claim**: Space state, member rosters, active Work Orders, escrows, and audit provenance survive server restarts and reloads without data loss.
* **Input**: Mutating Space actions.
* **Behavior**: Replaces the ephemeral in-memory `Map()` in `SpaceStore.js` with an atomic file-backed or SQLite storage driver that automatically persists every state change and restores state on startup.
* **Target Invariant**: **State Continuity**. No acknowledged transaction or audit record is dropped upon process exit.
* **Evidence**: Persistence integration test proving state survives full process kill and restart.

---

### Milestone M5: Typed Client SDK & Curated Contract ABIs
* **Claim**: Web frontends and external developers can interact with Microcosm through a typed, zero-friction client library (`MicrocosmClient`) and direct Web3 contract hooks.
* **Package**: Clean client exports providing:
  * Full TypeScript types for Spaces, Work Orders, Deliverables, Receipts, and DenialProofs.
  * Curated, minimal ABI JSON exports for `SettlementRouter`, `AgenticCommerce`, and `ClaimEscrow`.
  * Typed contract call helpers compatible with `ethers`, `viem`, and `wagmi`.
* **Evidence**: SDK unit tests verifying type safety, error parsing, and event subscription helpers.

---

### Milestone M6: Live OKX X Layer Testnet Broadcast & Verification
* **Claim**: All 5 smart contracts are broadcast to OKX X Layer Testnet (Chain ID 195), confirmed onchain, and source code verified on OKLink Explorer.
* **Script**: `contracts/script/DeployXLayer.s.sol`.
* **Evidence**:
  * Broadcast transaction receipts confirmed with status `0x1` on OKX X Layer RPC (`https://xlayertestrpc.okx.com`).
  * Live contract addresses verified on OKLink (`https://www.oklink.com/xlayer-test`).
  * Addresses committed to `deployments/xlayer-testnet.json` and recorded in `forge.json`.
* **Blocker**: Pending funded private key with testnet OKB (`EXT-01`).

---

### Milestone M7: Charcoal Visual Command Center (Frontend)
* **Claim**: A production-grade, minimalist dark-mode Web UI provides humans and operators with complete visibility and interactive control over Spaces, Work Orders, and onchain settlement.
* **Owner**: User-led visual implementation.
* **Design Language**: Minimalist Swiss horology / tactile industrial instrument (Pinterest reference `https://pin.it/3ZHTs6kFS`), featuring the central radial velocity dial, segmented authority meters, and 1px circular wireframe action nodes.
* **Connected Surfaces**:
  * Landing page with interactive hero boundary dial.
  * Onboarding wizard (Connect OKX Wallet $\to$ Create Space $\to$ Set Bounds).
  * Space Command Center (Radial HUD, policy matrix, bound agents).
  * Work Order Kanban (`Open → Funded → Submitted → Completed / Rejected / Adjudicating`).
  * Boundary Sandbox (1-click judge demonstration triggers).
  * Audit Provenance Stream.

---

### Milestone M8: 3-Minute Demo Video & Hackathon Submission Wrap
* **Claim**: Video walkthrough demonstrates live execution on OKX X Layer following `forge/DEMO_SCRIPT.md`; hackathon submission is formally lodged for OKX Dev Day 2026.
* **Evidence**: Hosted video URL and submission confirmation in `forge/SUBMISSION.md`.

---

# Track 2: The Full Commerce OS Roadmap (Whitepaper v0.1 Scope)

### Milestone M9: Real-Time Onchain Event Indexer & Reconciliation Worker
* **Claim**: The system automatically detects and ingests onchain contract events on OKX X Layer, eliminating polling and reconciling `UNKNOWN` or `PENDING` states into canonical economic truth.
* **Whitepaper Reference**: Section 12 (*State and Finality*) & Section 16 (*System Architecture*).
* **Behavior**:
  * Background worker maintains WebSocket connection to OKX X Layer RPC.
  * Ingests `JobCreated`, `JobFunded`, `DeliverableSubmitted`, `JobCompleted`, `JobRejected`, `AdjudicationRequested`, `AdjudicationResolved`.
  * Implements explicit `RECONCILING → RECONCILED` state transitions when network or RPC dropouts occur.

---

### Milestone M10: Mathematical Authority Attenuation Tree ($B \subseteq A$)
* **Claim**: Operators and parent delegates can spawn sub-scoped child agents with strictly diminished authority, mathematically proven by the subset relation $B \subseteq A$.
* **Whitepaper Reference**: Section 6.1 (*Authority Attenuation*).
* **Behavior**:
  * A child agent cannot acquire capabilities, spending caps, or counterparty access exceeding its parent.
  * Delegation tokens are cryptographically bound and verifiable offline.

---

### Milestone M11: Continuous Streaming & Usage-Metered Settlement
* **Claim**: Spaces can escrow capital for long-running services (GPU clusters, live data feeds) and meter settlement continuously by second or byte consumed, with instant residual refund when the stream closes.
* **Whitepaper Reference**: Section 8 (*Money*) & Section 26 (*The Commerce OS*).
* **Behavior**:
  * Ingests OpenRails continuous Paycard Streaming into `AgenticCommerce.sol`.
  * Unused escrow balance automatically returns to Space balance upon stream termination ($0 stranded capital).

---

### Milestone M12: Multi-Party Threshold Governance (Space Multisig & Quorums)
* **Claim**: High-value disbursements and critical Space rule modifications require multi-signature approval from designated human operators before onchain release.
* **Whitepaper Reference**: Section 5.1 (*People*) & Section 20 (*Security Model*).
* **Behavior**:
  * Autonomous agents can operate freely below the per-transaction cap ($500).
  * Requests exceeding the cap enter a `PENDING_APPROVAL` queue requiring $M$-of-$N$ human signers via EIP-712 or smart accounts.

---

### Milestone M13: Native GenLayer Decentralized Internet Court Integration
* **Claim**: Contested or subjective deliverables are arbitrated by a live decentralized Intelligent Contract deployed on GenLayer, replacing the mock adapter with consensus-driven AI/human court verdicts.
* **Whitepaper Reference**: Section 11 (*Execution Loop*) & Section 15 (*Emerging Protocols*).
* **Behavior**:
  * `AgenticCommerce.sol` transfers adjudication authority to a deployed GenLayer contract.
  * GenLayer validators inspect `deliverableHash`, `evidenceUri`, and natural-language `rubricHash`, reaching optimistic consensus before calling `resolveAdjudication`.

---

### Milestone M14: Standardized Protocol Interoperability (A2A & AP2)
* **Claim**: External autonomous agents can negotiate commercial terms via A2A protocol and submit payment authorizations via AP2 mandates directly into the Space.
* **Whitepaper Reference**: Section 15 (*Relationship to Emerging Agent Protocols*).
* **Behavior**:
  * Exposes A2A capability manifests so external agents discover Space counterparties.
  * Accepts AP2 payment authorization mandates and translates them into Space-compliant settlement intents.

---

### Milestone M15: Multi-Tenant Enterprise Security & Fine-Grained Privacy
* **Claim**: Organizations can operate multiple isolated Spaces with granular role-based access control, cryptographic commitment masks for sensitive deliverables, and departmental sub-treasuries.
* **Whitepaper Reference**: Section 21 (*Privacy*) & Section 26 (*The Commerce OS*).
* **Behavior**:
  * Zero-knowledge or commitment-masked evidence hashes prevent public leakage of proprietary contractor IP.
  * Cross-Space authorization allows Department A to fund Work in Department B without sharing full ledger history.

---

### Milestone M16: Cross-Chain Settlement Rails (Circle CCTP & OKX Bridge)
* **Claim**: A Space anchored on OKX X Layer can coordinate work that settles in native USDC across foreign networks (Ethereum, Arbitrum, Base) via Circle CCTP V2 and OKX Bridge infrastructure without losing coordination provenance.
* **Whitepaper Reference**: Section 8 (*Money*) & Section 36 (*Endgame*).
* **Behavior**:
  * Space maintains canonical coordination context on OKX X Layer.
  * Cross-chain routing instructions disburse settlement on the target execution domain, binding the external receipt back to the Space.

---

## Governance & Maintenance

* This milestone document is maintained under version control at [`MILESTONES.md`](MILESTONES.md).
* Every milestone transition from `IN PROGRESS` to `VERIFIED` must be accompanied by executed CLI evidence recorded in [`forge/PROOF_LEDGER.md`](forge/PROOF_LEDGER.md).
* When a blocker is encountered (such as `M6` testnet key), it must be recorded under [`forge/FAILURES.md`](forge/FAILURES.md) rather than obscured.
