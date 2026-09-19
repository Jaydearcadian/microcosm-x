# INVARIANTS

Properties that must never break. Each has an **enforcement point** in code and an **evidence** status (`UNTESTED · PARTIAL · FAILED · VERIFIED · REGRESSED`). "Code exists" is never `VERIFIED`.

---

## 1. Space Boundary & Policy Invariants (The Load-Bearing Core)

### INV-S1 — An agent cannot execute or settle outside Space policy limits
An agent assigned to a Space with rule `maxTransactionAmount = $500` or `allowedCounterparties = [...]` must NEVER be permitted to move money exceeding that threshold or to an unauthorized recipient.
- **Enforcement:** `SpacePolicyEngine.evaluate(request, space)` checks rules and throws `PolicyViolationError` before any settlement instruction is constructed or signed.
- **Evidence:** `UNTESTED` — to be verified in `packages/policy-engine/test/space-policy.test.ts`.

### INV-S2 — Out-of-policy requests are deterministically rejected with structured audit evidence
When an agent attempts a transaction that violates Space rules, the system must deterministically reject the request, emit a structured audit log (actor, space, rule violated, attempted amount, timestamp), and return a clear denial error to the agent.
- **Enforcement:** `SpacePolicyEngine.evaluate` returns an immutable `DenialProof` object; MCP tool returns `isError: true` with machine-readable rejection reason.
- **Evidence:** `UNTESTED` — to be verified in `packages/policy-engine/test/space-boundary.test.ts`.

### INV-S3 — The onchain financial boundary is non-bypassable
The onchain contracts on OKX X Layer (`SettlementRouter`, `SpaceVault`, `ClaimEscrow`) must authenticate authorization. A rogue agent with an RPC endpoint cannot bypass Space rules to drain the onchain vault directly.
- **Enforcement:** Contracts require valid EIP-712 typed signatures matching Space authority or pre-committed envelope hashes.
- **Evidence:** `UNTESTED` — to be verified in `contracts/test/SettlementRouter.t.sol`.

---

## 2. System Wholeness & Continuity Invariants

### INV-C1 — Flow & Identity Continuity
Every payment begins with an `actionId` and `spaceId` generated at the MCP or API layer. This ID pair flows through policy evaluation, settlement payload construction, and receipt indexing, binding the onchain transaction hash back to the original agent prompt and Space context.
- **Enforcement:** `PaymentReceipt` schema requires non-null `actionId`, `spaceId`, `actorId`, and `txHash`.
- **Evidence:** `UNTESTED` — to be verified in `packages/runtime/test/continuity.test.ts`.

### INV-C2 — Single Truth Across All Interfaces
Space state (budget, remaining allowance, authorized agents, transaction history) must be consistent across MCP tool responses, API endpoints, and onchain ledger state. No interface may report phantom balances or conflicting statuses.
- **Enforcement:** Shared read-model repository backed by verified events; no decoupled caching in API or MCP layer.
- **Evidence:** `UNTESTED` — to be verified in `test/e2e/state-continuity.test.ts`.

### INV-C3 — Unambiguous Terminal Outcomes
Every payment flow must reach a definitive terminal state: `SETTLED`, `REJECTED`, or `ESCROWED`. A payment can never remain indefinitely in `PENDING` without an automated timeout and refund or resolution path.
- **Enforcement:** State machine transition table validates terminal transitions; timeout worker handles unconfirmed transactions.
- **Evidence:** `UNTESTED` — to be verified in `packages/runtime/test/state-machine.test.ts`.
