# Microcosm (`mcosm`)
> **The Commerce OS for Humans & Autonomous Agents on OKX X Layer**  
> *Built for OKX Dev Day 2026*

[![OKX X Layer](https://img.shields.io/badge/Network-OKX_X_Layer_(195/196)-blue.svg)](https://www.okx.com/xlayer)
[![EVM Solidity](https://img.shields.io/badge/Solidity-0.8.24-orange.svg)](https://soliditylang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)
[![FORGE 1.4](https://img.shields.io/badge/FORGE_1.4-Verified_(42/42_tests)-brightgreen.svg)](forge/PROOF_LEDGER.md)

---

## 💡 The Problem

Giving an autonomous AI agent an unconstrained private key or an unrestricted corporate card API is an operational disaster:
* **Prompt injections & hallucinations** can drain a corporate treasury in a single transaction.
* **No business policy enforcement**: Raw blockchains lack native logic for transaction ceilings, daily velocity limits, approved vendor lists, or escrow milestones.
* **Detached silos**: Agents operate isolated in chats or IDEs, disconnected from the organization's real accounting, counterparties, and team members.

---

## 🛡️ The Solution: Space Bounded Economic Authority

Microcosm introduces the **`Space`** as the single external kernel noun. A Space is a bounded operating context that unites:
1. **Who is here**: Team members and autonomous agents with assigned roles.
2. **What money is available**: Treasury balance in native USDC on OKX X Layer.
3. **What rules govern action**: Strict per-transaction limits, daily budgets, and counterparty allowlists.
4. **What work is done**: First-class Work Orders with verifiable deliverable hashes.
5. **How settlement occurs**: Programmatically executed through the OpenRails financial kernel on **OKX X Layer**.

```text
AGENT REASONING → CAPABILITY DISCOVERY → SPACE POLICY EVALUATION → ONCHAIN FINANCIAL KERNEL → X LAYER SETTLEMENT
```

Any payment request outside the Space's rules is **deterministically rejected** with a cryptographic `DenialProof`. If an agent or vendor submits unsatisfactory work, **OpenRails Gaia exception handling** refunds 100% of escrowed funds back to the Space treasury ($0 lost).

---

## 🏛️ Architecture

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

## 🚀 Quickstart & Local Verification

Microcosm operates under the **FORGE 1.4** control plane. Every feature and mechanism is locally runnable and verifiable without external hidden dependencies.

### Prerequisites
* Node.js v18+
* Foundry (`forge` / `cast`)

### Run Tests
```bash
# Run entire test suite (42 tests: 23 contracts, 8 policy engine, 11 MCP)
make test

# Run contracts suite alone (Foundry)
make test-contracts

# Run Space policy engine tests
npm run test:policy

# Run MCP server tests
npm run test:mcp

# Run full verification gate & proof ledger audit
make verify
```

### Run Live End-to-End Demonstration
```bash
npm run demo
```
This executes an 8-step simulation demonstrating:
1. Agent discovers Space context via MCP.
2. Agent inspects capability bounds ($500 cap, approved vendors).
3. Client creates Work Order ($350 USDC escrowed).
4. Provider submits deliverable hash and IPFS evidence.
5. Evaluator approves → Completed, settled on OKX X Layer.
6. Control Boundary: Unauthorized $900 request deterministically blocked ($0 lost).
7. Gaia Exception: Rejected $200 task triggers full refund ($0 lost).
8. Complete audit trail verification.

---

## 🔌 Model Context Protocol (MCP) Reference

Microcosm exposes 8 production-grade MCP tools over standard I/O (`mcp/src/index.js`):

| Tool Name | Description | Key Parameters |
|:---|:---|:---|
| `spaces_list` | List all Spaces accessible by the active agent/user | `actorId` |
| `spaces_capabilities` | Query policy limits, authorized budget, and allowed vendors | `spaceId`, `actorId` |
| `payments_request` | Request direct payment from Space treasury | `spaceId`, `actorId`, `recipient`, `amount`, `memo` |
| `activity_list` | Retrieve immutable Space audit ledger of settlements & denials | `spaceId`, `limit` |
| `work_create` | Create and escrow funds for a verifiable Work Order | `spaceId`, `clientId`, `providerId`, `evaluatorId`, `budget`, `deadlineHours` |
| `work_submit` | Provider submits deliverable proof hash and evidence URI | `jobId`, `providerId`, `deliverableHash`, `evidenceUri` |
| `work_evaluate` | Evaluator approves or rejects work (triggers X Layer settlement or Gaia refund) | `jobId`, `evaluatorId`, `approved`, `reason` |
| `work_get` | Query real-time status and escrow state of a Work Order | `jobId` |

To add Microcosm to Claude Desktop, Cursor, or Cline, add the following to your MCP config:
```json
{
  "mcpServers": {
    "microcosm": {
      "command": "node",
      "args": ["/absolute/path/to/okx/mcp/src/index.js"]
    }
  }
}
```

---

## 📁 Repository Structure

```text
.
├── contracts/               # Solidity smart contracts for OKX X Layer
│   ├── src/
│   │   ├── AgenticCommerce.sol   # Work order escrow & deliverable validation
│   │   ├── SettlementRouter.sol  # Nonce-ordered direct settlement
│   │   ├── ClaimEscrow.sol       # Conditional escrow & receipts
│   │   └── EnvelopeRegistry.sol  # Policy anchor registry
│   ├── script/
│   │   └── DeployXLayer.s.sol    # Automated Foundry broadcast script
│   └── test/                     # Foundry unit & invariant tests (23 tests)
├── packages/
│   └── policy-engine/       # Pure deterministic Space policy evaluator (8 tests)
├── mcp/                     # Native Stdio Model Context Protocol server (11 tests)
│   ├── src/
│   │   ├── index.js         # Stdio JSON-RPC transport
│   │   ├── space-store.js   # Space state machine & Gaia exception logic
│   │   └── tools.js         # Tool definitions & schemas
├── scripts/
│   ├── demo-procurement-space.mjs # Live 8-step end-to-end simulation runner
│   └── verify-proof-ledger.mjs    # Proof ledger audit script
└── forge/                   # FORGE 1.4 control plane and hackathon documentation
```

---

## 🤝 Ecosystem Value for OKX

* **Native OKX X Layer Settlement**: High-throughput, low-cost ZK-powered transactions with sub-cent gas fees make continuous agentic commerce economically viable.
* **OKX AI Marketplace Complementarity**: Microcosm does not compete with AI agent builders or marketplaces; it is the **corporate purchasing department** that enables traditional businesses to safely hire and fund marketplace agents with deterministic risk boundaries.

---

## 📄 License
MIT
