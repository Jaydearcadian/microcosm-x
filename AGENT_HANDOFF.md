# AGENT HANDOFF — Microcosm on OKX X Layer
**Engineering Briefing, Source of Truth, and Resumption Guide**  
*Target Hackathon: OKX Dev Day 2026 (Track: "Build a Company")*  
*Repository: https://github.com/Jaydearcadian/microcosm-x.git (Branch: main)*

---

## 1. Executive Briefing for the Incoming Agent

You are taking over lead engineering on **Microcosm**. Read this document completely before taking any action.

### What Microcosm Is
* **Microcosm is the Commerce OS on OKX X Layer.**
* It coordinates commercial work, authority, and settlement across **humans, organizations, contractors, evaluators, and autonomous software delegates**.
* **Do NOT make Microcosm "agent-only" or an "agent guardrail".** Autonomous agents are simply one class of participant operating inside a Space. Microcosm is a full-lifecycle commercial coordination protocol.
* **Single Unifying Kernel Noun**: **`Space`**. 
  * Do not leak legacy OpenRails jargon (`Pact`, `Path`, `Envelope`, `Workspace`, `RailsCard`, `RailsFlow`) into user-facing or agent-facing surfaces. 
  * The API and mental model revolves entirely around **`Space`** (`spaces.create`, `spaces.fund`, `spaces.setRules`, `work_create`, `work_submit`, `work_evaluate`).
* **Core Axiom**: **`Commit capital first. Settle only what is proven.`**

---

## 2. Governing Documents & Source of Truth Hierarchy

When reasoning about this codebase, the following hierarchy of truth is strictly enforced (per `AGENTS.md`):

1. **Code & Contracts (Ultimate Authority)**: What tests actually prove in `contracts/`, `packages/policy-engine/`, and `mcp/`.
2. [`WHITEPAPER.md`](WHITEPAPER.md) (or [`docs/whitepaper/MICROCOSM_WHITEPAPER_v0.1.md`](docs/whitepaper/MICROCOSM_WHITEPAPER_v0.1.md)):
   * **The Canonical Systems Thesis**: *A Commerce Operating System for Human-Agent Economic Coordination*.
   * **Mandate**: Read this first to understand the long-term systems thesis: the problem of commercial fragmentation across systems, the `Space` as the unified operating context connecting `who → did what → for whom → under what authority → according to which rules → with what economic consequence`, contextual authority, and why Microcosm is not merely a wallet, workflow engine, or payment protocol.
3. [`MILESTONES.md`](MILESTONES.md) (or [`docs/canonical/ROADMAP_AND_MILESTONES.md`](docs/canonical/ROADMAP_AND_MILESTONES.md)):
   * **The Milestone & Roadmap Specification**: Tracks Track 1 (Production Readiness M0–M8) and Track 2 (Full Commerce OS M9–M16), defining exact behavioral claims, invariants, inputs, and evidence gates.
4. [`AGENTS.md`](AGENTS.md): Ground rules, non-negotiable status vocabulary (`UNTESTED · PARTIAL · FAILED · VERIFIED · REGRESSED`), and local verification commands.
5. [`Repository_Starter_Virtuous_Build_Cycle.md`](Repository_Starter_Virtuous_Build_Cycle.md):
   * **Mandate**: Acts as the project's engineering operating system.
   * **The 10-Phase Cycle**: `Discover → Define → Design → Implement → Verify → Evidence → Document → Review → Integrate → Reassess`.
   * **Strictly Rejected Anti-Patterns**:
     * *README-Driven Fiction*: Never describe architecture or behavior the code does not contain.
     * *Architecture Theatre*: Do not create speculative, empty folders for unbuilt components.
     * *Success-State Collapse*: Never treat `SUBMITTED` as `SETTLED`.
     * *Integration by Naming*: Never list an integration or partner without executed CLI evidence.
6. [`BUILD_FOUNDRY.md`](BUILD_FOUNDRY.md):
   * **Mandate**: Strict evidence vocabulary, proof ledger integrity, and stop conditions.
   * **Allowed Statuses**: Only use `UNTESTED · PARTIAL · FAILED · VERIFIED · REGRESSED`.
   * **Stop Conditions**: If a test or gate fails, never weaken the assertion to pass. Fix the implementation or log it under [`forge/FAILURES.md`](forge/FAILURES.md).
7. [`/forge`](forge/): The FORGE 1.4 control plane:
   * [`forge/PRODUCT.md`](forge/PRODUCT.md) — Product definition and load-bearing mechanisms.
   * [`forge/INVARIANTS.md`](forge/INVARIANTS.md) — System invariants that must never break (e.g. INV-1 through INV-6, INV-A1, INV-A2).
   * [`forge/ARCHITECTURE.md`](forge/ARCHITECTURE.md) — Architectural decomposition.
   * [`forge/PROOF_LEDGER.md`](forge/PROOF_LEDGER.md) — The 23 audited proof claims with exact CLI evidence.
   * [`forge/FAILURES.md`](forge/FAILURES.md) — Honest limitation tracking (e.g. `EXT-01` testnet key blocked).
   * [`forge/DEMO_SCRIPT.md`](forge/DEMO_SCRIPT.md) — 3-minute video walkthrough script.
   * [`forge/SUBMISSION.md`](forge/SUBMISSION.md) — Official hackathon submission package.
6. [`docs/canonical/`](docs/canonical/):
   * [`docs/canonical/CURRENT_STATE.md`](docs/canonical/CURRENT_STATE.md) — State of the codebase.
   * [`docs/canonical/DECISIONS.md`](docs/canonical/DECISIONS.md) — Architecture Decision Records (DEC-001 through DEC-007).
7. **Core Operational Skills (Vendored in [`skills/`](skills/))**:
   * [`skills/onchain-systems-engineering/`](skills/onchain-systems-engineering/SKILL.md): The discipline governing smart contract invariants, adversarial fuzzing, non-custodial escrow security, and OKX X Layer execution boundaries.
   * [`skills/system-wholeness/`](skills/system-wholeness/SKILL.md): The discipline governing flow continuity, identity continuity, and consistent truth across contracts, policy runtime, MCP tools, and the upcoming Charcoal UI.

---

## 3. The Two Governing Skills & How to Apply Them

The repository vendors two foundational skills in [`skills/`](skills/). The incoming agent must actively consult and apply them:

### A. `onchain-systems-engineering` ([`skills/onchain-systems-engineering/SKILL.md`](skills/onchain-systems-engineering/SKILL.md))
* **When to use**: When evaluating, auditing, or touching contracts, cryptographic attestations, or onchain settlement flows.
* **Core Mandate**: 
  * Never accept "the code compiles" as evidence.
  * Rigorously enforce state machine transitions, replay protections (EIP-712 domain binding to Chain ID 195/196 and verifying contract address), non-reentrancy, and invariant preservation.
  * Protect the core invariant: **Money never moves without verified deliverable proof and valid Space authorization.**

### B. `system-wholeness` ([`skills/system-wholeness/SKILL.md`](skills/system-wholeness/SKILL.md))
* **When to use**: When building the upcoming Charcoal UI, expanding MCP tools, or connecting interfaces.
* **Core Mandate**:
  * Ensure **one coherent system** where the UI, MCP server, runtime store, and onchain contracts tell the exact same truth.
  * **The 5 Wholeness Invariants must never break**:
    1. *Flow Continuity*: What the Space policy engine approves is what the X Layer router consumes.
    2. *Identity Continuity*: `spaceId`, `jobId`, `deliverableHash`, and `txHash` remain unbroken across MCP, contracts, and the UI.
    3. *State Continuity*: Every state transition (`Open → Funded → Submitted → Completed / Rejected / Adjudicating`) is deterministic and provable.
    4. *Terminal Outcome*: No work order or escrow can be left in an ambiguous, unhandled, or permanently stranded state.
    5. *Consistent Truth*: The UI must directly drive and reflect real protocol states—never build a disconnected, superficial mockup skin.

---

## 4. Current Verified Engineering State

Every component is runnable and verified locally:

```text
======================================================================
  VERIFICATION GATES — 100% GREEN (make test && make verify)
======================================================================
Contracts (Foundry)   : 36 tests passed (5 suites, 0 failed)
Policy Engine (Node)  : 13 tests passed (100% branch coverage)
MCP Server (Node)     : 14 tests passed (10 tools verified)
Total Test Suite      : 63 passed, 0 failed
Proof Ledger Audit    : 23 / 23 claims VERIFIED (forge/PROOF_LEDGER.md)
End-to-End Simulation : 9 / 9 steps passing live (scripts/demo-procurement-space.mjs)
Remote Git Origin     : https://github.com/Jaydearcadian/microcosm-x.git (synced on main)
```

### Essential CLI Commands
```bash
make test             # Run entire test suite (contracts + policy + MCP)
make test-contracts   # Run Foundry suite alone
make verify           # Full gate: lint + test + proof ledger audit
npm run demo          # Run the 9-step live commerce lifecycle demo
```

---

## 4. Key Architectural Decisions Established

* **DEC-001 (Space as Single Noun)**: Maximum UX, minimum language crowding.
* **DEC-004 (OpenRails Financial Kernel Absorbed)**: `SettlementRouter.sol`, `ClaimEscrow.sol`, `EnvelopeRegistry.sol`, and `AgenticCommerce.sol` live directly in `contracts/src/`.
* **DEC-005 (First-Class Work Lifecycle & Gaia Exceptions)**: Work orders follow `Open → Funded → Submitted → Completed / Rejected / Adjudicating`. Rejection or deadline expiry triggers a Gaia exception refunding 100% of escrow to the Space treasury ($0 lost).
* **DEC-006 (EIP-712 Attestation)**: Settles against domain `Microcosm / 1 / chainId / verifyingContract`. Pure JS encoder in `packages/policy-engine/src/attestation.js` matches the onchain verifier byte-for-byte (`0x6de0e9235ca74a6f96f11a80d14e386e6969fe4ad84d3a35b802c40b720f3999`).
* **DEC-007 (Internet Court Adjudication)**: Replaced ad-hoc LLM quorums with the clean `IAdjudicator.sol` adapter (GenLayer compatible). Contested deliverables halt payouts in `Adjudicating` state until the court posts a verdict. Time-lock escape hatches prevent stranded escrows.

---

## 5. Frontend & UI Direction: The Charcoal Instrument System

The user has explicitly selected the UI direction, referencing:  
👉 **Pinterest Reference**: [`https://pin.it/3ZHTs6kFS`](https://pin.it/3ZHTs6kFS)  
👉 **Saved Concept Mockup**: [`evidence/charcoal_ui_concept.jpg`](evidence/charcoal_ui_concept.jpg)

### Design Language Specifications
* **Aesthetic**: Minimalist Swiss horology / tactile industrial instrument (Braun, Dieter Rams, Teenage Engineering). Radical reductionism.
* **Palette**:
  * Canvas / Base: `#1A1C1E` to `#222426` (Warm, velvety smoked charcoal matte)
  * Elevated Card Surfaces: `#26282B` to `#2A2D31`
  * Illuminated Active Data: `#FFFFFF` (Crisp bone white, used exclusively for active numbers and focus states)
  * Secondary / Tick Marks / Metadata: `#8E9096`
  * Recessed Track / Inactive Segments: `#34373C`
* **Typography**:
  * Display: `Geist Sans` or `Inter` (high-contrast sizing between large data readouts and micro labels)
  * Data / Hashes / Numbers: `Geist Mono` or `JetBrains Mono` (tabular numbers)
* **Core Primitives to Build**:
  * **Central Radial Dial / Tachometer**: Donut ring with segmented white arc showing Space Spending Velocity and Treasury balance (`$4,650 USDC`), with radial tick marks for the $500 per-transaction cap.
  * **Segmented Authority Meter**: 3 rectangular white blocks indicating Space Policy Bound health (`■■■`).
  * **1px Circular Wireframe Action Nodes**: Tactile action buttons for Work Orders, Proofs, and Court Escalation.
  * **DenialProof Intercept Stamp**: A sharp, high-contrast badge illuminating when out-of-bounds requests are caught.

### Frontend Pages / Architecture to Build
1. **Landing Page**: Story, value proposition, and an interactive hero dial demonstrating the $500 cap mechanically.
2. **Onboarding Wizard**: Connect OKX Wallet $\to$ Create Space $\to$ Set Rules $\to$ Pair Agent via MCP snippet.
3. **Space Command (Main Dashboard)**: Central radial dial, Space Policy Matrix, active agents roster.
4. **Work Orders & Escrow Engine**: Kanban tracking `Open → Funded → Submitted → Completed / Rejected / Adjudicating`.
5. **Boundary Sandbox (Demo Mode)**: 1-click interactive triggers for hackathon judges (compliant payment, prompt injection intercept, Gaia refund, Internet Court resolution).
6. **Audit Provenance Stream**: Real-time filterable activity ledger with OKLink explorer links.

---

## 6. Immediate Next Tasks for the Incoming Agent

1. **Build the Production-Grade Charcoal Frontend** in a `ui/` directory:
   * Setup React + Vite + Tailwind CSS with the exact charcoal tokens defined above.
   * Implement the shared persistent layout (Navbar, OKX X Layer network capsule, wallet connector).
   * Implement the interactive Radial Dial, Work Order Kanban, and Boundary Sandbox.
2. **Live OKX X Layer Testnet Deployment**:
   * When a funded private key with testnet OKB on Chain ID 195 is provided:
     ```bash
     export PRIVATE_KEY=0x...
     make deploy-testnet
     make verify-contracts OKLINK_API_KEY=...
     ```
   * Update deployed addresses in `forge.json`, `README.md`, and `forge/SUBMISSION.md`, resolving failure `EXT-01`.
3. **Demo Video Recording**:
   * Record the 3-minute video walkthrough following [`forge/DEMO_SCRIPT.md`](forge/DEMO_SCRIPT.md).
4. **Submission Finalization**:
   * Verify all links in [`forge/SUBMISSION.md`](forge/SUBMISSION.md) and submit to the OKX Dev Day 2026 portal.
