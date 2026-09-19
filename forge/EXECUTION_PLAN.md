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
- [ ] Initialize repository packages (`contracts/`, `packages/policy-engine/`, `packages/runtime/`, `mcp/`).
- [ ] Audit OKX X Layer testnet RPC, chain ID (195), gas dynamics, and token contracts.

## Phase 1: Solidity Smart Contracts on OKX X Layer (Day 1-2)
- [ ] Set up Foundry configuration (`foundry.toml`) with standard EVM compiler profile.
- [ ] Ingest and refine `SettlementRouter.sol` and `ClaimEscrow.sol` from `mcosm-OpenRails`.
- [ ] Add unit tests and fuzz tests proving atomic settlement and replay protection.
- [ ] Deploy and verify contracts on OKX X Layer testnet.

## Phase 2: Space Engine & Policy Kernel (Day 2-3)
- [ ] Implement `Space` state model and repository (`create`, `addMember`, `addAgent`, `setRules`).
- [ ] Implement `SpacePolicyEngine`:
  - Rule evaluation (`maxPerTransaction`, daily velocity, counterparty allowlist).
  - Deterministic generation of `DenialProof` upon violation.
- [ ] Full unit test suite with 100% branch coverage on policy boundaries.

## Phase 3: MCP Agent Interface (Day 3-4)
- [ ] Build MCP server exposing:
  - `spaces_list` / `spaces_get`
  - `spaces_capabilities`
  - `payments_request`
  - `activity_list`
- [ ] Test with mock autonomous agent prompts (Cursor, Claude, or script runner).

## Phase 4: E2E Vertical Slice & Evidence Proof (Day 4-5)
- [ ] Wire end-to-end Procurement Space workflow:
  - Create Space → Fund with mock/testnet USDC → Agent onboarded.
  - Agent requests $350 approved payment → Policy PASS → Settles on X Layer.
  - Agent requests $900 unapproved payment → Policy REJECT → Auditable denial proof recorded.
- [ ] Execute tests locally via `make test` and update `PROOF_LEDGER.md`.

## Phase 5: Submission & Demo Polish (Day 5-6)
- [ ] Record 2-4 minute crisp demo video showing terminal/MCP interaction and onchain settlement.
- [ ] Finalize `README.md`, `ARCHITECTURE.md`, `DEMO.md`, and submission form details.
