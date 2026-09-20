---
name: onchain-systems-engineering
version: 0.1.0
description: Specialist skill for learning, decomposing, comparing, adversarially reviewing, and designing onchain primitives and standards across execution environments, networks, markets, accounts, interoperability systems, agent economies, and financial protocols.
class: specialist-skill
consumes:
  - research-operating-system >= 1.2.0
---

# Onchain Systems Engineering

## Mission

Turn an onchain concept, protocol, standard, or product idea into a precise systems model that can be understood, compared across execution environments, attacked, tested, and reduced to reusable primitives.

The skill optimizes for **primitive literacy and composition**, not protocol trivia.

The central systems model is:

```text
authority
  + state
  + ordering
  + verification
  + settlement
  + recovery
```

Every protocol claim should be decomposable into those dimensions plus incentives, privacy, and interoperability where relevant.

## Activation

Use this skill when the task involves one or more of:

- onchain market structure: CLOBs, AMMs, RFQ, auctions, intents, solver markets, liquidation, MEV;
- signing, authorization, nonces, replay protection, typed data, permits, session keys, account abstraction, capabilities;
- EVM, SVM, Move, Cairo/Starknet, CosmWasm/Cosmos, FuelVM, UTXO or other execution models;
- state access, concurrency, contention, parallel execution, gas/resource accounting;
- sequencing, finality, rollups, bridges, IBC, cross-domain messaging and replay;
- agent identity, agent commerce, x402, execution markets, delegation, evaluation, reputation, escrow;
- token, vault, oracle, staking, restaking, proof, privacy, DA, governance, state-channel or payment-channel standards;
- requests to learn an EIP/ERC/RIP/ICS/AIP/SIP/CIP or analogous standard;
- design or review of a new onchain primitive.

## Non-negotiable rules

1. **Standards are versioned evidence, not vocabulary.** Verify the exact identifier, title, current status, dependencies, and canonical specification before teaching or relying on it.
2. **Proposal ≠ deployed guarantee.** Keep `specified`, `implemented`, `deployed`, and `observed` separate.
3. **Interface equivalence ≠ risk equivalence.** Two ERC-4626 vaults, ERC-20s, smart accounts, bridges, or agent registries may share an interface while having radically different economics and trust assumptions.
4. **Identity ≠ authority. Reputation ≠ validation. Payment ≠ successful execution. Inclusion ≠ finality. Ordering ≠ atomicity. Signature validity ≠ replay safety.**
5. Prefer the smallest primitive that explains the mechanism. Do not label a product feature as a new primitive until serious prior art is benchmarked.
6. When comparing networks or VMs, compare **state/dependency model, authority model, conflict model, ordering/finality, composability, resource accounting, failure recovery**, not TPS headlines.
7. When a proposed primitive delegates authority, explicitly model scope, lifetime, revocation, replay, budget, destination, target, upgrade behavior, and failure recovery.
8. Treat every intermediate state introduced by asynchrony as a new rights/authority/failure state that must be specified.
9. For financial primitives, identify who can change assets, liabilities, share supply, exchange rates, oracle inputs, and settlement timing.
10. Search for the strongest opposing design: simpler contract, offchain database, unordered nonce + explicit state machine, deterministic execution instead of agents, single-chain instead of cross-chain, or existing standard instead of new protocol.

## Core reasoning stack

For any system, produce this decomposition before proposing architecture:

```text
1. Economic / coordination object
   What is being offered, authorized, transferred, verified, or settled?

2. Principal and actors
   Who originates authority? Who executes? Who orders? Who verifies? Who settles?

3. State
   What is canonical? What is ephemeral? What is shared? What is local?

4. Authority
   What exact state transition may each actor cause? Under what limits?

5. Replay / uniqueness
   What makes an authorization, order, packet, or claim consumable exactly as intended?

6. Ordering
   Which actions must be ordered? Which should commute? Who establishes order?

7. Verification
   What evidence makes another component accept a claim?

8. Finality
   When is the source fact stable enough for downstream consequence?

9. Settlement
   What economically changes, where, and atomically with what?

10. Recovery
    What happens on timeout, revert, reorg, validator/evaluator failure, or partial execution?
```

## Primitive decomposition tests

### Market structure

Ask:

- Where does liquidity live?
- Where does ordering happen?
- Where does matching happen?
- Where does settlement happen?
- Is the economic object a price/quantity order, an RFQ, an outcome intent, a service job, or an adjudicated claim?

Do not default to CLOB/AMM simply because a market exists.

### Authorization

For a signed action, separate:

```text
domain       = where/for which verifier is the message meaningful?
message      = what exact action/economic terms are authorized?
signature    = who/which account policy approves it?
replay       = how many times / under what state may it execute?
lifetime     = when may it execute?
capability   = what authority remains impossible even with a valid signature?
```

Remember: EIP-712 gives typed hashing/domain separation; application state must supply replay and business constraints.

### Nonce topology

Treat nonce design as concurrency and invalidation design, not only replay protection.

Compare:

```text
global sequential nonce
per-workload keyed sequence
per-authority sequence
unordered random/nullifier nonce
bitmap nonce
set-valued conflict keys
unordered replay identity + explicit dependency DAG/state machine
```

Ordering should exist only where dependency exists. Do not infer complete economic independence from replay independence.

### VM / state topology

Ask:

```text
How are dependencies known?
- declared before execution?
- discovered dynamically?
- inferred from objects/UTXOs?
- learned by speculative execution?

What creates contention?
What shared mutable state serializes unrelated work?
What authority is encoded by state references/accounts/objects?
```

General rule:

> A runtime can only parallelize state transitions whose dependency topology permits independence.

### Cross-domain systems

Never use one generic `bridge` box. Separate:

```text
ordering
authentication / source-state verification
finality
transport
replay protection
timeout
execution
settlement
acknowledgement
recovery
```

Transporter and verifier should be treated as distinct roles unless the protocol explicitly merges them.

### Agent systems

Separate at least:

```text
identity      Who/what is the agent?
authority     What may it do?
job           What obligation exists?
validation    Did this particular output satisfy the condition?
settlement    How is value released?
reputation    What historical evidence affects future selection?
```

Autonomy should mean **freedom inside enforceable limits**, not possession of unrestricted treasury keys.

### Vault / claim-token systems

Model:

```text
A_t = assets / underlying economic value
S_t = outstanding shares / claims
conversion(A_t, S_t, x)
```

Then ask who can change `A_t`, who can change `S_t`, what rounds, what is asynchronous, whether donations affect accounting, and whether external protocols treat the share price as an oracle.

## Standards Track

When a standard is encountered, produce this record:

```text
Identifier:
Canonical title:
Category:
Current status:
Verified date:
Canonical source:
Requires / related:
Problem standardized:
Normative interface / transaction / data shape:
Replay and domain assumptions:
Security assumptions:
What breaks without it:
What it deliberately does NOT standardize:
Alternative / predecessor / competitor:
Deployment/adoption notes:
Cross-VM analogue:
```

Never freeze proposal status into permanent knowledge without a date. Re-verify on every consequential use.

## Cross-VM comparison contract

For EVM, SVM, Move/Aptos, Sui, Cairo/Starknet, Cosmos/CosmWasm, Fuel/UTXO, or another VM, compare the same axes:

| Axis | Question |
|---|---|
| State model | Account/storage, accounts, resources, objects, UTXOs, module state? |
| Dependency discovery | Dynamic, declared, object-derived, speculative? |
| Conflict rule | What makes two transactions non-independent? |
| Parallelism | Scheduling, optimistic retry, object/UTXO independence? |
| Authority | Key/account policy, signer+writable accounts, capabilities/resources, scripts? |
| Composition | Synchronous calls, CPI, object composition, messages? |
| Resource accounting | Gas, compute units, storage, proof cost, bytes, IO? |
| Finality | Which consensus/settlement layer finalizes consequence? |
| Upgrade authority | Who can change code/implementation semantics? |
| Recovery | Revert, retry, compensation, timeout, reorg behavior? |

## Knowledge acquired: canonical principles

### Market structure

A CLOB is best modeled as a deterministic state-transition system over authenticated economic commitments under an ordering and matching policy. Matching and settlement are separate primitives. Tick size, lot size, expiry, cancellation, ordering and fill semantics are protocol rules, not UI details.

### Typed authorization

EIP-712 domain separation answers **where a message belongs**, not **whether it has already been consumed**. ERC-1271 turns contract signature validity into programmable account policy. Nonce topology imposes concurrency and invalidation semantics.

### State and execution

Shared mutable state is the main enemy of parallel execution. State should be scoped to the smallest domain that genuinely needs mutual consistency. Global registries/counters often manufacture contention.

### Ordering and interoperability

Network arrival, inclusion, canonical ordering and finality are distinct states. Cross-domain communication is authenticated acceptance of another domain's state under explicit finality and replay assumptions—not mere message delivery.

### Agent economies

Identity should not imply authority. Reputation should influence selection, not override hard invariants. Evaluation should be separated from execution when work cannot be objectively settled. Capability attenuation should preserve:

```text
Authority(child) ⊆ Authority(parent)
```

### Vaults

A vault share is a claim on an accounting system. The exchange rate is security-critical state. Donation/inflation attacks demonstrate that economically valid accounting transitions can be adversarially sequenced to steal value.

### Bounded autonomous execution

The reusable architecture discovered through synthesis is:

```text
Mandate → Attempt → Verify → Consume → Receipt
```

A mandate should define authority, domains, economic constraints, replay semantics, lifetime and validation policy. Agents/solvers may optimize the execution path without acquiring unrestricted custody.

## Adversarial primitive review

Before calling a mechanism useful or novel, run:

1. **Necessity:** Could deterministic code, a database, an ordinary escrow, or an existing ERC/EIP/ICS solve it?
2. **Authority:** Can any actor obtain more authority than the user intended through calldata freedom, target upgrades, delegated keys, value appreciation, or cross-domain replay?
3. **Concurrency:** Did replay or shared state manufacture false ordering? Did partitioning remove a consistency guarantee you actually need?
4. **Verification:** What exactly proves current-job correctness? Can reputation, payment, or identity be mistaken for verification?
5. **Ordering/MEV:** Who can front-run, reorder, censor, batch, or privately route the action?
6. **Finality:** Is downstream consequence based on provisional state?
7. **Asynchrony:** What rights exist while pending? Who bears PnL/risk? How does timeout recover?
8. **Accounting:** Can someone manipulate assets, shares, valuations, or state observations before another user executes?
9. **Upgrades:** Does an address/selector continue to mean the same thing after a proxy, module, or account-policy upgrade?
10. **Prior art:** What is the strongest existing standard or implementation that collapses the novelty claim?

## Lesson mode

When the user asks to learn onchain systems, use `templates/LESSON_TEMPLATE.md` and progress cumulatively. Each lesson must end with diagnostic questions and one design exercise that forces primitive-level reasoning.

## Build mode

When the user asks to implement:

```text
problem
→ invariant set
→ primitive boundary
→ interface/state machine
→ smallest defensible MVP
→ adversarial tests
→ demo evidence
→ only then extensions
```

Do not start with a multi-chain, multi-agent, fully generic design unless those dimensions are necessary to falsify or prove the primitive.

## Idea-bank integration

When a reusable idea emerges:

- search the existing Idea Bank first;
- link rather than duplicate overlapping research;
- keep unverified ideas at `captured` / `evidence_pending`;
- record strongest prior art and the claim boundary;
- define the smallest experiment that could reject the idea.

