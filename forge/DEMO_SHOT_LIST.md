# DEMO SHOT LIST — Microcosm on OKX X Layer

## Delivered film

`evidence/video/microcosm-okx-demo.mp4` — 2:00, 1920x1080, 30fps, -16.4 LUFS / -1.5 dBTP.
Source project: `videos/microcosm-commerce-os/` (HyperFrames, browser-native renderer).
Every product surface in the film is a real capture of the deployed Charcoal app or a card bound to a live endpoint; no generative imagery stands in for the product.

## Shot list as filmed

| Timecode | Beat | Surface | Required proof shown |
|---|---|---|---|
| 0:00–0:08 | B1 | Generated card bound to a request response | Agent asks for $900 with no Space and no rules; nothing moves |
| 0:08–0:18 | B2 | Real capture: Command Center | $1,530 remaining today on a $2,000 daily budget, per-transaction cap $500 |
| 0:18–0:27 | B3 | Real capture: onboarding | Six-step setup; participants hold the same standing as agents |
| 0:27–0:38 | B4 | Generated card bound to the live policy endpoint | Cap $500, budget $470/$2,000, denials held with $0 moved |
| 0:38–0:47 | B5 | Real capture: audit trail | Request created, accepted, work created, submitted |
| 0:47–0:58 | B6 | Generated card bound to the work endpoint | job-0001 escrows $350.00, Open → Funded, released only by deliverable proof |
| 0:58–1:11 | B7 | Generated card bound to a real denial response | $900 against a $500 cap denied, signed DenialProof, escrow unchanged, HELD AT POLICY |
| 1:11–1:22 | B8 | Real capture: work orders | Proof before payout, deliverable hash, settlement anchor |
| 1:22–1:34 | B9 | Generated cards bound to governance and delegation | 2-of-3 approval, $500 → $200 delegated cap, escalation rejected |
| 1:34–1:48 | B10 | Generated receipt card | 14 MCP tool calls, receipt status 1 at block 41894186, transaction hash on screen |
| 1:48–2:00 | B11 | Real capture: audit trail + totals | 177 tests, 41 proof claims, 8 gates, $0 lost to failed work |

## Commands behind the film

```bash
node scripts/agentic-testnet-e2e.mjs        # the 14-call run behind B10
node --test mcp/test/live-settlement.test.js
npm run test:e2e --workspace=charcoal
make test                                    # 177 tests
node scripts/verify-proof-ledger.mjs         # 41 claims, 8 gates
npx hyperframes check                        # 0 errors, 126/126 WCAG AA
```

## Claims shown on screen

- Network: OKX X Layer Testnet, chain ID `1952`.
- Settlement: real X Layer transaction `0xbd1957ffcc4ce1d57b10cc785ae5c41ec329169ea2cda1ee9695fc9dd7c47556`, receipt status `1`.
- Policy: deterministic denial with a signed DenialProof and zero onchain state change.
- Authority: 2-of-3 EIP-712 governance and delegation envelopes that can only narrow.
- Coverage: 177 repository tests, 41 proof claims, and 8 verification gates.

## Claims deliberately not made

- Real x402 facilitator settlement is not configured; the film makes no such claim.
- External browser wallet extension acceptance is unverified; the film does not claim it.
- Delegated settlement by an attenuated agent is out of scope and unclaimed.
