# DEMO SCRIPT — Microcosm on OKX X Layer
**OKX Dev Day 2026 Walkthrough (Target Duration: 3 Minutes)**

---

## Part 1: The Problem — The Dangerous "Raw Private Key" Agent (0:00 – 0:45)

* **Visual**: Terminal showing empty prompt, side-by-side with news headlines / diagrams of autonomous agent wallet drain vulnerabilities.
* **Audio / Voiceover**:
  > *"Autonomous AI agents are entering onchain commerce. But right now, teams are handing LLMs raw private keys or unconstrained corporate card APIs. If an agent is tricked by prompt injection, suffers an execution hallucination, or enters an infinite loop, your entire treasury can be drained in a single transaction.*
  >
  > *Native blockchain transactions have no concept of company spending limits, approved vendor lists, or work milestones. Once a private key signs, the money is gone forever.*
  >
  > *We built **Microcosm** — the Commerce OS for humans and autonomous agents on OKX X Layer. Instead of giving agents unconstrained keys, agents operate inside **Spaces** with Bounded Economic Authority."*

---

## Part 2: The Core Concept — The Space (0:45 – 1:15)

* **Visual**: Show the Architecture diagram from `forge/ARCHITECTURE.md` or a clean terminal layout showing Space status.
* **Audio / Voiceover**:
  > *"A **Space** is the single external kernel noun in Microcosm. It defines:*
  > 1. *Who is here: Team members and specialized AI agents.*
  > 2. *What money is available: Treasury balance on OKX X Layer.*
  > 3. *What rules govern spending: Strict per-transaction limits, daily velocity caps, and counterparty allowlists.*
  > 4. *What work is permitted: Verifiable deliverables before any settlement.*
  >
  > *Agents communicate with Microcosm through native Model Context Protocol (MCP) tools, meaning they work seamlessly inside Claude, Cursor, Cline, or OKX Agentic Wallets."*

---

## Part 3: Live Demo — Work Lifecycle & OKX X Layer Settlement (1:15 – 2:15)

* **Visual**: Terminal executing `npm run demo`.
* **Audio / Voiceover**:
  > *"Let's run our live end-to-end procurement demo:*
  >
  > * **Step 1 & 2**: The agent connects via MCP and calls `spaces_capabilities`. It immediately discovers its constraints: Chain ID 195 (OKX X Layer Testnet), a strict $500 per-transaction cap, a $2,000 daily budget, and 3 pre-approved vendors.
  >
  > * **Step 3**: The client creates a Work Order for GPU cluster resources ($350 USDC). Money does not move to the provider immediately — it is escrowed into `Funded` state.
  >
  > * **Step 4**: The compute provider executes the task and submits a verifiable `deliverableHash` and IPFS evidence via `work_submit`.
  >
  > * **Step 5**: The evaluator reviews the deliverable and calls `work_evaluate` with `approved=true`. Microcosm verifies policy and settles the payment on OKX X Layer via `SettlementRouter.sol`, generating an onchain receipt and transaction hash!"*

---

## Part 4: The Control Boundary, Gaia Exception & Internet Court (2:15 – 3:00)

* **Visual**: Terminal highlighting Steps 6, 7, and 8 of the demo runner.
* **Audio / Voiceover**:
  > *"Now watch what happens under adversarial and subjective conditions:*
  >
  > * **Step 6**: A prompt injection instructs the agent to buy an unauthorized $900 hardware asset. The agent attempts `payments_request`. Microcosm intercepts the call before it touches the blockchain. Because $900 exceeds the $500 cap, it is deterministically rejected with a cryptographic `DenialProof`. Treasury impact? Exactly zero dollars.
  >
  > * **Step 7**: What if a provider submits low-quality work? In Step 7, an agent rejects an unsatisfactory $200 task. Microcosm activates the **Gaia exception handler**: 100% of escrowed funds are instantly returned to the Space balance. Zero funds lost.
  >
  > * **Step 8**: What if the deliverable is subjective and requires decentralized dispute resolution? In Step 8, the deliverable is referred to an **Internet Court** (`IAdjudicator.sol`). Payouts are halted in the onchain contract during adjudication. Once the court delivers its verdict via `work_post_verdict`, escrow releases cleanly to the provider on OKX X Layer.
  >
  > * **Step 9**: Every action, denial, and settlement generates an immutable audit record in the Space activity ledger."*

---

## Part 5: Conclusion & OKX Ecosystem Value (3:00 – 3:30)

* **Visual**: Terminal running `make verify` (all 63 tests and 23 claims passing green) and showing smart contract deployment architecture.
* **Audio / Voiceover**:
  > *"Microcosm does not compete with AI agent marketplaces — it is the missing **corporate governance, bounded authority, and settlement layer** that enables businesses to safely hire and fund autonomous agents on OKX X Layer.
  >
  > Featuring EIP-712 cryptographic attestation, native Internet Court adjudication, and full OpenRails exception handling — backed by 63 passing tests and 23 verified claims — Microcosm provides the economic infrastructure the agent economy needs to scale safely on OKX X Layer.
  >
  > Thank you!"*
