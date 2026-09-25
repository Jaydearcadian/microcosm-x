# DEMO SHOT LIST — Microcosm on OKX X Layer

## Capture targets

| Time | Surface | Required proof |
|---|---|---|
| 0:00–0:20 | Landing page | Microcosm thesis and Connect Wallet CTA |
| 0:20–0:45 | Terminal | Raw-key risk versus bounded Space authority |
| 0:45–1:05 | Charcoal `/app#command` | Chain 1952, treasury, policy caps, roster |
| 1:05–1:20 | Terminal | `node scripts/agentic-testnet-e2e.mjs` setup and MCP tool trace |
| 1:20–1:50 | Work lifecycle | Work Order, funding, deliverable hash, evaluation, settlement |
| 1:50–2:10 | Policy denial | $900 request rejected with zero treasury impact |
| 2:10–2:30 | Court/refund | Gaia exception and adjudication outcome |
| 2:30–2:45 | Audit view | Activity trail and SSE state |
| 2:45–2:55 | M9 indexer | `RECONCILED` cursor and replay-safe event ingestion |
| 2:55–3:00 | Verification | `make verify` summary and OKX X Layer architecture |

## Commands

```bash
node scripts/agentic-testnet-e2e.mjs
npm run test:e2e --workspace=charcoal
make test
node scripts/verify-proof-ledger.mjs
```

## Claims to show on screen

- Network: OKX X Layer Testnet, chain ID `1952`.
- Settlement: real X Layer transaction hash and receipt status.
- Policy: deterministic denial with no onchain state change.
- Invariants: proof-gated payout, refund safety, and immutable activity.
- Coverage: 153 repository tests, 37 proof claims, and 7 verification gates.
