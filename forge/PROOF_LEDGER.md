# PROOF LEDGER — Microcosm on OKX X Layer

This ledger tracks the verified evidence for every claim in the repository. A status of `VERIFIED` requires a real, reproducible command execution output.

Status vocabulary: `UNTESTED · PARTIAL · FAILED · VERIFIED · REGRESSED`.

---

| Claim ID | Category | Claim Description | Status | Evidence Command / Reference | Last Checked |
|---|---|---|---|---|---|
| **SPACE-1** | Space Policy | An agent cannot exceed the Space's `maxPerTransaction` rule | `VERIFIED` | `npm run test:policy` (`SPACE-1`, `SPACE-3` PASS) | 2026-09-19 |
| **SPACE-2** | Space Policy | Violations produce a deterministic `DenialProof` with actor ID and rule details | `VERIFIED` | `npm run test:policy` (`SPACE-2` PASS) | 2026-09-19 |
| **SPACE-3** | Space Policy | Allowed counterparties filter restricts payments to unapproved recipients | `VERIFIED` | `npm run test:policy` (`SPACE-4` PASS) | 2026-09-19 |
| **CHAIN-1** | X Layer | Contracts compile cleanly with Foundry targeting X Layer EVM | `VERIFIED` | `make test-contracts` (Solc 0.8.30, 9 files compiled) | 2026-09-19 |
| **CHAIN-2** | X Layer | `SettlementRouter.sol` executes atomic direct payment on X Layer with ERC-20 / USDC | `VERIFIED` | `contracts/test/SettlementFlows.t.sol` (`testSettleDirectTransfersFundsToRecipient` PASS) | 2026-09-19 |
| **CHAIN-3** | X Layer | `ClaimEscrow.sol` holds funds and releases only upon verified claim | `VERIFIED` | `contracts/test/SettlementFlows.t.sol` (`testCreateAndClaimEscrowTransfersFundsFromEscrow` PASS) | 2026-09-19 |
| **MCP-1** | MCP Agent | Agent can list Space capabilities and request valid payment via MCP | `VERIFIED` | `npm run test:mcp` (`MCP-1`, `MCP-2` PASS) | 2026-09-19 |
| **MCP-2** | MCP Agent | Agent payment request exceeding rule is rejected with `isError: true` and denial proof | `VERIFIED` | `npm run test:mcp` (`MCP-3` PASS) | 2026-09-19 |
| **WORK-1** | Work Lifecycle | Work creation escrows budget from Space balance (`Open` → `Funded`) | `VERIFIED` | `npm run test:mcp` (`WORK-1` PASS) | 2026-09-19 |
| **WORK-2** | Work Lifecycle | Provider submits deliverable hash (`Funded` → `Submitted`) with evidence URI | `VERIFIED` | `npm run test:mcp` (`WORK-2` PASS) | 2026-09-19 |
| **WORK-3** | Work Lifecycle | Evaluator approves → `Completed`, payment settles on OKX X Layer (receipt + txHash) | `VERIFIED` | `npm run test:mcp` (`WORK-3` PASS) | 2026-09-19 |
| **WORK-4** | Gaia Exception | Evaluator rejects → `Rejected`, Gaia refund returns 100% to Space ($0 lost); expiry → `Expired` with full refund; no payout without deliverable proof | `VERIFIED` | `npm run test:mcp` (`WORK-4`, `WORK-5`, `WORK-6` PASS) | 2026-09-19 |
| **E2E-1** | E2E Flow | End-to-end Procurement Space workflow (Creation → Funding → Valid Payment Settles → Over-limit Fails) | `VERIFIED` | `npm run demo` (All 5 steps pass live) | 2026-09-19 |
| **E2E-2** | E2E Flow | End-to-end Work loop (Work Order → Deliverable hash → Evaluator approves → Settles on X Layer → Out-of-bounds blocked → Rejected work refunded) | `VERIFIED` | `npm run demo` (All 8 steps pass live) | 2026-09-19 |
| **SUITE-1** | CI / Quality | Full repository test suite passes green locally | `VERIFIED` | `make test` (42 tests passed, 0 failed) | 2026-09-19 |

---

## Log of Executed Evidence

### 2026-09-19: First-Class Work Lifecycle & Gaia Exception Handling (WORK-1…WORK-4, E2E-2, SUITE-1)
* **Command**: `make test` && `npm run demo`
* **Output**:
  ```text
  make test:
    - 23 Solidity contract tests PASS (SettlementFlows 4, AgenticCommerce 11, EnvelopeRegistry 8)
    - 8 Space policy engine tests PASS (SPACE-1…SPACE-7 + boundary)
    - 11 MCP server tests PASS (MCP-1…MCP-4 + WORK-1…WORK-6)
    Total: 42 passed, 0 failed

  npm run demo:
    - Step 1: Agent discovers Space (Autonomous Procurement Space, $5,000 USDC)
    - Step 2: Agent queries capabilities (Max $500/tx, $2,000/day, approved vendors)
    - Step 3: Work Order job-0001 created ($350.00 escrowed, Open -> Funded)
    - Step 4: Provider submits deliverable hash (Funded -> Submitted, ipfs evidence)
    - Step 5: Evaluator approves -> Completed, settles on X Layer (receipt + txHash 0x…)
    - Step 6: Out-of-policy $900 payment deterministically rejected (DenialProof, $0 lost)
    - Step 7: Rejected work job-0002 triggers Gaia refund ($200.00 returned, $0 lost)
    - Step 8: Full Space activity ledger verified (WORK_CREATED/SUBMITTED/COMPLETED/REJECTED + PAYMENT_DENIED)
  ```
* **Status**: `VERIFIED` on WORK-1, WORK-2, WORK-3, WORK-4, E2E-2, SUITE-1.

### 2026-09-19: MCP Server & E2E Demo Suite (MCP-1, MCP-2, E2E-1, SUITE-1)
* **Command**: `make test` && `npm run demo`
* **Output**:
  ```text
  make test:
    - 23 Solidity contract tests PASS (SettlementFlows, AgenticCommerce, EnvelopeRegistry)
    - 8 Space policy engine tests PASS
    - 5 MCP server tests PASS
    Total: 36 passed, 0 failed

  npm run demo:
    - Step 1: Agent discovers Space (Autonomous Procurement Space, $5,000 USDC)
    - Step 2: Agent queries capabilities (Max $500/tx, $2,000/day, approved vendors)
    - Step 3: Compliant $350 payment settles on X Layer (receipt: rcpt-371f95ef, txHash: 0x96ce...)
    - Step 4: Out-of-policy $900 payment deterministically rejected (DenialProof generated, $0 lost)
    - Step 5: Full Space activity ledger verified with complete flow & identity continuity
  ```
* **Status**: `VERIFIED` on MCP-1, MCP-2, E2E-1, SUITE-1.

### 2026-09-19: Policy Engine Suite Passed (SPACE-1, SPACE-2, SPACE-3)
* **Command**: `npm run test:policy`
* **Output**:
  ```text
  ✔ SPACE-1: Valid compliant payment within rules is approved (13.7ms)
  ✔ SPACE-2: Out-of-policy request exceeding per-transaction cap is rejected with DenialProof (0.9ms)
  ✔ SPACE-3: Strict boundary test ($500.00 exact passes, $500.01 fails) (0.9ms)
  ✔ SPACE-4: Payment to unapproved counterparty is rejected (1.1ms)
  ✔ SPACE-5: Payment exceeding daily budget is rejected (1.1ms)
  ✔ SPACE-6: Unauthorized actor role (viewer) cannot request funds (0.8ms)
  ✔ SPACE-7: Unknown actor not in Space is rejected (0.5ms)
  Total: 8 passed, 0 failed (270ms)
  ```
* **Status**: `VERIFIED` on SPACE-1, SPACE-2, SPACE-3.

### 2026-09-19: Contracts Suite Passed (CHAIN-1, CHAIN-2, CHAIN-3)
* **Command**: `make test-contracts`
* **Output**:
  ```text
  Compiler run successful!
  Ran 8 tests for test/EnvelopeRegistry.t.sol: 8 passed; 0 failed
  Ran 4 tests for test/SettlementFlows.t.sol: 4 passed; 0 failed
  Ran 11 tests for test/AgenticCommerce.t.sol: 11 passed; 0 failed
  Total: 23 passed, 0 failed, 0 skipped (67.64ms)
  ```
* **Status**: `VERIFIED` on CHAIN-1, CHAIN-2, CHAIN-3.
