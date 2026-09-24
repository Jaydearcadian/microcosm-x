# Agent Handoff — Microcosm rebaseline build (RebaselineBuild phase complete)

Date: 2026-09-22 · Branch `main` @ `31aada6` + uncommitted working tree · FORGE 1.4 control plane

## State: all suites green, all 5 rebaseline tasks done

| Suite | Command | Result |
|---|---|---|
| Contracts (X Layer) | `cd contracts && forge test` | 36 passed, 0 failed |
| Policy engine | `npm run test:policy` | 13 passed, 0 failed |
| MCP server | `npm run test:mcp` | 21 passed, 0 failed |
| Demo | `npm run demo` | 10 steps, REQUEST loop + WORK + policy boundaries, LOCAL SIMULATION labeled |
| Proof ledger gate | `node scripts/verify-proof-ledger.mjs` | All claims adhere |

## What this working tree adds (uncommitted, 16 files, +923/−301)

1. **`participants_*` tools** (`mcp/src/tools.js`, `mcp/src/space-store.js`): `participants_add` /
   `participants_list` / `participants_deactivate`. Kinds: Human, Agent, Service, Organization,
   Counterparty. Participants are Space members with a declared kind — agents are ordinary
   participants, not the center of the architecture (rebaseline §6). Seed Procurement Space
   registers its two members as participants; deactivation is audit-recorded, not erased.
2. **`requests_*` tools** (`mcp/src/tools.js`, `mcp/src/space-store.js`): `requests_create` /
   `requests_list` / `requests_get` / `requests_accept` / `requests_complete` / `requests_block` /
   `requests_cancel`. Request is the first-class product object (rebaseline §8, §17 Slice 3):
   Open → Assigned → (InProgress) → Completed/Blocked/Cancelled. `Result` field is the
   Payment-connection point. Non-participants cannot create; strangers cannot complete; completed
   and cancelled Requests are state-gated.
3. **Demo rewritten** (`scripts/demo-procurement-space.mjs`): Request-driven business loop. Human
   creates Request → agent accepts → Work Order escrows → provider submits proof → evaluator
   approves → agent completes with Result → control-boundary denial → Gaia refund → Internet Court
   adjudication → full audit trail including REQUEST_CREATED/REQUEST_COMPLETED and participant events.
4. **Settlement receipts carry `simulated: true`** and the mock txHash comment cites AGENTS.md
   (dev adapters announce themselves; never claim a real onchain transaction).
5. **Seed repair during this session**: `dailyBudget: '2000.00'` and `this.activity.set(...)`
   restored in `seedProcurementSpace()` — they had been dropped by an earlier edit; MCP-1 and all
   payments/Work tests failed until restored.

## MCP surface for the next agent

`mcp/src/tools.js` now exposes **20 Space operations**: `spaces_list`, `spaces_capabilities`,
`payments_request`, `activity_list`, `work_create`, `work_submit`, `work_evaluate`,
`work_request_verdict`, `work_post_verdict`, `participants_add`, `participants_list`,
`participants_deactivate`, `requests_create`, `requests_list`, `requests_get`, `requests_accept`,
`requests_complete`, `requests_block`, `requests_cancel` — plus the Work-lifecycle helpers.
Language rule: only `Space`-nouns leak externally; no pacts/paths/envelopes/routes jargon.

## Known gaps (not started, per MILESTONES / DECISIONS)

- **M6 BLOCKED_EXTERNAL**: live OKX X Layer Testnet broadcast pending funded private key (`EXT-01`
  in `forge/FAILURES.md`, now RESOLVED per earlier session — re-check). Contracts deploy locally;
  runtime settlement is simulated, not onchain.
- **No persistence layer**: `SpaceStore` is in-memory (`packages/policy-engine/src/storage` is
  M4 IN PROGRESS per rebaseline; Disk/SQLite deferred).
- **`verify-proof-ledger.mjs` is a Markdown linter, not an evidence gate** — it reads
  `forge/PROOF_LEDGER.md` and passes iff statuses are non-UNTESTED/PARTIAL/FAILED. Self-attesting;
  it never runs tests. If you want a real gate, have it execute the suites and compare.
- **Contract/runtime seam**: `AgenticCommerce.sol` and the JS `SpaceStore` are two parallel
  implementations; the JS one is never called by the onchain runtime. Wiring `SpaceStore.settleJob`
  to actually call the router is the open seam.
- M13/M14 deferred as internal capabilities per `docs/canonical/REBASELINE_v2.md` + DEC-008.

## Ground rules (unchanged, from AGENTS.md)

Repository files are the source of truth; no `VERIFIED` without executed evidence (record command
in `forge/PROOF_LEDGER.md`); never weaken a test; no mock/fake success paths in production code;
`Space` is the single kernel noun; don't rebuild from scratch or remove working behavior.

## How to run

```bash
npm install          # already done; workspaces have zero deps
make test            # contracts + runtime + MCP
make verify          # lint + typecheck + tests + ledger check (ledger gate is doc-lint — see gaps)
npm run demo         # Request-driven business loop, local simulation
```
