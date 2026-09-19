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

### 2026-09-19: Production Hardening — Attestation, Internet Court Adjudication, Deployment
* **Command**: `make test` && `npm run demo` && anvil-broadcast pre-flight
* **Output**:
  ```text
  make test: 36 contract + 13 policy + 14 MCP = 63 passed, 0 failed
  Cross-check: onchain FixtureDigest 0x6de0e923…f3999 == offchain ATTEST-JS-2 constant
  Broadcast: 5/5 receipts status 0x1, bytecode at all deployed addresses
  ```
* **Claims admitted**: ATTEST-1, ATTEST-2, ADJUD-1, ADJUD-2, WORK-8, WORK-9, DEPLOY-1, SUITE-1 (`VERIFIED`).
* **Negative controls executed**: tampered/expired/replayed/cross-chain attestations
  revert; impostor court verdicts revert; proof-less court referrals revert;
  stalled courts cannot strand escrow (expiry escape hatch).
* **External gap**: live fork/broadcast/OKLink verification needs network + funded
  key (`EXT-01` in `forge/FAILURES.md`); pipeline proven locally via anvil broadcast.
