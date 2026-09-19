# PRODUCT — Microcosm on OKX X Layer

## One-Sentence Summary
Microcosm is the Commerce OS for humans and autonomous agents, providing bounded operating **Spaces** to coordinate work, authority, counterparties, and money under programmable rules settled on OKX X Layer.

---

## The Core Problem
Autonomous AI agents are being equipped with wallet tools (Coinbase AgentKit, OKX Agentic Wallets, etc.), but funding an agent with a raw, unconstrained wallet creates an acute business and security failure:
* **Prompt injections or hallucinations** can drain the entire balance.
* **No business policy enforcement**: Agents lack programmatic guardrails for per-transaction caps, daily allowances, whitelisted counterparties, or dual-authorization thresholds.
* **Disjointed operating context**: Agents operate in isolated silos (IDE, chat, MCP) detached from the business's real accounting, counterparties, and team members.

Giving an autonomous agent an unconstrained corporate card or direct private key is an operational catastrophe.

---

## The Solution: `Space`
A **Space** is the fundamental operating container in Microcosm:
* **Who is here**: People (team members, signers) and Agents (purchasing bots, payroll bots, research agents).
* **What money is available**: Budget allocated to the Space (e.g. 5,000 USDC on OKX X Layer).
* **What rules govern action**: Strict spending caps (e.g. max $500 per transaction, approved vendor registry, active execution windows).
* **What work is done**: Tasks and deliverables requested by members.
* **How settlement occurs**: Programmatically executed through the OpenRails financial kernel and settled on **OKX X Layer** with native USDC.

---

## The Load-Bearing Mechanism
**Space Bounded Economic Authority**:
```text
Actor (Human or Agent)
  ↓
Interface (MCP / REST API / SDK)
  ↓
Space Context Evaluation
  ↓
Rule & Budget Gate (PASS / REJECT)
  ├─ REJECT → Deterministic DenialProof (Logged, auditable, transaction halted)
  └─ PASS   → OpenRails Financial Kernel → OKX X Layer Settlement Router → Onchain Settlement & Receipt
```

---

## The Flagship Hackathon Scenario (OKX Dev Day 2026)
**The Autonomous Procurement Space**:
1. **Create Space**: A company instantiates a `Procurement Space` with 5,000 USDC on X Layer.
2. **Assign Agent**: An AI procurement agent is added as an operator with a strict rule: `maxPerTransaction = 500 USDC`, `allowedVendors = [CloudCompute Corp, Dataset Provider]`.
3. **Valid Action**: The agent engages an approved compute provider for $350. The agent calls `payments.request` via MCP. Microcosm evaluates policy → PASS → onchain settlement on X Layer → receipt minted.
4. **The Control Boundary Test**: The agent hallucinates or is prompted to buy an unauthorized $900 hardware asset. The agent calls `payments.request`. Microcosm evaluates policy → REJECT ($900 > $500 cap). A cryptographic rejection receipt is logged to the Space audit trail. **The company's treasury remains safe.**
