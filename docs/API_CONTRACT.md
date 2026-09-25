# Microcosm HTTP/SSE API Contract — v2 (FROZEN) + Governance and M14 Extensions

Status: v2 is frozen for UI-agent parallel build. The existing capability and payment routes remain unchanged; M12 governance and M14 read-only capability discovery/x402 validation are additive extensions. Any v2 change requires a version bump (`v3`) and a ledger entry — never silent drift. Semantic mirror of the MCP surface (`mcp/src/tools.js`): **transport must not change semantics.**

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
  - `401` authentication required — wallet session missing or expired
  - `422` policy denial — body carries the full `denialProof` (Sandbox renders this)
- Receipts are real onchain settlements and carry `txHash`, `txHashes`, and
  `onchainJobId`; there is no `simulated` field. Failed settlement returns an
  error and leaves Space books unchanged.
- Pagination: `?limit=50&cursor=<seq>` → `{ activity, nextCursor }`. Activity
  records carry monotonically increasing `seq` per space.

## 2. Authentication and Space access

Wallet access is address-bound. The client requests a short-lived nonce, signs the exact message with its wallet, and exchanges the signature for an HttpOnly session cookie. Private keys and raw signatures are never sent to or stored by the server.

- `GET /api/auth/session` → `{ authenticated, address, expiresAt }`
- `GET /api/auth/challenge?address=` → `{ address, nonce, message, expiresAt }`
- `POST /api/auth/session` `{ address, signature }` → session response plus `Set-Cookie`
- `POST /api/auth/logout` → clears the session cookie
- `POST /api/spaces/:id/invitations` `{ address?, role?, displayName? }` → admin-only bearer invite code; omit `address` for a transferable link
- `POST /api/auth/invitations/redeem` `{ code }` → authenticated address claims the invite once and becomes a Space member; an explicitly supplied target address remains enforced

## 3. Endpoints

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

- `GET /api/spaces/:id/participants?kind=&status=` → `{ participants: [{ participantId, kind, displayName, address, status }] }`
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
- `POST /api/spaces/:id/work` `{ actorId, provider, evaluator, adjudicator?, rubricHash?, description, budget, deadline, requestId? }` → `201 { status, job, request?, spaceBalance }`
  - statuses: `Funded → Submitted → Completed | Rejected | Expired | Adjudicating`
- `GET /api/spaces/:id/work/:jobId` → `{ job }`
- `POST /api/spaces/:id/work/:jobId/submit` `{ actorId, deliverableHash, evidenceUri? }` → `200 { job }`
- `POST /api/spaces/:id/work/:jobId/evaluate` `{ evaluatorId, approved, feedback? }` → `200 { job, receipt? | gaiaRefund? }`
- `POST /api/spaces/:id/work/:jobId/request-verdict` `{ actorId }` → `200 { job, case }` (`case` = `{ caseId, deliverableHash, evidenceUri, rubricHash }`)
- `POST /api/spaces/:id/work/:jobId/post-verdict` `{ adjudicatorId, approved, reason? }` → `200 { job, receipt? | gaiaRefund? }`

### M14 read-only discovery and x402 validation

- `POST /api/spaces/:id/payments/x402/validate` `{ paymentRequired, selectedAcceptIndex, actorId, expectedAssetAddress }` → `200 { validation }` with protocol and policy checks only; no signing, settlement, RPC, or Space mutation.
- `paymentRequired` must be x402 version 2. `selectedAcceptIndex` is mandatory and selects exactly one `accepts` entry; the first entry is never selected implicitly.
- Validation requires `network === "eip155:<space.chainId>"`, the exact explicitly configured `expectedAssetAddress`, a non-zero EVM `payTo`, a positive uint256 atomic `amount`, and `maxTimeoutSeconds` in the bounded range `1..3600`.
- The atomic amount is converted to a six-decimal decimal string without floating point and evaluated through the existing Space policy, including transaction cap, daily budget, and counterparty allowlist.
- The existing `/payments` route is unchanged. The M14 route never returns a receipt, signature, settlement status, or protocol-specific Space fields.

### Payments (bounded disbursement)

- `POST /api/spaces/:id/payments` `{ actorId, recipient, amount, memo? }` → `200 { status, receipt, spaceBalance }` or `422 { error: { code: "POLICY_DENIAL", details: { denialProof, reasons } } }`

### Governance extension — M12 (additive, authenticated)

The existing `/payments` route remains unchanged. Governance is enabled only
when the Space has an explicit configuration containing `enabled: true`, an
integer `threshold`, and an EVM-address `signerAllowlist`. Signer identities
are recovered from the signature and, over REST, from the HttpOnly session;
request-body addresses are ignored.

The approval message is EIP-712 `GovernancePaymentApproval` with domain
`Microcosm Governance`, version `1`, and the Space chain ID. It binds
`requestId`, `spaceId`, `recipient`, `amount`, `asset`, `memo`, `nonce`,
`deadline`, and `policyHash`. `policyHash` commits to the creation-time policy
snapshot. At execution, balance, asset, daily budget, counterparty, schedule,
and membership are evaluated again; only the per-transaction cap may be
overridden by quorum.

- `GET /api/spaces/:id/governance/payments` → `200 { governance }`
- `POST /api/spaces/:id/governance/payments` `{ recipient, amount, deadline, memo? }` → `201 { request, typedData }`
- `GET /api/spaces/:id/governance/requests?status=` → `200 { requests }`
- `GET /api/spaces/:id/governance/requests/:requestId` → `200 { request }`
- `POST /api/spaces/:id/governance/requests/:requestId/sign` `{ signature }` → `200 { request }`; the session address is the signer
- `POST /api/spaces/:id/governance/requests/:requestId/execute` `{}` → `200 { status: "EXECUTED", request, receipt, spaceBalance }`

Governance request statuses are `PENDING`, `APPROVED`, `EXECUTING`, and
`EXECUTED`. Exactly the configured threshold of unique valid signatures is
required. Duplicate, unauthorized, expired, tampered, and replayed approvals
are rejected. Execution is claimed in-process before settlement and is marked
`EXECUTED` only after the existing live settlement/accounting path succeeds.
Queue, approval, and execution state is included in atomic snapshots; older
snapshots without governance maps remain loadable.

### Activity & live stream

- `GET /api/spaces/:id/activity?limit=&cursor=` → `{ activity: [{ seq, type, ... }], nextCursor }`
- `GET /api/spaces/:id/events?since=` → **text/event-stream**
  - wire: `event: <TYPE>\ndata: <json>\n\n`, `:heartbeat` comments every 20s
  - envelope: `{ seq, type, at, spaceId, payload }`
  - `type` values mirror activity types: `SPACE_CREATED`, `SPACE_FUNDED`, `PARTICIPANT_ADDED`, `PARTICIPANT_REMOVED`, `REQUEST_CREATED`, `REQUEST_ACCEPTED`, `REQUEST_COMPLETED`, `REQUEST_BLOCKED`, `REQUEST_CANCELLED`, `WORK_CREATED`, `WORK_DENIED`, `WORK_SUBMITTED`, `WORK_COMPLETED`, `WORK_REJECTED`, `WORK_EXPIRED`, `WORK_ADJUDICATION_REQUESTED`, `WORK_ADJUDICATION_RESOLVED`, `PAYMENT_SETTLED`, `PAYMENT_DENIED`

## 4. TypeScript shapes (mirrored in M5 SDK)

```ts
type JobStatus = 'Funded' | 'Submitted' | 'Completed' | 'Rejected' | 'Expired' | 'Adjudicating';
type RequestStatus = 'Open' | 'Assigned' | 'InProgress' | 'Completed' | 'Blocked' | 'Cancelled';
interface Bounds { spaceId: string; treasuryBalance: string; spentToday: string; escrowed: string; remaining: string; dailyBudget: string; maxPerTransaction: string; denials: number; }
interface Receipt { receiptId: string; txHash: string; txHashes: Record<string, string>; onchainJobId: string; amount: string; asset: string; network: string; chainId: number; status: 'SETTLED'; deliverableHash?: string; }
interface DenialProof { spaceId: string; actorId: string; requestedAmount: string; reasons: string[]; proofHash: string; }
interface ApiError { error: { code: 'VALIDATION' | 'NOT_FOUND' | 'STATE_CONFLICT' | 'POLICY_DENIAL' | 'FORBIDDEN'; message: string; details?: { denialProof?: DenialProof; reasons?: string[] } } }
interface GovernanceConfig { enabled: true; threshold: number; signerAllowlist: string[] }
interface GovernanceRequest { requestId: string; spaceId: string; recipient: string; amount: string; asset: string; memo: string; deadline: string; policyHash: string; digest: string; status: 'PENDING' | 'APPROVED' | 'EXECUTING' | 'EXECUTED'; approvals: Array<{ signerAddress: string; signature: string; approvedAt: string }> }
interface CapabilityManifest { schema: 'microcosm.space.capability-manifest/v1'; space: { id: string; name: string; network: string; chainId: number; currency: string }; capabilities: { payment: { id: 'payment' }; work: { id: 'work' }; request: { id: 'request' }; court: { id: 'court' } }; policy: { maxPerTransaction: string | null; dailyBudget: string | null; allowlist: { type: 'counterparties'; enabled: boolean } } }
interface X402Validation { valid: boolean; protocolValid: boolean; policyAllowed: boolean; reasons: string[]; selectedAcceptIndex: number | null; selectedAccept: { network: string; asset: string; payTo: string; amount: string; amountDecimal: string | null; maxTimeoutSeconds: number } | null }
```

## 5. Seed & dev server

- `npm run dev --workspace=@microcosm/server` boots on `:8787` with CORS open for `http://localhost:3000`.
- `npm run seed --workspace=@microcosm/server` (or `--seed` flag) boots a populated demo Space: founder + agent + counterparty, funded treasury, one request accepted, one escrowed job with submitted proof, one denial. No settled receipt is ever seeded (settlement is always real value) — run the live demo for the full loop. IDs are printed on boot; reboot re-seeds fresh.
- Persistence (M4): `--data=<path>` (or `DATA_PATH`) enables atomic snapshots on every mutation; an existing snapshot restores on boot (seed is skipped). Live box: `/var/lib/microcosm/microcosm-data.json`.
- UI agent runs against the live dev server. No fixture bundles.

## 6. Conformance (proves interface equivalence, Slice 9)

The same business loop — create Space → add participants → create/accept request → work → submit → evaluate → payment → activity — must pass through **MCP, REST, and SDK** with identical terminal states. `packages/server/test/conformance.test.js` executes the REST leg; MCP leg lives in `mcp/test/`; SDK leg in `packages/client/test/`. Any divergence is a P0 defect, not a documentation issue.
