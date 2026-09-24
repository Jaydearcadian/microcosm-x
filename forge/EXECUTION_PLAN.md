# EXECUTION PLAN — Microcosm on OKX X Layer

## Phase Overview

```text
Phase 0: Substrate Audit, Control Plane & Local Harness (Current)
  ↓
Phase 1: Solidity Smart Contracts for OKX X Layer (SettlementRouter & ClaimEscrow)
  ↓
Phase 2: Space Engine & Policy Evaluation Kernel (Deterministic Boundary)
  ↓
Phase 3: MCP Server (Agent Tooling & Discovery)
  ↓
Phase 4: End-to-End Procurement Demo & Evidence Gate (Valid Settle vs Out-of-Bounds Rejection)
  ↓
Phase 5: Submission Wrap & Hackathon Artifacts (Demo Video, Docs, X Layer Verification)
```

---

## Phase 0: Substrate Audit & Local Harness (Day 1)
- [x] Configure control plane (`AGENTS.md`, `/forge`, `forge.json`, `Makefile`).
- [x] Integrate `onchain-systems-engineering` and `system-wholeness` skills.
- [x] Initialize repository packages (`contracts/`, `packages/policy-engine/`, `mcp/`).
- [x] Audit OKX X Layer testnet RPC, chain ID (195), gas dynamics, and token contracts (`docs/research/SUBSTRATE_AUDIT_OKX_XLAYER.md`).

## Phase 1: Solidity Smart Contracts on OKX X Layer (Day 1-2)
- [x] Set up Foundry configuration (`foundry.toml`) with standard EVM compiler profile.
- [x] Ingest and refine `SettlementRouter.sol`, `ClaimEscrow.sol`, `EnvelopeRegistry.sol`, and `AgenticCommerce.sol`.
- [x] Add Foundry unit and invariant tests proving atomic settlement, escrow claiming, and job lifecycle.
- [x] Create automated Foundry broadcast script (`contracts/script/DeployXLayer.s.sol`) targeting OKX X Layer (Chain ID 195/196).

## Phase 2: Space Engine & Policy Kernel (Day 2-3)
- [x] Implement `Space` state model and repository (`createJob`, `evaluateJob`, `submitDeliverable`, `addMember`, `addAgent`).
- [x] Implement pure `SpacePolicyEngine` in `packages/policy-engine/`:
  - Rule evaluation (`maxPerTransaction`, daily velocity, counterparty allowlist).
  - Deterministic generation of `DenialProof` upon violation.
- [x] Full unit test suite with 100% branch coverage on policy boundaries.

## Phase 3: MCP Agent Interface & Work Lifecycle (Day 3-4)
- [x] Build native Stdio Model Context Protocol (MCP) server in `mcp/`:
  - Core Space tools: `spaces_list`, `spaces_capabilities`, `payments_request`, `activity_list`.
  - First-class Work lifecycle tools: `work_create`, `work_submit`, `work_evaluate`, `work_get`.
- [x] Implement OpenRails Gaia exception handling (100% refund upon work rejection or deadline expiry).

## Phase 4: E2E Vertical Slice & Evidence Proof (Day 4-5)
- [x] Wire end-to-end Procurement Space workflow (`scripts/demo-procurement-space.mjs`):
  - Step 1: Agent discovers Space via MCP.
  - Step 2: Agent queries capability bounds.
  - Step 3: Work Order created ($350.00 escrowed).
  - Step 4: Provider submits deliverable hash with IPFS evidence.
  - Step 5: Evaluator approves → Completed, settles on OKX X Layer.
  - Step 6: Unauthorized $900 request deterministically blocked with `DenialProof` ($0 lost).
  - Step 7: Low-quality deliverable rejected → Gaia exception refund returns 100% to Space ($0 lost).
  - Step 8: Subjective deliverable referred to Internet Court (`IAdjudicator`) → halted, verdict posted, escrow settled.
  - Step 9: Full provenance audit trail verified.
- [x] Execute tests locally via `make test` (78+ passed across contracts, policy, MCP offline, server persistence, SDK) and verify with hardened `node scripts/verify-proof-ledger.mjs` (26 verified claims).

## Advanced Hardening Sprints (Post-MVP Production Hardening)
- [x] **Sprint 1 — EIP-712 Attestation**:
  - `PaymentAuthorization` domain and struct on `SettlementRouter.sol` and `AgenticCommerce.sol`.
  - Pure JS offchain EIP-712 encoder with embedded Keccak in `packages/policy-engine/src/attestation.js` cross-tested byte-for-byte with onchain digest (`0x6de0e9235ca74a6f96f11a80d14e386e6969fe4ad84d3a35b802c40b720f3999`).
  - 8 Foundry tests in `Attestation.t.sol` + 5 JS unit tests.
- [x] **Sprint 2 — Internet Court Adjudication**:
  - `IAdjudicator.sol` interface + `MockAdjudicator.sol`.
  - `Adjudicating` state in `AgenticCommerce.sol`, halting payouts pending court resolution.
  - Stalled-court reclaim escape hatch protecting client funds.
  - MCP tools `work_request_verdict` and `work_post_verdict` (10 total MCP tools).
  - 5 Foundry tests in `Adjudication.t.sol` + 2 MCP tests (`WORK-8`, `WORK-9`).
- [x] **Sprint 3 — Deployment Pipeline & Verification**:
  - `contracts/script/DeployXLayer.s.sol` dynamically broadcasting all 5 contracts from env.
  - Makefile targets: `make fork-test`, `make deploy-testnet`, `make verify-contracts`.
  - Pre-flight broadcast verified on local EVM (5/5 receipts confirmed status `0x1`).

## Phase 5: Submission & Demo Polish (Complete)
- [x] Deploy script verified (`contracts/script/DeployXLayer.s.sol`).
- [x] Verification gate fully operational (`scripts/verify-proof-ledger.mjs`, 23/23 claims `VERIFIED`).
- [x] 2–4 minute demo walkthrough script (`forge/DEMO_SCRIPT.md`).
- [x] Complete hackathon submission overview (`forge/SUBMISSION.md`) and project `README.md`.
