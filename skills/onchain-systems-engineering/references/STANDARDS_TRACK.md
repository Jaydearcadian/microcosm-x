# Standards Track — Learned Set

Captured: 2026-08-24

**Rule:** This file is an index, not a status oracle. Re-verify the canonical source and current status on every consequential use.

## Signatures / typed authorization

- ERC-191 — signed-data framing.
- EIP-712 — typed structured hashing and signing / domain separation.
- ERC-1271 — contract signature validation.
- ERC-2612 — ERC-20 Permit.
- ERC-3009 — transfer with authorization / unordered authorization model.
- ERC-6492 — counterfactual contract signature validation.
- ERC-7739 — defensive typed-data signing for smart accounts.

## Accounts / transaction authority

- ERC-4337 — account abstraction via alternate mempool/UserOperation/EntryPoint.
- ERC-6900 — modular smart contract accounts.
- ERC-7579 — minimal modular smart account interfaces.
- EIP-7702 — EOA code-delegation transaction mechanism.
- EIP-8250 — keyed nonces for frame transactions; compare carefully with authority-topology ideas.
- ERC-8199 — sandboxed smart wallet; relevant prior art for bounded agent execution.
- ERC-8226 — regulated agent mandate; relevant prior art for scoped/time-bounded/financially capped agent mandates.

## Tokens / vaults

- ERC-20 — fungible-token interface.
- ERC-721 — non-fungible token interface.
- ERC-1155 — multi-token interface.
- ERC-4626 — tokenized vaults.
- ERC-7540 — asynchronous ERC-4626 vaults.
- ERC-7575 — multi-asset ERC-4626 vaults.
- ERC-6909 — minimal multi-token interface.

## Agent identity / commerce

- ERC-8004 — Trustless Agents: identity, reputation, validation registries.
- ERC-8183 — Agentic Commerce: client/provider/evaluator escrowed job lifecycle.
- x402 — HTTP-native machine payment protocol; treat as payment layer, not authority or job adjudication.

## Interoperability

Track IBC/ICS by version and repository stage. Learned concepts include:

- ICS-02 — client/light-client semantics.
- ICS-04 — channel/packet sequencing, replay and timeout semantics.
- ICS-20 — fungible token transfer.
- ICS-27 — interchain accounts / remote authority.

Do not assume the stage of an individual ICS from its number alone; verify the current canonical repository index and version.

## VM-specific canonical standards/programs

- Solana Token Program and Token-2022 / Token Extensions.
- Aptos Coin / Fungible Asset standards.
- Sui Move object/coin standards and runtime semantics.
- Starknet/Cairo account and token interfaces.
- Cosmos SDK/CosmWasm module and contract standards.
- Fuel transaction/UTXO/access semantics.

The goal is semantic equivalence, not finding an “ERC number” in every ecosystem.
