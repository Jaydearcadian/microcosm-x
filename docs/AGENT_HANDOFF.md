# Agent Handoff — Microcosm rebaseline build

Date: 2026-09-22 (session) · Branch `main` @ commit `37a3712` · **pushed to GitHub** (`Jaydearcadian/microcosm-x`)

## 1. Where we are (one paragraph)

The product loop demanded by Rebaseline v2 is built and running: a company creates a Space, adds
people and an agent as participants, creates a Request, the agent receives it with its Context and
Authority, performs Work bound to that Request, returns a Result, Space rules are evaluated (and
violations rejected with DenialProof), payment settles **for real on OKX X Layer Testnet chain 1952**
through the deployed `AgenticCommerce` kernel, and `activity_trace` walks the entire evidence chain.
All four suites are green and the test suite is deterministic and offline again.

## 2. Verification snapshot (reproduce with these)

| Suite | Command | Result |
|---|---|---|
| Contracts | `cd contracts && forge test` | 36/36 pass |
| Policy engine | `npm run test:policy` | 13/13 pass |
| MCP server (offline) | `node --test mcp/test/mcp-server.test.js` | 19/19 pass, ~0.6s, offline |
| Server persistence | `node --test packages/server/test/persistence.test.js` | 2/2 pass (M4 snapshots) |
| SDK client & ABIs | `node --test packages/sdk/test/client.test.js packages/sdk/test/abis.test.js` | 8/8 pass |
| Total Offline Gates | `node scripts/verify-proof-ledger.mjs` | 78 tests across 7 suites pass, 26/26 claims VERIFIED |
| Demo (live) | `npm run demo` | 11 steps, REAL onchain settlement |
| Hardened Ledger Gate | `node scripts/verify-proof-ledger.mjs` | passes (executes all 7 suites zero-mock) |

Live settlement evidence from the last demo run: tx `0xd22e6497de74e94011ba0502df161acff72f82072193a4a90871aa79ab6eb9a2`,
`receipt.simulated === false`, chain 1952. Provider wallet `0xeE791E89F4Ad69662A96dcb2ABa52Eb8dcbDCEEE`.

## 3. Deployment (chain 1952, 2026-09-22) — 5/5 receipts `0x1`, Sourcify 5/5 `exact_match`

| Contract | Address | Runtime bytecode |
|---|---|---|
| EnvelopeRegistry | `0xfcc29e1AC8860a3E0aE50bd8706189464B3764F6` | 4897 |
| SettlementRouter | `0xe772f79C10fac15e52909B376633A3e80Cb6a2E6` | 10718 |
| ClaimEscrow | `0x767C79c97Aee5440f70074309a3efd89bF863945` | 7824 |
| MockERC20 (USDC, 6dp) | `0x6176287b2E80374B41388029f0b87Eb6eeE289e7` | 3201 |
| AgenticCommerce | `0xCdddCDC435f9C6C4a38D1E421b89fdcD7Be92a81` | 21296 |

Deployer / Space authority: `0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367` (funded 0.1995 OKB; holds
5,000,000 mock USDC). Provider wallet `0xeE791E89…` holds its own key at `/tmp/ppk.txt`.
`.env` (gitignored) holds `PRIVATE_KEY` and `OKLINK_API_KEY`.

## 4. Rebaseline v2 slice status

| Slice | Status | Where |
|---|---|---|
| 1 Space boundary | **Done** | `spaces_create`, `spaces_fund`, `spaces_list`, `spaces_capabilities` |
| 2 Participants | **Done** | `participants_add/list/deactivate`; seeded + audit-recorded |
| 3 Request | **Done** | `requests_create/list/get/accept/complete/block/cancel` |
| 4 Agent receives Request | **Done** | `requests_receive` → Request + Context + Authority + Space info |
| 5 Work | **Done** | `work_create({requestId})` sets `request.workId`; binding returned |
| 6 Result | **Done** | `requests_complete({result})`; `job.deliverableHash` |
| 7 Payment | **Done** | receipts bind `jobId`/`deliverableHash`; real onchain settlement |
| 8 Activity & Evidence | **Done** | `activity_trace` walks Request → Work → Result → Auth → Payment → Receipt → Activity |
| 9 Interface equivalence | **Not started** | only MCP exists; no REST (`POST /requests`), no SDK facade, no UI |
| 10 Demo rebaseline | **Done** | demo leads Create Space → Add people/agent → Request → receive → work → rules → payment → activity |

MCP now exposes **24 tools**. Language rule held: only `Space`-nouns leak externally.

## 5. Key files

- `mcp/src/space-store.js` — the store: Spaces, participants, Requests, Work, receipts, activity, trace
- `mcp/src/tools.js` — 24 MCP tool definitions + handlers
- `mcp/src/xlayer.js` — `XLayerAdapter`: real onchain settlement via `cast send`
- `mcp/src/provider-key.js` — provider signing key for the onchain `submit` step
- `scripts/demo-procurement-space.mjs` — the Slice 10 business-loop demo
- `packages/policy-engine/src/index.js` — Space policy; accepts member name or id as `actorId`
- `docs/canonical/REBASELINE_v2.md` — the canonical spec being implemented

## 6. Design decisions worth knowing

1. **Live settlement is opt-in**: gated behind `XLAYER_LIVE=1`, which only `npm run demo` sets. Tests
   stay offline and deterministic (they use the announced `simulated: true` fallback). Without this,
   the suite took 3.5 min and spent real USDC per run.
2. **`receipt.simulated` is the honesty flag**: `false` = real tx hash from the chain; `true` =
   announced fallback with a random hash. Never claim a real transfer when the fallback fired.
3. **Actors are address-backed**: onchain calls need addresses, so Space members carry `address` and
   the store resolves member id/name → wallet address before `createJob`.
4. **Request↔Work binding lives in the store**, not the demo.

## 7. Push status: DONE

Pushed to `github.com/Jaydearcadian/microcosm-x` (canonical name; the lowercase URL redirects).
`gh auth setup-git` wired HTTPS credentials from the `Jaydearcadian` account, and `origin` was
updated to the canonical URL so git stops following the redirect.

```
31aada6..37a3712  main -> main
```

Verified remotely with `gh api repos/Jaydearcadian/microcosm-x/commits/main` → `37a3712`,
and `mcp/src` on GitHub now lists `provider-key.js server.js space-store.js tools.js xlayer.js`.

Note: `/root/.config/gh/hosts.yml` also holds a broken `etvjay` account (invalid token). It is
inactive; ignore it, or `gh auth logout -h github.com -u etvjay` to silence the warning.

## 8. Next work (in order)

1. **Frontend / UI Build**: The user is building the Charcoal horological UI in `apps/charcoal` against the frozen v1 API contract (`docs/API_CONTRACT.md`).
2. **Onchain court (M13)**: The court track (`docs/COURT_AGENT_BRIEF.md`) is parked for later phase.
3. **Backend Conformance / Local Anvil alignment**: Two non-blocking issues filed for backend owner in `forge/FAILURES.md` (`FAIL-SRV-01` variable scope, `FAIL-SDK-01` local chain ID).
4. **CI & Verification Gate**: SHIPPED. Hardened `scripts/verify-proof-ledger.mjs` executes all 7 suites zero-mock; `.github/workflows/ci.yml` gates merge.

## 9. Ground rules (unchanged, from AGENTS.md)

Repository files are the source of truth. No `VERIFIED` without executed evidence (record the command
in `forge/PROOF_LEDGER.md`). Never weaken a test. No mock/fake success paths in production code — dev
fallbacks must announce themselves. `Space` is the single kernel noun. Don't rebuild from scratch or
remove working behavior.
