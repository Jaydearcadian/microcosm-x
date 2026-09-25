# SUBMISSION — OKX Dev Day 2026

## Project Details
* **Project Name**: Microcosm
* **Track**: Build a Company (Agentic Wallet Tooling, Onchain Services, Payment / MCP Services)
* **Tagline**: Commerce OS for Humans and Autonomous Agents on OKX X Layer.
* **Repository**: https://github.com/Jaydearcadian/microcosm-x
* **Live Demo Video**: https://raw.githubusercontent.com/Jaydearcadian/microcosm-x/main/evidence/video/microcosm-okx-demo.mp4 (2:00, 1920x1080, follows `forge/DEMO_SCRIPT.md`; shot list in `forge/DEMO_SHOT_LIST.md`)
* **Live App**: https://reputation-university-abstract-gotta.trycloudflare.com/app (Command Center, Work, Governance, Delegation, Agent, Onboarding, Audit)
* **Status**: Complete & Verified — 185 tests (36 Solidity, 20 policy, 95 MCP, 23 server, 11 SDK), 41 Playwright end-to-end, 41 verified proof claims across 8 gates

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
# Run entire test suite (185 tests: 36 contracts + 20 policy + 95 MCP + 23 server + 11 SDK)
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
