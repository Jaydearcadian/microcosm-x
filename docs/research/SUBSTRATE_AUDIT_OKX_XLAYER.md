# SUBSTRATE AUDIT — OKX X Layer & OKX AI

**Date:** 2026-09-19  
**Target:** OKX X Layer (EVM L2) & OKX AI Agent Ecosystem  
**Audit Standard:** `onchain-systems-engineering` + `Repository_Starter_Virtuous_Build_Cycle` Phase 0

---

## 1. Network & Execution Environment

* **Network Name**: OKX X Layer (formerly X1)
* **Architecture**: ZK-powered Ethereum Layer 2 built on Polygon CDK.
* **EVM Compatibility**: Standard EVM execution (Cancun / Shanghai opcodes supported). Standard Solidity compiler `0.8.24` / `0.8.28` compatible without non-standard precompile dependencies.
* **Network Parameters**:
  * **Testnet**:
    * Chain ID: `195`
    * RPC Endpoint: `https://xlayertestrpc.okx.com`
    * Native Gas Token: `OKB` (18 decimals)
    * Block Explorer: `https://www.oklink.com/xlayer-test`
  * **Mainnet**:
    * Chain ID: `196`
    * RPC Endpoint: `https://rpc.xlayer.tech`
    * Native Gas Token: `OKB` (18 decimals)
    * Block Explorer: `https://www.oklink.com/xlayer`

---

## 2. Settlement Asset (USDC)

* **Standard**: Native USDC on X Layer adheres to standard ERC-20 interface (6 decimals, `transfer`, `transferFrom`, `approve`, `balanceOf`).
* **Settlement Invariant**:
  $$\text{Amount}_{\text{base}} = \text{Amount}_{\text{USD}} \times 10^6$$
* **Replay Protection**: EIP-712 domain separator must bind `chainId: 195` (or `196` on mainnet) and the deployed router address to prevent cross-chain or cross-contract replay.

---

## 3. OKX AI & Agent Environment

* **The Substrate State**:
  * OKX has launched initiatives for an open agentic economy, including AI trading bots and autonomous "Agentic Wallets".
  * LLM-driven agents (running via MCP in tools like Cursor, Claude, Cline, or custom workers) interact through tool calls.
* **The Vulnerability**:
  * If an autonomous agent is given a bare private key or direct bank wallet on X Layer, a single prompt injection or reasoning hallucination can completely drain the funds.
  * Native blockchain transactions have no concept of "spending caps", "approved vendor lists", or "dual-authorization thresholds". Once a private key signs, the funds are gone.
* **The Residual Gap (What Microcosm Solves)**:
  * Autonomous agents need a **bounded operating context (`Space`)**.
  * The agent acts as an operator inside the Space, not the direct owner of the vault.
  * Every disbursement request is evaluated against strict Space policy rules *before* onchain settlement.
  * Any request exceeding policy is deterministically denied onchain/at runtime with an auditable cryptographic proof of rejection (`DenialProof`).

---

## 4. Onchain Primitive Model (`onchain-systems-engineering`)

```text
authority:    Space Controller / Admin sets rules; Agent receives scoped operational rights.
state:        Space balance, active members, spending caps, processed nonces.
ordering:     Strict nonce sequence per payment to prevent front-running and replay.
verification: EIP-712 typed signature verification matching Space authorization envelope.
settlement:   Atomic ERC-20 transfer from Space vault to verified recipient on X Layer.
recovery:     Unclaimed / conditional disbursements held in ClaimEscrow.sol with sender reclaim timeout.
```
