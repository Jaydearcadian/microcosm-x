# CORE HYPOTHESIS

## The Problem With "Agent Wallets"
The current Web3 AI agent narrative tells developers:
> *"Give every agent a wallet and let it transact onchain."*

In practice, handing an LLM-driven agent an unconstrained private key or bank wallet is fundamentally broken:
1. **Unpredictability & Injections**: A single prompt injection or logic hallucination can drain the entire wallet balance.
2. **No Corporate Guardrails**: Enterprises cannot enforce spending caps, counterparty allowlists, time windows, or dual approvals on raw keys.
3. **Context Fragmentation**: The agent’s tools, communication channels, and accounting remain separate from the business’s financial ledger.

---

## The Core Hypothesis
> **A business does not need an agent with a wallet. A business needs a persistent, bounded operating context (`Space`) where people, agents, and counterparties coordinate work and move money under programmable, non-bypassable rules.**

---

## The Falsification Test
The hypothesis is validated if and only if:
1. **Valid Execution**: An autonomous agent can discover its Space rules, request a compliant payment for verified work via MCP, and have it settled automatically on OKX X Layer without human intervention.
2. **Deterministic Denial**: An autonomous agent attempting to spend even $1 over its Space limit is deterministically rejected before any onchain transaction is initiated, producing a verifiable denial proof.
3. **Non-Bypassability**: The onchain settlement layer on OKX X Layer rejects any settlement attempt that does not carry valid Space authorization.
