# SUBMISSION — OKX Dev Day 2026

## Project Details
* **Project Name**: Microcosm
* **Track**: Build a Company (Agentic Wallet Tooling, Onchain Services, Payment / MCP Services)
* **Tagline**: Commerce OS for Humans and Autonomous Agents on OKX X Layer.
* **Repository**: https://github.com/Jaydearcadian/microcosm (or current target repo)
* **Live Demo / Video**: [2-4 minute walkthrough link to be added]

---

## What We Built
Microcosm transforms how businesses deploy autonomous AI agents onchain. Instead of giving an LLM an unconstrained private key that can be drained by a prompt injection, Microcosm provides **`Spaces`** — bounded operating containers where humans and agents coordinate work and money under strict, non-bypassable programmatic rules.

Underneath, Microcosm leverages the **OpenRails** financial kernel to execute atomic settlements, escrows, and structured receipts directly on **OKX X Layer** using native USDC.

Agents discover their permissions and request payments via standard **Model Context Protocol (MCP)** tools, allowing them to remain in their natural workflow environments (Cursor, Claude, Cline, OKX Agentic Wallets) while respecting strict enterprise policy controls.

---

## OKX Ecosystem Integration
1. **OKX X Layer Deployment**:
   * Smart contracts (`SettlementRouter`, `ClaimEscrow`, `SpaceVault`) compiled with Solidity and deployed to **OKX X Layer Testnet** (Chain ID 195).
   * Native USDC settlement with gas-optimized execution.
2. **OKX AI & Agentic Tooling**:
   * First-class MCP server enabling AI agents to act as trusted procurement and operations agents within authorized corporate Spaces.
