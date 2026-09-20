# Onchain Systems Engineering — Knowledge Map v0.1

Captured: 2026-08-24

## Systems spine

```text
authority → state → ordering → verification → settlement → recovery
```

Secondary axes:

```text
incentives | privacy | interoperability | observability | upgradeability
```

## Market structure

- CLOB: authenticated discrete orders + canonical ordering + matching policy + settlement.
- AMM: liquidity state + pricing invariant/range rules + swap state transition.
- RFQ: request → quotes → acceptance → settlement.
- Intent/solver market: user constrains outcome; solver chooses route.
- Separate matching from settlement.
- Ordering authority creates MEV surface.

## Authorization

- ERC-191: signed-data framing family.
- EIP-712: typed structured hashing/domain separation; not replay protection.
- ERC-1271: smart-contract-defined signature validity.
- ERC-2612: permit = typed authorization + nonce + deadline + ERC-20 allowance effect.
- ERC-4337: UserOperation + EntryPoint + account validation + keyed/semi-abstracted nonce space.
- Replay-domain allocation is an authority/concurrency design decision.

## VM / execution models

- EVM: dynamic contract/storage access; strong dynamic synchronous composability.
- SVM: explicit account read/write/signing sets expose dependencies before execution.
- Aptos/Block-STM: optimistic parallel execution with conflict detection/retry.
- Sui: object-centric state makes independent ownership/state domains explicit; shared objects remain contention points.
- Move: resource/ability semantics move some asset invariants into the type system.
- CairoVM: proof-oriented execution changes the computational cost model.
- Fuel/UTXO-style: input/access-set structure exposes independence and conflict explicitly.

## Ordering / interoperability

- Mempool arrival ≠ canonical order ≠ finality.
- Sequencer confirmation ≠ settlement-layer finality.
- Shared sequencing can provide common order without shared execution or atomic settlement.
- IBC architecture is useful as a decomposition reference: client verification, channel/packet semantics, application semantics.
- Relayer ≠ verifier.
- Ordered channels create head-of-line blocking; unordered channels require independent replay state.
- Timeout is a deterministic termination/recovery primitive.

## Agentic commerce

- ERC-8004: identity/reputation/validation surfaces; not payment authorization.
- ERC-8183: escrowed client/provider/evaluator job state machine.
- x402: machine-native HTTP payment handshake; not a general job/adjudication protocol.
- Identity ≠ authority ≠ reputation ≠ validation ≠ payment.
- Capability attenuation is required for nested delegation.
- Low-value deterministic service can use pay-first; higher-value/subjective work often needs escrow + evaluation.

## Vaults / financial claims

- ERC-4626: single-asset tokenized vault interface; shares are proportional claims.
- `convert*` ≠ execution quote; `preview*` exists for execution-facing estimation.
- Rounding is economic behavior.
- Donation/inflation attacks manipulate assets/share geometry.
- Virtual shares/assets mitigate empty-vault inflation but alter economics.
- ERC-7540: asynchronous vault request lifecycle.
- ERC-7575: multi-asset entry points / separable share token model.
- Interface standardization does not imply strategy or collateral safety.

## Synthesis primitive

```text
Bounded Execution Mandate

principal
  ↓ signed bounded authority
mandate
  ↓ competitive attempt
executor / solver
  ↓ objective or adjudicated verification
verify
  ↓ stateful single-use / bounded consumption
consume
  ↓ canonical evidence object
execution receipt
```

Core invariant:

```text
ExecutedAction ⊆ AuthorizedMandate
```

## Research questions opened

1. Can mandate consumption + verified receipts become a general execution primitive across deterministic and agentic markets?
2. When should replay topology mirror authority dependency, and when should replay remain independent from explicit workflow state?
3. Can execution receipts become a portable economic provenance substrate for reputation, insurance, memory and dispute systems?
4. How should dynamic-value assets be safely represented in capabilities without turning every permission into an oracle dependency?
5. Can evaluation gate authority escalation, so agents gain consequential permissions only after prior work is verified?
6. What is the smallest state/consistency domain for agent jobs and economic relationships across different VM models?
