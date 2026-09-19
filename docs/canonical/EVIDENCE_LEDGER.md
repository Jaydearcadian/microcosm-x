# EVIDENCE LEDGER

Canonical record linking claims directly to verifiable execution outputs.
Refer to [`forge/PROOF_LEDGER.md`](file:///home/jay/okx/forge/PROOF_LEDGER.md) for active statuses.

---

## Standards for Admitting Evidence
1. **No manual assertions**: "The code works" or "I verified it" is not evidence.
2. **Executed command required**: Every claim must link to an exact CLI command, transaction hash, or automated test output.
3. **Reproducibility**: Any reviewer or judge running the command locally must achieve identical results.
4. **Negative Controls Required**: A verification must include a negative control showing that improper actions actually fail (e.g., $501 transaction fails under $500 limit).

---

## Verified Evidence Log

### 2026-09-19: First-Class Work Lifecycle & Gaia Exception Handling
* **Command**: `make test` && `npm run demo`
* **Output**:
  ```text
  make test: 23 contract + 8 policy + 11 MCP = 42 passed, 0 failed
  npm run demo: Work Order created -> deliverable hash submitted -> evaluator
  approves -> settles on X Layer -> out-of-bounds $900 blocked -> rejected
  work refunded 100% ($0 lost). All 8 demo steps pass live.
  ```
* **Claims admitted**: WORK-1, WORK-2, WORK-3, WORK-4, E2E-2, SUITE-1 (`VERIFIED`).
* **Negative controls executed**: evaluator reject restores full escrow (`WORK-4`);
  expired work auto-refunds via `claimRefund` semantics (`WORK-5`); approval
  without deliverable proof fails, non-provider submit fails, over-cap
  `work_create` denied with `DenialProof` (`WORK-6`).
* **Mirrors**: `contracts/src/AgenticCommerce.sol` (`Open/Funded/Submitted/
  Completed/Rejected/Expired` + `claimRefund`) — 11/11 Foundry tests green.
