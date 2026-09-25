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

Status vocabulary — claim states follow `AGENTS.md`: `UNTESTED · PARTIAL · FAILED · VERIFIED · REGRESSED`. Blocker states follow the capability states in `BUILD_FOUNDRY.md`: `BLOCKED_EXTERNAL` / `BLOCKED_INTERNAL`. `IN PROGRESS` and `PLANNED` are scheduling labels this document introduces; they are not evidence states and carry no verification meaning.

| Milestone | Scope / Claim | Status | Verification Evidence |
| :--- | :--- | :---: | :--- |
| **M0** | **Onchain Financial Kernel & Invariants** | `VERIFIED` | `make test-contracts` (36 Solidity tests pass) |
| **M1** | **Space Policy Kernel & EIP-712 Attestation** | `VERIFIED` | `npm run test:policy` (15 tests pass, byte-for-byte fixture plus governance EIP-712 checks) |
| **M2** | **Model Context Protocol (MCP) Server** | `VERIFIED` | `npm run test:mcp` (88 tests pass, 30 tools verified) |
| **M3** | **HTTP REST API & Server-Sent Events (SSE)** | `VERIFIED` | `npm run test:server` (M3-1…M3-6 pass: lifecycle, bounds, 422 denials, pagination, live SSE); contract frozen in `docs/API_CONTRACT.md` |
| **M4** | **Persistent Storage Engine (Disk/SQLite)** | `VERIFIED` | `npm run test:server` (M4-1 round-trip + M4-2 SIGKILL survival PASS); atomic JSON snapshots, live box restores on restart |
| **M5** | **Typed Client SDK & Curated Contract ABIs** | `VERIFIED` | `npm --workspace=@microcosm/sdk test` (9/9 client, wizard, and ABI tests pass) |
| **M6** | **Live OKX X Layer Testnet Broadcast & OKLink Verification** | `VERIFIED` | `make deploy-testnet` → 5/5 receipts `status true` on chain 1952, runtime bytecode matches compiled artifacts; all 5 sources `Pass - Verified` on OKLink |
| **M7** | **Charcoal Visual Command Center (Frontend)** | `IN PROGRESS` | Eight operator surfaces (Command, Work, Governance, Delegation, Agent, Sandbox, Onboarding, Audit) under systemd with persistence; Playwright 41/41; credential-free injected-wallet sign-in, session persistence, bearer redemption, mobile overflow, and accessibility semantics verified. Boundary Sandbox shipped: four one-click scenarios run against the live API and are judged on real before/after reads of treasury, escrow, and work-order count, including a compliant control case that really does escrow. Still open: no explicit OKX Wallet connector is configured (M7 says "Connect OKX Wallet" but the app only wires RainbowKit's generic connect button), and literal external-wallet-extension acceptance remains |
| **M8** | **3-Minute Demo Video & OKX Dev Day 2026 Submission** | `IN PROGRESS` | 2:00 film delivered at `evidence/video/microcosm-okx-demo.mp4` (1920x1080, 30fps, -16.4 LUFS), built as a HyperFrames project under `videos/microcosm-commerce-os/` from real captured product surfaces; script in `forge/DEMO_SCRIPT.md`, as-filmed shot list in `forge/DEMO_SHOT_LIST.md`; DevDay submission itself not yet lodged |
| **M9** | **Real-Time Onchain Event Indexer & Reconciliation** | `VERIFIED` | Library: `node --test mcp/test/indexer.test.js` (62/62) covers all indexed lifecycle events, HTTP/WebSocket/injected transports, explicit reconciliation recovery, non-overlapping polling, legacy cursor compatibility, and restart-safe reorg rewind. Deployment: the indexer is now constructed by `microcosm-server.service` against OKX X Layer (chain 1952, `0xCdddCDC4…7Be92a81`), persists its cursor in the snapshot, and reports through `GET /api/spaces/:id/indexer` and the Audit view's chain-indexer panel; historical catch-up runs in committed 20k-block windows. `make test` passes 185/185 |
| **M10** | **Mathematical Authority Attenuation Tree ($B \subseteq A$)** | `VERIFIED` | Focused M10 policy, MCP, REST, SDK, and persistence suites pass; `make test` passes 177/177. This slice proves signed bounded delegation envelopes only; delegated settlement remains out of scope. The Delegation tab exposes the parent envelope beside each child envelope and blocks escalation in the browser before it is sent |
| **M11** | **Continuous Streaming & Usage-Metered Settlement** | `PLANNED` | Phase 2 (Whitepaper Section 8) |
| **M12** | **Multi-Party Threshold Governance (Space Multisig)** | `VERIFIED` | `make test`; governance EIP-712, 2-of-3, session spoofing, idempotency, persistence, and REST/MCP parity tests pass. The Governance tab reads the live quorum, lists the approval queue, signs the exact EIP-712 payload the server issued, and executes at threshold with the settlement hash linked to OKLink |
| **M13** | **Native GenLayer Decentralized Internet Court** | `PLANNED` | Phase 3 (Whitepaper Section 11 & DEC-007) — kept as internal adjudication capability per rebaseline §19; not a product centerpiece (§20) |
| **M14** | **Machine Payments & Protocol Standards (x402, MPP, AP2, A2A)** | `IN PROGRESS` | Four slices: deterministic sanitized capability manifests, offline x402 v2 validation, authenticated session-bound EIP-712 intent lifecycle, and injected-adapter settlement evidence, all passing focused x402 tests and `make test`. The Agent tab publishes the manifest and runs a live x402 probe that shows a compliant payload as ALLOWED and an over-cap payload as REFUSED with the engine's own reason. Real facilitator deployment, HTTP 402, A2A, MPP, and AP2 remain unimplemented |
| **M15** | **Multi-Tenant Enterprise Security & Fine-Grained Privacy** | `PLANNED` | Phase 4 (Whitepaper Section 20 & 21) |
| **M16** | **Cross-Chain Settlement Rails (Circle CCTP / OKX Bridge)** | `PLANNED` | Phase 4 (Whitepaper Section 26) |

---

# Track 1: Production Readiness & Hackathon Deliverables

### Milestone M0: Onchain Financial Kernel & Invariants
* **Claim**: Smart contracts deployable to OKX X Layer enforce atomic USDC settlement, non-custodial conditional escrow, EIP-712 signature verification, deliverable proof binding, Gaia restitution refunds, and Internet Court verdict callbacks without privilege escalation.
* **Contracts**: `SettlementRouter.sol`, `ClaimEscrow.sol`, `AgenticCommerce.sol`, `EnvelopeRegistry.sol`, `IAdjudicator.sol`.
* **Invariants Enforced**: `INV-1` (Atomic Nonce Ordering), `INV-2` (Zero Custodial Risk), `INV-3` (Deliverable Proof Binding), `INV-A1` (EIP-712 Replay Defense), `INV-A2` (Adjudication Integrity).
* **Evidence**: `make test-contracts` passes 36/36 Foundry tests with 0 failures across 5 suites.
* **Limitations**: Local and testnet evidence are recorded separately; contract settlement is verified on X Layer testnet, while broader mainnet production hardening is not in scope.

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
* **Claim**: The system automatically polls and ingests canonical onchain contract events over HTTP or WebSocket transport, reconciling `UNKNOWN` or `PENDING` states without claiming push subscription.
* **Whitepaper Reference**: Section 12 (*State and Finality*) & Section 16 (*System Architecture*).
* **Behavior**:
  * Background worker polls serially over an optional WebSocket transport or HTTP, with injected clients preserved for tests.
  * Ingests `JobCreated`, `ProviderSet`, `BudgetSet`, `AdjudicatorSet`, `RubricSet`, `EvidenceAttached`, `JobFunded`, `JobSubmitted`, `AdjudicationRequested`, `AdjudicationResolved`, `AttestedJobSettlement`, `JobCompleted`, `JobRejected`, `JobExpired`, and `Refunded`.
  * Implements explicit `RECONCILING → RECONCILED` state transitions when network or RPC dropouts occur, with sanitized failure visibility.
  * Detects reorgs from persisted block hashes, restores a hash-verified safe checkpoint, and replays canonical logs after restart.
  * M9 reliability evidence: `node --test mcp/test/indexer.test.js` passes 62/62; the full `make test` gate passes 185/185.

---

### Milestone M10: Mathematical Authority Attenuation Tree ($B \subseteq A$)
* **Claim**: Operators and parent delegates can spawn sub-scoped child agents with strictly diminished authority, mathematically proven by the subset relation $B \subseteq A$.
* **Whitepaper Reference**: Section 6.1 (*Authority Attenuation*).
* **Behavior**:
  * A child agent cannot acquire capabilities, spending caps, or counterparty access exceeding its parent.
  * Delegation tokens are cryptographically bound and verifiable offline.
  * The first slice implements exact six-decimal base-unit cap and daily-budget comparison, counterparty set inclusion, role non-escalation, expiry, nonce, and policy-snapshot binding.
  * `AuthorityDelegation` EIP-712 envelopes are persisted and exposed additively through policy, MCP, authenticated REST, and SDK surfaces.
  * This slice deliberately does not route delegated authority through `/payments` or settlement.
* **Evidence**: `node --test packages/policy-engine/test/delegation.test.js mcp/test/delegation.test.js packages/server/test/delegation.test.js packages/sdk/test/delegation.test.js` (M10-1…M10-9 PASS); `make test` (36 contracts, 20 policy, 94 MCP, 16 server, 11 SDK tests passed; 177 total).

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
  * Requests exceeding the cap enter a durable `PENDING` queue requiring exactly the configured $M$-of-$N$ signer quorum.
  * EIP-712 approvals bind the immutable request, policy snapshot, chain, nonce, and deadline; execution re-checks every non-cap policy rule and settles once through the existing live path.
  * REST, MCP, and SDK expose the same governance operations; REST signer identity is session-derived.
* **Evidence**: `npm run test:policy` (15/15), focused governance MCP/server suites, and `make test` pass. Snapshot round-trip and legacy governance-map compatibility pass in `packages/server/test/governance-persistence.test.js`.

---

### Milestone M13: Native GenLayer Decentralized Internet Court Integration
* **Claim**: Contested or subjective deliverables are arbitrated by a live decentralized Intelligent Contract deployed on GenLayer, replacing the mock adapter with consensus-driven AI/human court verdicts.
* **Whitepaper Reference**: Section 11 (*Execution Loop*) & Section 15 (*Emerging Protocols*).
* **Behavior**:
  * `AgenticCommerce.sol` transfers adjudication authority to a deployed GenLayer contract.
  * GenLayer validators inspect `deliverableHash`, `evidenceUri`, and natural-language `rubricHash`, reaching optimistic consensus before calling `resolveAdjudication`.

---

### Milestone M14: Machine Payments & Protocol Standards (x402, MPP, AP2, A2A)
* **Claim**: Autonomous agents operating within a Space can consume and monetize API services, data streams, and compute using HTTP 402-based machine payment protocols (x402, MPP) and agent protocols (AP2, A2A) under Space-bounded economic authority.
* **Whitepaper Reference**: Section 15 (*Relationship to Emerging Agent Protocols*) & Section 8 (*Money*).
* **Protocol Roles in Microcosm**:
  * **M14 first slice — capability discovery and x402 validation**:
    * `packages/policy-engine/src/capability-manifest.js` publishes the deterministic, sanitized `microcosm.space.capability-manifest/v1` manifest.
    * `mcp/src/x402.js` validates only explicitly selected x402 v2 `PaymentRequired` declarations offline, with exact Space network and configured asset checks, atomic uint256 conversion, bounded timeout, and existing Space policy evaluation.
    * MCP, REST, and SDK expose read-only manifest and x402 validation surfaces. No signing, settlement, facilitator, HTTP 402 route, A2A transport, MPP, or AP2 is included in this slice.
  * **`x402` (Crypto-Native HTTP 402 Pay-Per-Request)**:
    * *Outbound*: An agent hitting an x402-gated API requests an authorized payment intent from its Space. Microcosm evaluates policy, signs the EIP-712 challenge, settles USDC on OKX X Layer, and binds the HTTP receipt to the active Work Order.
    * *Inbound*: A Space can gate its own deliverables, data endpoints, or agentic services behind an x402 paywall, collecting USDC directly into the Space treasury.
  * **`MPP` (Machine Payments Protocol — Stripe & Tempo Standard)**:
    * *Session Budgets*: Ingests MPP session-based payment models. The Space provisions an ephemeral, cryptographically capped spending allowance that an agent can consume across high-frequency API calls without per-call human authorization.
    * *Multi-Rail Compatibility*: Allows agents to settle MPP challenges via OKX X Layer USDC while maintaining full Space audit provenance.
  * **`AP2` (Agent Payments Protocol — Google/W3C Standard)**:
    * Ingests structured payment authorization mandates and Verifiable Credential receipts, connecting them to Space Work Orders.
  * **`A2A` (Agent-to-Agent Protocol)**:
    * Exposes Space capability manifests so external autonomous agents can discover counterparties and negotiate commercial terms peer-to-peer.

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
