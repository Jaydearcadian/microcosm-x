# JUDGE PATH — 5-Minute Verification Walkthrough

Welcome, Hackathon Judges. This document provides an exact, reproducible path to independently verify Microcosm on OKX X Layer.

---

## 1. Quick Verification (30 Seconds)

From the root directory:

```bash
# Run the complete automated test suite locally
make test
```

Expected output:
* Smart contract unit and boundary tests passing (`forge test`).
* Space runtime and policy engine tests passing.
* MCP server tool execution tests passing.

---

## 2. Interactive E2E Demonstration (2 Minutes)

Run the automated demonstration runner:

```bash
npm run demo
```

What this demonstrates in real time:
1. **Instantiate Space**: Creates a `Procurement Space` with 5,000 USDC budget.
2. **Onboard Agent**: Binds an autonomous purchasing agent with a $500 per-transaction cap.
3. **Agent Capability Discovery**: Agent queries MCP tool `spaces_capabilities` to inspect rules.
4. **Compliant Action**: Agent requests a $350 disbursement to approved vendor `CloudCompute Corp`. Policy engine approves → onchain settlement dispatched on OKX X Layer → verified receipt generated.
5. **The Boundary Test**: Agent attempts an unauthorized $900 disbursement. Policy engine deterministically intercepts and rejects the action → `DenialProof` generated and logged.

---

## 3. Onchain Deployment on OKX X Layer (Testnet)

Contracts are deployed on OKX X Layer Testnet (Chain ID 195):
* `SettlementRouter.sol`: `[To be updated upon deployment]`
* `ClaimEscrow.sol`: `[To be updated upon deployment]`
* Explorer link: https://www.oklink.com/xlayer-test
