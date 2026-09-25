# Handoff — Live-Settlement Backend Track

Date: 2026-09-24. Previous agent's battery dying; everything below is the
full context needed to continue and complete. Push state: everything here
is on `origin/main` unless marked UNCOMMITTED (nothing should be — verify
with `git status -s`).

## 1. Mission status

Simulations are OUT of production code. Settlement is live-first, loud on
failure, books-after-success. Proven on testnet (chain 1952) with real money:
$1 first-contact, $1 escrow recovery, **$350 demo settlement
(tx `0x571c3b81a30477a842d5a8271a90c7f33d267b2dc16c18f2003dac357a30d271`,
verified `status 1` onchain, JobCompleted job 87, block 41852775)**.
Net USDC loss: zero (self-transfers + refunds; gas only).

## 2. Scoreboard (evidence-backed only)

- Contracts (foundry): 36/36 green (local + EC2).
- MCP offline: 19/19 green, provably chain-free.
- MCP live (anvil): 5/6 — LIVE-1..5 move REAL USDC (distinct provider-key
  submit proven). LIVE-6 fails: 6th consecutive settle hangs one RPC call
  ~45s. Root cause narrowed (see §5), fix written, NOT yet verified.
- SDK client (5) + ABI drift (3): green locally.
- Server conformance (live), wizard live test, demo testnet re-run: WRITTEN,
  NOT yet executed green (see §4 for order).
- EC2 hosted API (`:8791`, systemd): serving a STALE pre-refactor build.
  Redeploy LAST, after green.
- Testnet spend so far: ~$352 moved to self + gas. Balances last checked:
  ~0.198 OKB, ~5B mock USDC at deployer `0x066cFaf02c08D4D2df5FaB2F93bf1B5dB1292367`.

## 3. Do next, in this order

1. `node --test mcp/test/live-settlement.test.js` (local OK for ONE run;
   heavy suites belong on EC2). Expect 6/6 after the §5 fix. If LIVE-6
   still fails, read its `_raw` text — do NOT re-theorize blind (see §5).
2. `make test` full gate locally if cheap, else EC2.
3. Testnet recorded runs: `npm run demo` (needs `.env` key — see §6) then
   wizard test in testnet mode (`XLAYER_RPC_URL=https://testrpc.xlayer.tech`
   + key; micro $1–5/job; provider keeps USDC — user approved micro-spend).
4. Ledger: new entries with the REAL tx hashes (demo `0x571c…`, recovery
   `0x8513…`/`0x34c1…`, first-contact `0x06c5…`, plus new ones). Remove
   `simulated` from `docs/API_CONTRACT.md`.
5. EC2 redeploy (`git pull` + `systemctl restart microcosm-server`), verify
   `:8791/health`, drop `--seed` concerns (seed no longer settles — safe).
6. M8 video + remaining tracks (UI app, court PARKED per
   `docs/COURT_AGENT_BRIEF.md`, GenLayer later).

## 4. EC2 access (EXPIRED — user must `aws login` first)

- Instance `i-07bd826a6cba642fa` (us-west-2), SSM only (no SSH keys needed).
- Repo at `/opt/microcosm-x`. Foundry 1.8.3 at `/root/.foundry/bin`
  (symlinked to /usr/local/bin). SSM shells need
  `export HOME=/root` (nounset breaks foundryup otherwise).
- Service `microcosm-server` (:8791, user `ssm-user`, snapshot at
  `/var/lib/microcosm/microcosm-data.json`).
- SG: 22 + 8791 only. Port 8787 belongs to another local workload — never
  expose it (lesson learned, rule revoked).
- **SSM timeout ≠ remote stop.** A timed-out `send-command` keeps running
  server-side; orphaned suite runs then duel over anvil ports. Always
  `pkill -x anvil` (exact name — NEVER `pkill -f` with a self-matching
  pattern, it kills your own shell) before a fresh run, and prefer sleeps
  shorter than the tool timeout.

## 5. The anvil saga (everything learned — read before touching harness)

- `mcp/test/helpers/chain.mjs` boots per-file anvils (ports 18545/18546/…),
  parses keys from the banner (NEVER hardcode — a past session's memorized
  keys were wrong and cost hours), deploys via `forge script --broadcast
  --slow --sender <derived>` (--sender required by forge ≥1.8; --slow
  paces bursts — the deploy command in the key file uses it too).
- Red herrings already eliminated: CPU/RAM/FDs/sockets/proxy/stale
  processes/mnemonic/stderr pipes (drained + detached — keep it that way).
- Live finding: rapid-fire `cast send` reuses stale nonces on laggy RPCs
  (`nonce too low`) → `makeSequencer` assigns explicit nonces with one
  refetch-retry. BUT explicit nonces on automining anvil risk gaps that hang
  receipt-polling 45s → sequencer SKIPS explicit nonces on localhost, uses
  them on remote. Same txs either way; documented in code.
- "MPP HTTP request / failed to retrieve chain ID from fork endpoint" is
  foundry-1.8 wording for plain RPC timeouts, not a fork problem.
- `contracts/foundry-pp/DeployHelper*` warnings = stale cache, harmless.
- Anvil banner account/key formats vary by foundry version — always parse,
  never assume; format-validate parsed keys (harness throws otherwise).

## 6. Secrets & safety (non-negotiable)

- Testnet deployer key: local `.env` ONLY (mode 600, gitignored — verified).
  EC2 has NO key and needs none (server/seed settle nothing). Testnet runs
  happen from a key-holding machine. NEVER print keys, NEVER put them in
  SSM commands (logged), scripts, or commits. `scrubSecrets()` in xlayer.js
  redacts them from error output — keep it.
- **Incident:** the key value appeared once in tool output during the nonce
  failure. Treat as exposed: testnet-only funds, low risk, but recommend
  rotation when convenient. `git log -p -- .env` must stay empty (CI checks).
- No testnet spend beyond approved micro-amounts. Provider wallets KEEP
  disbursed USDC — re-running the demo repeatedly accumulates there.

## 7. File map of this track's changes

- `mcp/src/xlayer.js` — env-configurable chain/contracts, exact-decimal
  budgets, loud validation, sequencer, secret scrubbing, `liveReady()`,
  `deployerAddress()`.
- `mcp/src/space-store.js` — settle-first/books-after, chain+address
  checks, `simulated` field REMOVED (update API_CONTRACT accordingly).
- `mcp/test/helpers/chain.mjs`, `mcp/test/live-settlement.test.js` —
  harness + live suite; `mcp-server.test.js` trimmed to offline + REQ-6b.
- `packages/sdk/` (client, abis.json, 3 test files), server conformance
  live-ified, `seed.js` fabricates nothing, demo live-ready + de-simulated,
  `package.json`/`Makefile` gates extended.
- `docs/UI_APP_V2_REQUEST.md` — UI agent's v2 filing (theirs, do not touch).
- `docs/API_CONTRACT.md` — STILL documents removed `simulated` field: fix
  during step 4 of §3.
