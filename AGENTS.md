# AGENTS.md — read this first

This repository is under the **FORGE 1.4** control plane for the **OKX Dev Day 2026** build. The map lives in [`/forge`](forge/).

## Ground rules (non-negotiable)

- **Repository files are the source of truth.** Prior chat summaries, transcripts, and memories are
  *not* authoritative — when they disagree with the code or the `/forge` docs, the code wins.
- **Do not mark a claim `VERIFIED` without executed evidence.** "The code exists" is not evidence.
  Use only these statuses: `UNTESTED · PARTIAL · FAILED · VERIFIED · REGRESSED`. Record what command
  produced the evidence in [`/forge/PROOF_LEDGER.md`](forge/PROOF_LEDGER.md).
- **Do not weaken a test to make it pass.** Fix the code or record the failure in [`/forge/FAILURES.md`](forge/FAILURES.md).
- **Do not introduce a mock/fake success path into production code.** Dev adapters must announce
  themselves and must never claim a real onchain transaction, signature, or settlement occurred.
- **Maximum UI/UX, minimum language crowding.** The user and agent-facing API revolves around **`Space`** as the single kernel noun (`spaces.create`, `spaces.addAgent`, `spaces.fund`, `spaces.setRules`, `payments.request`). Do not leak internal implementation jargon (pacts, paths, envelopes, settlement routes) into external surfaces.
- **Do not rebuild from scratch and do not remove working behavior.**

## Before any meaningful change, read

1. [`/forge/PRODUCT.md`](forge/PRODUCT.md) — what Microcosm is and the load-bearing mechanism.
2. [`/forge/INVARIANTS.md`](forge/INVARIANTS.md) — the system invariants that must never break.
3. [`/forge/ARCHITECTURE.md`](forge/ARCHITECTURE.md) — the components (Space runtime, policy engine, X Layer settlement, MCP server).
4. [`/forge/EXECUTION_PLAN.md`](forge/EXECUTION_PLAN.md) — the active phase, scope, and deliverables.
5. [`/forge/PROOF_LEDGER.md`](forge/PROOF_LEDGER.md) — what is actually proven vs untested.

## The one mechanism to protect

**Space Bounded Economic Authority.** Autonomous agents operate inside a bounded operating context (**Space**), never with unconstrained private keys or unmonitored bank authority:

```text
AGENT REASONING → CAPABILITY DISCOVERY → SPACE POLICY EVALUATION → ONCHAIN FINANCIAL KERNEL → X LAYER SETTLEMENT
```

Any payment request outside the Space's rules (spending limits, unapproved counterparties, expiry, budget depletion) is **deterministically rejected** with structured audit evidence. The agent cannot bypass the policy boundary to drain funds.

## Local verification protocol

Every component must be runnable and verifiable locally without external hidden dependencies:

```bash
make test             # Run entire test suite (contracts + runtime + MCP)
make test-contracts   # Run Foundry suite on X Layer contracts (AgenticCommerce, SettlementRouter, ClaimEscrow, EnvelopeRegistry)
make test-runtime     # Run Node.js tests on Space runtime and policy engine
make test-mcp         # Run MCP tool execution and boundary tests
make verify           # Full gate: lint + typecheck + tests + proof ledger check
```

## The `/forge` control plane

`EVENT · RUBRIC · COMPETITION · PRODUCT · CORE_HYPOTHESIS · INVARIANTS · ARCHITECTURE · JUDGE_PATH · CLAIMS · PROOF_LEDGER · FAILURES · QUALITY · EXECUTION_PLAN · SUBMISSION` — plus [`/forge.json`](forge.json).
