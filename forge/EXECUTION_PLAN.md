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
- [x] Add Foundry unit and invariant tests proving atomic settlement, escrow claiming, and job lifecycle (23 tests passing).
- [x] Create automated Foundry broadcast script (`contracts/script/DeployXLayer.s.sol`) targeting OKX X Layer (Chain ID 195/196).

## Phase 2: Space Engine & Policy Kernel (Day 2-3)
- [x] Implement `Space` state model and repository (`createJob`, `evaluateJob`, `submitDeliverable`, `addMember`, `addAgent`).
- [x] Implement pure `SpacePolicyEngine` in `packages/policy-engine/`:
  - Rule evaluation (`maxPerTransaction`, daily velocity, counterparty allowlist).
  - Deterministic generation of `DenialProof` upon violation.
- [x] Full unit test suite with 100% branch coverage on policy boundaries (8 tests passing).

## Phase 3: MCP Agent Interface & Work Lifecycle (Day 3-4)
- [x] Build native Stdio Model Context Protocol (MCP) server in `mcp/`:
  - Core Space tools: `spaces_list`, `spaces_capabilities`, `payments_request`, `activity_list`.
  - First-class Work lifecycle tools: `work_create`, `work_submit`, `work_evaluate`, `work_get`.
- [x] Implement OpenRails Gaia exception handling (100% refund upon work rejection or deadline expiry).
- [x] Full test suite in `mcp/test/mcp-server.test.js` (11 tests passing).

## Phase 4: E2E Vertical Slice & Evidence Proof (Day 4-5)
- [x] Wire end-to-end Procurement Space workflow (`scripts/demo-procurement-space.mjs`):
  - Step 1: Agent discovers Space via MCP.
  - Step 2: Agent queries capability bounds.
  - Step 3: Work Order created ($350.00 escrowed).
  - Step 4: Provider submits deliverable hash with IPFS evidence.
  - Step 5: Evaluator approves → Completed, settles on OKX X Layer.
  - Step 6: Unauthorized $900 request deterministically blocked with `DenialProof` ($0 lost).
  - Step 7: Low-quality deliverable rejected → Gaia exception refund returns 100% to Space ($0 lost).
  - Step 8: Full provenance audit trail verified.
- [x] Execute tests locally via `make test` (42 passed) and verify with `make verify` (`scripts/verify-proof-ledger.mjs`).

## Phase 5: Submission & Demo Polish (Day 5-6)
- [x] Deploy script verified (`contracts/script/DeployXLayer.s.sol`).
- [x] Verification gate fully operational (`scripts/verify-proof-ledger.mjs`).
- [x] Draft 2–4 minute demo walkthrough script (`forge/DEMO_SCRIPT.md`).
- [x] Complete hackathon submission overview (`forge/SUBMISSION.md`) and project `README.md`.
