# Microcosm HTTP/SSE API Contract — v2 (FROZEN)

Status: v2 is frozen for UI-agent parallel build. Existing capability and payment routes remain unchanged; M14 adds read-only capability discovery and offline x402 v2 validation. Any v2 change requires a version bump (`v3`) and a ledger entry — never silent drift. Semantic mirror of the MCP surface (`mcp/src/tools.js`): **transport must not change semantics.**

Base URL (dev): `http://localhost:8787`

---

## 1. Conventions

- JSON everywhere. `Content-Type: application/json`.
- Money: USDC decimal strings (`"350.00"`). Hashes: `0x`-hex. Times: ISO-8601.
- Success: `200` (reads), `201` (creates), with the affected entity in the body.
- Errors: `{ "error": { "code": "...", "message": "...", "details": {...} } }`
  - `400` validation (missing/malformed fields)
  - `404` unknown space / request / job / participant
  - `409` illegal state transition (e.g. evaluate a `Funded` job, double vote)
  - `422` policy denial — body carries the full `denialProof` (Sandbox renders this)
- Receipts always carry `simulated: boolean`. `false` = real tx hash from the
  chain; `true` = announced fallback. The UI must render the flag (CON-06).
- Pagination: `?limit=50&cursor=<seq>` → `{ items, nextCursor }`. Activity
  records carry monotonically increasing `seq` per space.

## 2. Endpoints

### Health

- `GET /api/health` → `{ ok: true, network, chainId, time }`

### Spaces

- `GET /api/spaces?actorId=` → `{ spaces: [{ id, name, description, currency, balance, myRole }] }`
- `POST /api/spaces` `{ name, description?, actorId }` → `201 { space }`
- `GET /api/spaces/:id` → `{ space }` (full: rules, treasury, spent, members)
- `GET /api/spaces/:id/bounds?actorId=` → `{ spaceId, treasuryBalance, spentToday, escrowed, remaining, dailyBudget, maxPerTransaction, denials }`
  - **Hero dial binding.** `remaining = dailyBudget - spentToday - escrowed` (floored at 0). `denials` = count of denied attempts.
- `GET /api/spaces/:id/capabilities?actorId=` → Space rules + treasury + actor role
- `GET /api/spaces/:id/capability-manifest` → `200 { manifest }` with deterministic schema `microcosm.space.capability-manifest/v1`; includes only Space identity, network, chain, currency, capability IDs, and safe policy limits.
- `POST /api/spaces/:id/fund` `{ amount, actorId }` → `200 { space }` (capitalise treasury)

### Participants

- `GET /api/spaces/:id/participants?kind=&status=` → `{ participants: [{ id, kind, displayName, address, status }] }`
  - `kind`: `human | agent | service | organization | counterparty`
- `POST /api/spaces/:id/participants` `{ kind, displayName, address?, actorId? }` → `201 { participant }`
- `POST /api/spaces/:id/participants/:pid/deactivate` `{ actorId }` → `200 { participant }`

### Requests (first-class, Slice 3–6)

- `GET /api/spaces/:id/requests?status=&assignee=` → `{ requests }`
- `POST /api/spaces/:id/requests` `{ createdBy, assignee?, title, instructions?, context? }` → `201 { request }`
  - statuses: `Open → Assigned → Completed | Blocked | Cancelled` (`accept` assigns; `complete` requires `Assigned`/`InProgress`)
- `GET /api/spaces/:id/requests/:rid` → `{ request }`
- `POST /api/spaces/:id/requests/:rid/accept` `{ actorId }` → `200 { request }`
- `POST /api/spaces/:id/requests/:rid/complete` `{ actorId, result }` → `200 { request }` (result attaches to bound Work)
- `POST /api/spaces/:id/requests/:rid/block` `{ actorId, reason }` → `200 { request }`
- `POST /api/spaces/:id/requests/:rid/cancel` `{ actorId, reason }` → `200 { request }`
- `GET /api/spaces/:id/requests/:rid/receive?actorId=` → `{ request, context, authority, space }` (agent handoff payload)
- `GET /api/spaces/:id/requests/:rid/trace` → `{ request, work, result, authorization, payment, receipt, activity }` (continuity view)

### Work (escrow → proof → settle/refund)

- `GET /api/spaces/:id/work` → `{ jobs: [{ jobId, status, budget, escrowedAmount, provider, evaluator, deliverableHash, ... }] }`
- `POST /api/spaces/:id/work` `{ actorId, provider, evaluator, adjudicator?, rubricHash?, description, budget, deadline, requestId? }` → `201 { job, escrowedAmount, remainingBalance }`
  - statuses: `Funded → Submitted → Completed | Rejected | Expired | Adjudicating`
- `GET /api/spaces/:id/work/:jobId` → `{ job }`
- `POST /api/spaces/:id/work/:jobId/submit` `{ actorId, deliverableHash, evidenceUri? }` → `200 { job }`
- `POST /api/spaces/:id/work/:jobId/evaluate` `{ evaluatorId, approved, feedback? }` → `200 { job, receipt? | gaiaRefund? }`
- `POST /api/spaces/:id/work/:jobId/request-verdict` `{ actorId }` → `200 { job, case }` (`case` = `{ caseId, deliverableHash, evidenceUri, rubricHash }`)
- `POST /api/spaces/:id/work/:jobId/post-verdict` `{ adjudicatorId, approved, reason? }` → `200 { job, receipt? | gaiaRefund? }`

### M14 read-only discovery and x402 validation

- `POST /api/spaces/:id/payments/x402/validate` `{ paymentRequired, selectedAcceptIndex, actorId, expectedAssetAddress }` → `200 { validation }`.
- Only x402 version 2 is accepted. The selected accept index is mandatory; the first option is never selected implicitly.
- The validator checks `network === "eip155:<space.chainId>"`, the exact explicitly configured asset address, non-zero `payTo`, positive uint256 atomic `amount`, and bounded `maxTimeoutSeconds` (`1..3600`). The amount is converted to six-decimal decimal text without floating point and then checked against Space policy.
- The response is validation only: no signing, settlement, RPC, receipt, or Space mutation. The existing `/payments` route is unchanged.

### Payments (bounded disbursement)

- `POST /api/spaces/:id/payments` `{ actorId, recipient, amount, memo? }` → `200 { receipt, remainingBalance }` or `422 { denialProof, reasons }`

### Activity & live stream

- `GET /api/spaces/:id/activity?limit=&cursor=` → `{ activity: [{ seq, type, ... }], nextCursor }`
- `GET /api/spaces/:id/events?since=` → **text/event-stream**
  - wire: `event: <TYPE>\ndata: <json>\n\n`, `:heartbeat` comments every 20s
  - envelope: `{ seq, type, at, spaceId, payload }`
  - `type` values mirror activity types: `SPACE_CREATED`, `SPACE_FUNDED`, `PARTICIPANT_ADDED`, `PARTICIPANT_REMOVED`, `REQUEST_CREATED`, `REQUEST_ACCEPTED`, `REQUEST_COMPLETED`, `REQUEST_BLOCKED`, `REQUEST_CANCELLED`, `WORK_CREATED`, `WORK_DENIED`, `WORK_SUBMITTED`, `WORK_COMPLETED`, `WORK_REJECTED`, `WORK_EXPIRED`, `WORK_ADJUDICATION_REQUESTED`, `WORK_ADJUDICATION_RESOLVED`, `PAYMENT_SETTLED`, `PAYMENT_DENIED`

## 3. TypeScript shapes (mirrored in M5 SDK)

```ts
type JobStatus = 'Funded' | 'Submitted' | 'Completed' | 'Rejected' | 'Expired' | 'Adjudicating';
type RequestStatus = 'Open' | 'Assigned' | 'InProgress' | 'Completed' | 'Blocked' | 'Cancelled';
interface Bounds { spaceId: string; treasuryBalance: string; spentToday: string; escrowed: string; remaining: string; dailyBudget: string; maxPerTransaction: string; denials: number; }
interface Receipt { receiptId: string; txHash: string; amount: string; asset: string; network: string; chainId: number; status: 'SETTLED'; simulated: boolean; deliverableHash?: string; }
interface DenialProof { spaceId: string; actorId: string; requestedAmount: string; reasons: string[]; proofHash: string; }
interface ApiError { error: { code: 'VALIDATION' | 'NOT_FOUND' | 'STATE_CONFLICT' | 'POLICY_DENIAL'; message: string; details?: { denialProof?: DenialProof; reasons?: string[] } } }
```

## 4. Seed & dev server

- `npm run dev --workspace=@microcosm/server` boots on `:8787` with CORS open for `http://localhost:3000`.
- `npm run seed --workspace=@microcosm/server` (or `--seed` flag) boots a populated demo Space: founder + agent + counterparty, funded treasury, one request accepted, one job `Submitted`, one settled payment, one denial. IDs are printed on boot; reboot re-seeds fresh.
- UI agent runs against the live dev server. No fixture bundles.

## 5. Conformance (proves interface equivalence, Slice 9)

The same business loop — create Space → add participants → create/accept request → work → submit → evaluate → payment → activity — must pass through **MCP, REST, and SDK** with identical terminal states. `packages/server/test/conformance.test.js` executes the REST leg; MCP leg lives in `mcp/test/`; SDK leg in `packages/client/test/`. Any divergence is a P0 defect, not a documentation issue.
