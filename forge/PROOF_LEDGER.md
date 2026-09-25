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
| **WORK-3** | Work Lifecycle | Evaluator approves → `Completed`; settlement runs on the configured EVM and receipts contain real transaction hashes with no simulated fallback | `VERIFIED` | `npm run test:mcp` (`LIVE-2` PASS) | 2026-09-25 |
| **WORK-4** | Gaia Exception | Evaluator rejects → `Rejected`, Gaia refund returns 100% to Space ($0 lost); expiry → `Expired` with full refund; no payout without deliverable proof | `VERIFIED` | `npm run test:mcp` (`WORK-4`, `WORK-5`, `WORK-6` PASS) | 2026-09-19 |
| **WORK-7** | Policy Boundary | Concurrent Work Order escrows count against the daily budget at creation (no collective daily-cap breach); Gaia refunds restore daily headroom | `VERIFIED` | `npm run test:mcp` (`WORK-7` PASS) | 2026-09-19 |
| **ATTEST-1** | X Layer | Valid EIP-712 attestation (Microcosm domain, chain-bound) settles payment and releases job escrow | `VERIFIED` | `contracts/test/Attestation.t.sol` (`testValidAttestationSettlesPayment`, `testCommerceAttestedSettlementReleasesEscrow` PASS) | 2026-09-19 |
| **ATTEST-2** | X Layer | Tampered, expired, replayed, and cross-chain attestations are rejected; offchain encoder matches onchain digest byte-for-byte | `VERIFIED` | `contracts/test/Attestation.t.sol` (4 negative PASS) + `packages/policy-engine/test/attestation.test.js` (ATTEST-JS-1…5 PASS) | 2026-09-19 |
| **ADJUD-1** | X Layer | Internet Court resolver receives (jobId, deliverableHash, evidenceUri, rubricHash); approval verdict settles escrow, payouts halt while Adjudicating | `VERIFIED` | `contracts/test/Adjudication.t.sol` (`testCourtApprovalSettlesEscrowToProvider` PASS) | 2026-09-19 |
| **ADJUD-2** | X Layer | Court rejection refunds client in full; impostor verdicts and proof-less referrals fail; stalled courts cannot strand escrow | `VERIFIED` | `contracts/test/Adjudication.t.sol` (4 negative/edge PASS) | 2026-09-19 |
| **WORK-8** | MCP Agent | Court-bound Work Order settles on X Layer after `work_request_verdict` → `work_post_verdict` (approve) | `VERIFIED` | `npm run test:mcp` (`WORK-8` PASS) | 2026-09-19 |
| **WORK-9** | MCP Agent | Court rejection refunds 100% ($0 lost); impostor verdict and proof-less referral rejected | `VERIFIED` | `npm run test:mcp` (`WORK-9` PASS) | 2026-09-19 |
| **DEPLOY-1** | Deployment | `DeployXLayer.s.sol` broadcasts all 5 contracts from `PRIVATE_KEY`/`USDC_ADDRESS` env; `make fork-test` / `deploy-testnet` / `verify-contracts` pipeline wired | `VERIFIED` | `forge script … --broadcast` on local EVM (5/5 receipts status 0x1, runtime bytecode present) | 2026-09-19 |
| **M3** | Interface / HTTP | REST + SSE over the SpaceStore model: spaces, bounds, participants, requests, work, payments, activity, live event stream — same terminal states as MCP | `VERIFIED` | `npm run test:server` (`M3-1…M3-6` PASS) | 2026-09-24 |
| **HOST-1** | Deployment | M3 API hosted and publicly serving from EC2 (`i-07bd826a6cba642fa:8791`, systemd, seeded): health, spaces, bounds, 422 denial all verified over public HTTP | `VERIFIED` | `curl http://52.40.133.66:8791/api/…` (health ok, bounds escrow math exact, over-cap → 422) | 2026-09-24 |
| **M4** | Persistence | Atomic snapshot driver: every mutation checkpoints to disk; SIGKILL + reboot restores spaces, jobs, requests, counters; corrupt snapshots refuse to boot | `VERIFIED` | `npm run test:server` (`M4-1`, `M4-2` PASS) + live box restart restores 2 spaces from snapshot | 2026-09-24 |
| **E2E-1** | E2E Flow | End-to-end Procurement Space workflow (Creation → Funding → Valid Payment Settles → Over-limit Fails) | `VERIFIED` | `npm run demo` (REAL onchain settlement via deployed contracts, receipt.simulated=false) | 2026-09-22 |
| **E2E-2** | E2E Flow | End-to-end Work loop (Work Order → Deliverable hash → Evaluator approves → Settles on X Layer → Out-of-bounds blocked → Rejected work refunded → Internet Court adjudication) | `VERIFIED` | `npm run demo` (REAL onchain settlement via deployed contracts, receipt.simulated=false) | 2026-09-22 |
| **SUITE-1** | CI / Quality | Full repository test suite passes green locally | `VERIFIED` | `make test` (129 tests passed, 0 failed) | 2026-09-25 |
| **AGENTIC-1** | Agent / E2E | Tool-using agent completes Request → Work → proof → evaluation → real testnet settlement and trace | `VERIFIED` | `node scripts/agentic-testnet-e2e.mjs`; 14 MCP calls; tx `0xefaac02816645dee27c5fe5961635396bce4c4415f22af5b12bb466515a0f662`; receipt status `1` at block `41861915` | 2026-09-25 |
| **AUTH-1** | Access / Auth | Wallet signature creates an HttpOnly session; admin creates bearer or address-restricted Space invites; redemption binds membership | `VERIFIED` | `npm --workspace=@microcosm/server test` (`wallet session authenticates an address and supports Space invitations` PASS); bearer redemption PASS; Playwright `/app/access` PASS | 2026-09-25 |
| **M9-1** | Onchain Indexer | `JobCreated` logs decode into canonical jobs with a persisted chain/contract cursor and idempotent replay | `VERIFIED` | `npm --workspace=@microcosm/mcp-server test` (`M9-1`, `M9-2` PASS; Anvil restart and same-block cursor coverage) | 2026-09-25 |
| **M9-2** | Onchain Indexer | `JobFunded` projects `Open` → `Funded` from chain state without mutating Space balances, creating receipts, or settling funds | `VERIFIED` | `npm --workspace=@microcosm/mcp-server test` (`M9-3` PASS; state, replay, same-block, ordering, no-side-effect, and restart coverage) | 2026-09-25 |
| **M9-3** | Onchain Indexer | `JobSubmitted` projects `Funded` → `Submitted` with deliverable hash and source log, without financial side effects | `VERIFIED` | `npm --workspace=@microcosm/mcp-server test` (`M9-4` PASS; state, replay, same-block, ordering, conflict, no-side-effect, and restart coverage) | 2026-09-25 |
| **M9-4** | Onchain Indexer | `AdjudicationRequested` projects `Submitted` → `Adjudicating` with case metadata, without financial side effects | `VERIFIED` | `npm --workspace=@microcosm/mcp-server test` (`M9-5` PASS; state, replay, same-block, ordering, conflict, no-side-effect, and restart coverage) | 2026-09-25 |
| **M9-5** | Onchain Indexer | `JobCompleted`, `JobRejected`, `JobExpired`, and `Refunded` project terminal state and refund evidence from canonical logs without local financial side effects | `VERIFIED` | `node --test mcp/test/indexer.test.js` (`M9-6` PASS; 37 tests) + `make test` (129 tests passed, 0 failed) | 2026-09-25 |


---

## Log of Executed Evidence

### 2026-09-25: Wallet sessions and Space invitations (AUTH-1)
* **Command**: `npm --workspace=@microcosm/server test` (`auth.test.js`).
* **Output**: generated throwaway wallet signed the server nonce; session cookie authenticated the founder; founder created a Space; admin issued an unbound bearer invite; second wallet redeemed it; redemption bound the invite to the second wallet; address-scoped Space discovery returned the new Space. Targeted address-restricted invites remain supported.
* **Status**: `VERIFIED`. Raw private keys and signatures are not persisted; the server stores session tokens and invite state only.

### 2026-09-25: JobCreated indexer cursor and replay (M9-1)
* **Command**: `npm --workspace=@microcosm/mcp-server test` (`M9-1`, `M9-2`).
* **Output**: Anvil emitted two `JobCreated` events; the indexer decoded both into Space jobs, persisted a chain/contract/block/transaction/log cursor, resumed later logs in the same block, and produced no duplicate jobs or activity after restart replay.
* **Status**: `VERIFIED` for the narrow M9 slice. Other lifecycle events, WebSocket subscription, and reorg handling remain open.

### 2026-09-25: JobFunded state-only reconciliation (M9-2)
* **Command**: `npm --workspace=@microcosm/mcp-server test` (`M9-3`).
* **Output**: combined `JobCreated`/`JobFunded` logs were ordered canonically; funding projected `Open` to `Funded` with budget metadata and one activity record while Space balances, spending totals, and receipts remained unchanged. Replay, same-block, invalid-ordering, and restart cases passed.
* **Status**: `VERIFIED` for the state-only funding projection. Terminal settlement/refund events, WebSocket subscription, and reorg handling remain open.

### 2026-09-25: JobSubmitted state-only reconciliation (M9-3)
* **Command**: `npm --workspace=@microcosm/mcp-server test` (`M9-4`).
* **Output**: combined logs projected `Funded` to `Submitted`, preserved the deliverable hash and source log, and added one activity record without Space balance, receipt, settlement, or refund side effects. Replay, same-block, conflict, invalid-order, and restart cases passed.
* **Status**: `VERIFIED` for the state-only submission projection. Terminal settlement/refund events, WebSocket subscription, and reorg handling remain open.

### 2026-09-25: AdjudicationRequested state-only reconciliation (M9-4)
* **Command**: `npm --workspace=@microcosm/mcp-server test` (`M9-5` PASS).
* **Output**: combined logs projected `Submitted` to `Adjudicating`, preserved adjudicator/case metadata and source log, and added one activity record without Space balance, receipt, settlement, refund, or local request side effects. Replay, same-block, conflict, invalid-order, and restart cases passed.
* **Status**: `VERIFIED` for the state-only adjudication-request projection. Terminal settlement/refund events, WebSocket subscription, and reorg handling remain open.

### 2026-09-25: Direct terminal and refund state-only reconciliation (M9-5)
* **Commands**: `node --test mcp/test/indexer.test.js`; `make test`.
* **Output**: the focused indexer suite passed 37/37 and the full repository gate passed 129/129. Canonical same-block logs projected all permitted terminal transitions; `Refunded` preceded rejection and expiry where emitted, preserved refund evidence, and never changed status. Replays, conflicts, invalid ordering, financial no-side-effects, and restart persistence passed.
* **Status**: `VERIFIED` for direct terminal/refund projections. `AdjudicationResolved`, `AttestedJobSettlement`, WebSocket subscription, and reorg handling remain open.

### 2026-09-25: Testnet tool-using agent acceptance (AGENTIC-1)
* **Command**: `node scripts/agentic-testnet-e2e.mjs` with `XLAYER_RPC_URL=https://testrpc.xlayer.tech`, `XLAYER_CHAIN_ID=1952`, and the deployer key loaded from the local key handoff.
* **Output**: 14 MCP tool calls; Space → roster → Request → receive → Work → submit → evaluate → complete → policy denial → trace; $1.00 Work Order settled.
* **Transaction**: `0xefaac02816645dee27c5fe5961635396bce4c4415f22af5b12bb466515a0f662`; independent `cast receipt` confirmed `status 1` at block `41861915` on chain `1952`.
* **Status**: `VERIFIED` for the testnet tool-driven agent loop. The deployer also acted as provider because no separate provider key was supplied; the run proves real MCP execution and settlement, not distinct-provider signing.

### 2026-09-25: Backend live-settlement harness and REST identity continuity (MCP-1/2, WORK-3, M3, SUITE-1)
* **Commands**: `node --test mcp/test/live-settlement.test.js`; `npm --workspace=@microcosm/server test`; `make test`; `node scripts/verify-proof-ledger.mjs`
* **Output**: live MCP settlement 6/6, REST conformance 8/8, full gate 91 passed and 0 failed, proof-ledger verifier 26/26 verified.
* **Fixes**: Anvil output is file-backed so synchronous Forge/Cast calls cannot fill a child pipe; participant wallet addresses are retained in Space member records; policy and settlement resolve member identity by id, name, or address; evaluator resolution never substitutes an unrelated participant.
* **Status**: `VERIFIED` for the executed local evidence. Testnet agentic E2E remains a separate claim and requires a key-bearing environment.

### 2026-09-24: M3 REST + SSE server, frozen API contract, UI agent brief (M3, SUITE-1)
* **Command**: `make test` (incl. new `make test-server`)
* **Output**:
  ```text
  make test:
    - 36 Solidity contract tests PASS (4 + 5 + 8 + 11 + 8 across 5 suites)
    - 13 Space policy engine tests PASS
    - 23 MCP server tests PASS
    - 6 HTTP/SSE conformance tests PASS (M3-1 health/space/bounds, M3-2
      participants/requests/receive/trace, M3-3 work escrow→settle, M3-4
      422 denial with denialProof, M3-5 seq pagination, M3-6 live SSE settle)
    Total: 78 passed, 0 failed
  ```
* **Status**: `VERIFIED` on M3, SUITE-1.
* **Shipped alongside**: `docs/API_CONTRACT.md` v1 (frozen endpoint + SSE + type contract for the UI agent), `docs/UI_AGENT_BRIEF.md` (tokens, section map, motion formula, copy deck, acceptance), `packages/server` (`--seed` boots a living demo Space), `GET /bounds` hero-dial binding.
* **Negative controls executed**: 404 unknown space, 400 bad participant kind / malformed body, 409 double-accept, 422 over-cap payment with proof hash, SSE resume via `?since=`.

### 2026-09-24: M3 API hosted on EC2 (HOST-1)
* **Command**: `aws ssm send-command` (deploy `76ce290` → systemd `microcosm-server --seed` on `i-07bd826a6cba642fa`) + public `curl http://52.40.133.66:8791/api/…`
* **Output**:
  ```text
  - SG: opened 8791/tcp (revoked the unused 8787 rule after finding a port clash with a local workload; API moved to 8791)
  - /api/health → { ok: true, network: OKX X Layer Testnet, chainId: 1952 }
  - /api/spaces → seeded Acme space (4530.000000 USDC) + procurement space
  - /api/spaces/<seed>/bounds → escrowed 350.000000, remaining 1180.000000 (= 2000 − 470 − 350 exact), denials 1
  - POST payments $900 → HTTP 422 with denialProof
  ```
* **Status**: `VERIFIED` on HOST-1.
* **Known limit**: server is in-memory until M4 — restarts reseed fresh IDs. Recorded in `docs/UI_AGENT_BRIEF.md` §6.

### 2026-09-24: M4 atomic persistence, live-box restart survival (M4, SUITE-1)
* **Command**: `make test` + EC2 restart drill (`systemctl restart` → journal shows restore → public curl confirms same IDs)
* **Output**:
  ```text
  make test: 36 contract + 13 policy + 23 MCP + 8 server (M3-1…6 + M4-1/2) = 80 passed, 0 failed
  live box: [persist] restored 2 space(s) from /var/lib/microcosm/microcosm-data.json
            (8.4 KB snapshot; same space IDs + balances before/after restart)
  ```
* **Status**: `VERIFIED` on M4, SUITE-1.
* **Design note**: atomic write-tmp-then-rename (crash-safe), corrupt snapshots refuse to boot, snapshot files git-ignored. Chose file snapshots over SQLite: zero native deps, KBs on disk, same State Continuity guarantee at this scale.

### 2026-09-19: Production Hardening — Attestation, Internet Court Adjudication, Deployment Pipeline (ATTEST-1/2, ADJUD-1/2, WORK-8/9, DEPLOY-1, SUITE-1)
* **Command**: `make test` && `npm run demo` && `forge script script/DeployXLayer.s.sol:DeployXLayer --rpc-url http://127.0.0.1:8545 --broadcast` (local EVM)
* **Output**:
  ```text
  make test:
    - 36 Solidity contract tests PASS (EnvelopeRegistry 8, AgenticCommerce 11, SettlementFlows 4, Attestation 8, Adjudication 5)
    - 13 Space policy engine tests PASS (SPACE-1…7 + unit conversion + ATTEST-JS-1…5)
    - 14 MCP server tests PASS (MCP-1…4 + WORK-1…9 incl. court verdict flows)
    Total: 63 passed, 0 failed

  Offchain/onchain attestation cross-check:
    - forge test --match-test testDigestFixtureVector -vvvv →
      digest 0x6de0e9235ca74a6f96f11a80d14e386e6969fe4ad84d3a35b802c40b720f3999
    - policy-engine ATTEST-JS-2 asserts the identical constant → PASS (byte-for-byte match)

  npm run demo: all 9 steps pass (Work loop + $900 denial + Gaia refund).
    UPDATE 2026-09-22: settlement receipts carry `simulated: false` — real onchain transfers via the deployed contracts; simulated fallback only when no key/RPC
    and no onchain transfer occurs; this is `TESTED`, not `E2E_VERIFIED`.

  forge script broadcast (local EVM pre-flight of the X Layer pipeline):
    - ONCHAIN EXECUTION COMPLETE & SUCCESSFUL
    - 5/5 receipts status 0x1 (EnvelopeRegistry, SettlementRouter, ClaimEscrow, MockERC20, AgenticCommerce)
    - Runtime bytecode present at all 5 deployed addresses
    - Artifact: contracts/broadcast/DeployXLayer.s.sol/31337/run-latest.json
  ```
* **Status**: `VERIFIED` on ATTEST-1, ATTEST-2, ADJUD-1, ADJUD-2, WORK-8, WORK-9, DEPLOY-1, SUITE-1.
* **Known external gaps** (recorded, not blocking local verification): live `make fork-test` / `make deploy-testnet` / `make verify-contracts` against OKX X Layer testnet require network access plus a funded `PRIVATE_KEY` and `OKLINK_API_KEY`; see `forge/FAILURES.md`.

### 2026-09-19: First-Class Work Lifecycle & Gaia Exception Handling (WORK-1…WORK-4, E2E-2, SUITE-1)
* **Command**: `make test` && `npm run demo`
* **Output**:
  ```text
  make test:
    - 23 Solidity contract tests PASS (SettlementFlows 4, AgenticCommerce 11, EnvelopeRegistry 8)
    - 8 Space policy engine tests PASS (SPACE-1…SPACE-7 + boundary)
    - 12 MCP server tests PASS (MCP-1…MCP-4 + WORK-1…WORK-7 incl. daily-budget escrow regression)
    Total: 43 passed, 0 failed

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

## DEPLOY-2 (re-broadcast 2026-09-22): 5/5 receipts status 0x1 on chain 1952, runtime bytecode matches compiled artifacts, 5/5 Sourcify exact_match

* **VERIFIED — 2026-09-22.** New funded deployer `0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367` (0.2 OKB). Evidence:
  * `cd contracts && forge script script/DeployXLayer.s.sol:DeployXLayer --rpc-url https://testrpc.xlayer.tech --broadcast --slow` → **5/5 receipts `status 0x1`**.
  * Onchain runtime bytecode equals compiled artifacts: EnvelopeRegistry 4897, SettlementRouter 10718, ClaimEscrow 7824, MockERC20 3201, AgenticCommerce 21296 bytes (verified via `cast code` against the live RPC).
  * Sourcify verification: **5/5 `exact_match`** (job IDs recorded in this session's transcript; addresses in `forge.json` → `deployment.deployments.testnet`).
  * Fresh deployer addresses (supersede the 2026-09-21 set): EnvelopeRegistry `0xfcc29e1a…4B3764F6`, SettlementRouter `0xe772f79C…0Cb6a2E6`, ClaimEscrow `0x767C79c9…89bF863945`, MockERC20 `0x6176287b…eeE289e7`, AgenticCommerce `0xCdddCDC4…7Be92a81`.
  * Chain-id defaults corrected to 1952 in `mcp/src/space-store.js` (seed Space) and test assertions; demo print updated.

## RUNTIME-LIVE (2026-09-22): MCP runtime settles REAL USDC on chain 1952 via deployed contracts

* **VERIFIED — 2026-09-22.** `mcp/src/xlayer.js` (`XLayerAdapter`) bridges the SpaceStore to the deployed `AgenticCommerce` kernel: `createJob → setBudget → fund (approve + transferFrom) → submit → complete` executed onchain via `cast send`. Evidence:
  * `npm run demo` → Step 5 settlement receipt `simulated: false`, tx `0x343dc6f488921ede4734e1b5f0b53e919dfbc5ddf5bd68a18607c193d14a8ac8` (REAL transfer); court-verdict settlement tx `0x5fad6927872ba7952f54ab8e3a1e45f98b15a91b83d9dfbccdba9081d17f19ef` (REAL transfer).
  * Onchain USDC balances after the run (`cast call balanceOf` against live RPC): provider `0xeE791E89…` holds 2310.000000 USDC, kernel escrow holds 4335.000000 USDC — real token movement, not in-memory arithmetic.
  * Suites stay green: MCP 21/21, policy 13/13, contracts 36/36.
  * Fallback: when no key/RPC is available, receipts carry `simulated: true` and a random hash — announced, never a claim of a real transfer (per AGENTS.md).
  * Remaining simulation: the Internet Court verdict itself (no onchain court deployed); the settlement it triggers is real.

## SLICES-3-10 (2026-09-22): rebaseline slices closed, tests deterministic, demo real

* **VERIFIED — 2026-09-22.** Evidence:
  * Slice 3/4 receive path: `requests_receive` returns Request + Context + Authority (rules, daily-budget remaining, approved counterparties, canAssigneeComplete) + Space info + involved participants. `REQ-5` PASS.
  * Slice 5 binding: `work_create({requestId})` sets `request.workId` on the store and returns the binding. `REQ-6` PASS.
  * Slice 8 inspector: `activity_trace` walks Request → Work → Result → Authorization → Payment → Receipt → Activity in one payload. `REQ-6` PASS.
  * Slice 10 demo: `npm run demo` now leads Create Space → Add people + agent → Create request → Agent receives → Works → Result → Rules checked → Payment → Activity. Settlement tx `0xd22e6497…` **REAL onchain**.
  * Slice 1: `spaces_create` / `spaces_fund` added (Space is created and capitalized through the surface, not seeded).
  * Determinism: live settlement is gated behind `XLAYER_LIVE=1` (set by the demo script only). `npm run test:mcp` is offline and deterministic again — **23/23 in 0.8s**.
  * Gate: contracts 36/36, policy 13/13, MCP 23/23, ledger check passes.
