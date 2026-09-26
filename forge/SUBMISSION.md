# SUBMISSION — OKX Dev Day 2026

## Project Details
* **Project Name**: Microcosm
* **Track**: Build a Company (Agentic Wallet Tooling, Onchain Services, Payment / MCP Services)
* **Tagline**: Commerce OS for Humans and Autonomous Agents on OKX X Layer.
* **Repository**: https://github.com/Jaydearcadian/microcosm-x
* **Live Demo Video**: https://raw.githubusercontent.com/Jaydearcadian/microcosm-x/main/evidence/video/microcosm-okx-demo.mp4 (2:00, 1920x1080, follows `forge/DEMO_SCRIPT.md`; shot list in `forge/DEMO_SHOT_LIST.md`)
* **Live App**: https://mcosm.vercel.app/app (production, Vercel) — eight surfaces: Command, Work, Governance, Delegation, Agent, Sandbox, Onboarding, Audit
* **Failover App**: https://reputation-university-abstract-gotta.trycloudflare.com/app (self-hosted on the submission host)
* **Status**: Complete & Verified — 189 tests (36 Solidity, 20 policy, 98 MCP, 24 server, 11 SDK), 41 Playwright end-to-end, 41 verified proof claims across 8 gates

---

## Executive Summary
Autonomous AI agents are increasingly granted financial capabilities, but funding an agent with a raw, unconstrained wallet creates an unacceptable corporate security risk. A single prompt injection or reasoning hallucination can drain an entire corporate balance.

**Microcosm solves this with Space Bounded Economic Authority.**
Instead of handing private keys to LLMs, humans and agents operate inside programmable **`Spaces`**. A Space bounds what an agent can spend, which counterparties it can engage, and strictly requires verifiable deliverable proof before funds settle on **OKX X Layer**.

---

## Architecture & How It Works

```text
  ┌─────────────────────────────────────────────────────────────┐
  │                 AUTONOMOUS AGENT / OPERATOR                 │
  │     (Runs in Claude, Cursor, Cline, or OKX Agentic Wallet)  │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                   Model Context Protocol (MCP)
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                      MICROCOSM SPACE                        │
  │                                                             │
  │  • Treasury Context: USDC balance on OKX X Layer            │
  │  • Policy Rules: maxPerTransaction, daily budget, allowlist │
  │  • Work State Machine: Open → Funded → Submitted → Completed│
  │  • OpenRails Gaia Exceptions: 100% refund on reject/timeout │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                     Approved Payment Intent
                                 │
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │              ONCHAIN FINANCIAL KERNEL (X LAYER)             │
  │                                                             │
  │  • Chain ID: 195 (Testnet) / 196 (Mainnet)                  │
  │  • SettlementRouter.sol: Nonce-ordered direct settlement    │
  │  • AgenticCommerce.sol: Escrow & deliverable validation     │
  │  • ClaimEscrow.sol: Conditional dual-authorization escrow   │
  │  • EnvelopeRegistry.sol: Policy anchor & rotation ledger    │
  └─────────────────────────────────────────────────────────────┘
```

---

## Key Features & Innovations

1. **Space as the Single External Kernel Noun**:
   Eliminates internal cryptographic jargon (`pact`, `path`, `envelope`) from external surfaces. Agents discover their operational boundaries using `spaces_capabilities` and interact through high-level business tools.

2. **First-Class Work Lifecycle (`AgenticCommerce.sol`)**:
   Money never moves without a Work Order and deliverable proof (`deliverableHash` + evidence URI). Funds are locked in escrow upon order creation and only released upon evaluator approval.

3. **OpenRails Gaia Exception Handling**:
   If a provider submits unsatisfactory work or misses a deadline, the Space evaluator triggers a Gaia exception refund. 100% of escrowed funds are returned to the Space treasury ($0 lost).

4. **Deterministic Policy Boundary & `DenialProof`**:
   Out-of-bounds payment attempts (e.g., prompt injection requesting $900 against a $500 cap) are deterministically intercepted *before* onchain interaction. Microcosm emits a cryptographic `DenialProof` and preserves the treasury.

5. **Native Model Context Protocol (MCP) Server**:
   Provides 8 production-grade MCP tools over standard I/O:
   * `spaces_list`, `spaces_capabilities`, `payments_request`, `activity_list`
   * `work_create`, `work_submit`, `work_evaluate`, `work_get`

---

## OKX Ecosystem Integration

* **OKX X Layer Deployment**:
  Smart contracts built for standard EVM execution (Cancun/Shanghai) deployed to OKX X Layer (Chain ID 195/196) with native USDC settlement.
* **OKX AI & Marketplace Complementarity**:
  Microcosm does not compete with agent marketplaces or OKX trading bots. It serves as the **corporate purchasing department and governance layer**, enabling companies to safely discover, hire, and fund marketplace agents within strict budget caps.

---

## Verification & Local Reproducibility

Microcosm adheres to the **FORGE 1.4** control plane. Every single claim is backed by executed command evidence in `forge/PROOF_LEDGER.md`.

```bash
# Run entire test suite (189 tests: 36 contracts + 20 policy + 98 MCP + 24 server + 11 SDK)
make test

# Run full verification gate & proof ledger audit
make verify

# Run live 8-step end-to-end procurement demo simulation
npm run demo
```

### Local Test Breakdown:
* **Contract Tests (`make test-contracts`)**: 36 Foundry tests passing (SettlementFlows, AgenticCommerce, EnvelopeRegistry, Adjudication, Attestation).
* **Policy Engine Tests (`npm run test:policy`)**: 13 deterministic boundary, EIP-712 hashing, and unit tests passing.
* **MCP Server Tests (`npm run test:mcp`)**: 14 end-to-end tool execution, Work lifecycle, daily-budget regression, and Internet Court adjudication tests passing.
* **Proof Ledger (`make verify`)**: 23/23 claims verified green.

---

## Ready to lodge

Everything below is verified and needs no further work. The only remaining step is the
portal submission itself, which requires the DevDay account.

* **Repository**: https://github.com/Jaydearcadian/microcosm-x
* **Demo video**: https://raw.githubusercontent.com/Jaydearcadian/microcosm-x/main/evidence/video/microcosm-okx-demo.mp4
* **Live app**: https://mcosm.vercel.app/app
* **Track**: Build a Company (Agentic Wallet Tooling, Onchain Services, Payment / MCP Services)
* **Tagline**: Commerce OS for Humans and Autonomous Agents on OKX X Layer

Fields to paste:

| Field | Value |
| :--- | :--- |
| Project name | Microcosm |
| Track | Build a Company |
| One-line pitch | Give agents budgets, not bank accounts. |
| Repository | https://github.com/Jaydearcadian/microcosm-x |
| Demo video | the mp4 above (2:00, 1920x1080) |
| Live app | https://mcosm.vercel.app/app |
| Chain | OKX X Layer Testnet, chain id 1952 |
| Settlement proof | `0xbd1957ffcc4ce1d57b10cc785ae5c41ec329169ea2cda1ee9695fc9dd7c47556`, receipt status 1, block 41894186 |
| Test counts | 185 unit/integration, 41 Playwright end-to-end |
| Proof ledger | 41 claims across 8 gates, `node scripts/verify-proof-ledger.mjs` |

### What a judge can verify unauthenticated

1. Open the live app and run **Sandbox → Request above the per-transaction cap**. It calls the
   live API, is refused with a signed DenialProof, and reports treasury moved `$0.00`,
   escrow moved `$0.00`, no Work Order created.
2. Open **Agent** and press *Try over the cap*: a real x402 v2 payload is refused with
   `Exceeds Space per-transaction cap: requested 900.00 USDC, max permitted is 500.00`.
3. Open **Audit**: the chain indexer reports its cursor, reconciliation state, transport, and
   the onchain work orders it has projected from OKX X Layer.
4. Run `node scripts/verify-proof-ledger.mjs` and `make test`.

### Claims deliberately not made

* Real x402 facilitator settlement is not configured; the API refuses with `UNSUPPORTED_SETTLEMENT`
  rather than returning a fabricated receipt.
* Literal external browser wallet extension acceptance is unverified; the credential-free
  injected EIP-1193 session flow is what the suite covers.
* Delegated settlement by an attenuated agent is out of scope and unclaimed.
* The Self-hosted failover app and the API run on one EC2 host; the Vercel deployment is a
  stateless client and server-side proxy in front of that API.
