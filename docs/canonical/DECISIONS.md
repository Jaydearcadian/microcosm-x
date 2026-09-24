# DECISIONS (ADR Short-Form)

This log records major architectural and engineering decisions.

---

### DEC-001: Space as the Single Kernel Noun
* **Context**: Prior iterations of OpenRails and payments software accumulated vocabulary crowding (`Pact`, `Envelope`, `Path`, `Mandate`, `Intent`).
* **Decision**: Establish **`Space`** as the single external noun across UI, API, SDK, and MCP surfaces. All sub-mechanics (policies, routes, envelopes) remain internal implementation details.
* **Consequence**: Minimizes cognitive overhead for humans and agents. Maximum UI/UX, minimum language crowding.

### DEC-002: EVM & Foundry Standard for OKX X Layer
* **Context**: OKX X Layer is a Polygon CDK-powered EVM Layer 2.
* **Decision**: Use Foundry as the smart contract development and testing framework, with standard Cancun/Shanghai EVM compilation.
* **Consequence**: Enables fast local unit, invariant, and failure fuzzing (`forge test`) before any testnet broadcast.

### DEC-003: Model Context Protocol (MCP) as the Primary Agent Primitive
* **Context**: External autonomous AI agents run inside Cursor, Claude, Cline, or custom agent frameworks.
* **Decision**: Expose Space actions via a dedicated MCP server. Agents discover capabilities via `spaces_capabilities` rather than requiring custom SDK integration.
* **Consequence**: Zero-migration onboarding for existing AI agents.

### DEC-004: Ingest OpenRails Machinery into Microcosm Financial Kernel
* **Context**: OpenRails already solved onchain vault custody, EIP-712 settlement routing, and payment lifecycle mechanics in `Jaydearcadian/mcosm-OpenRails`.
* **Decision**: Absorb and simplify the relevant financial execution components directly into Microcosm, rather than building Microcosm as a loose external client of OpenRails.
* **Consequence**: High internal cohesion, single codebase, robust provenance continuity.

### DEC-005: Work as First-Class Citizen with Gaia Exception Refunds
* **Context**: Money must never move without a Work Order and verifiable deliverable proof; failed or expired work must not strand or lose funds.
* **Decision**: Elevate Work Orders (`createJob` → `submitDeliverable` → `evaluateJob`, mirroring `AgenticCommerce.sol` states `Open/Funded/Submitted/Completed/Rejected/Expired`) into the Space runtime and MCP surface (`work_create`, `work_submit`, `work_evaluate`, `work_get`). `Rejected`/`Expired` outcomes trigger a Gaia exception refund returning 100% of escrow to the Space balance.
* **Consequence**: Every settlement is bound to deliverable evidence; every failure has a deterministic, audited refund path ($0 lost).

### DEC-006: EIP-712 Attestation Binds Space Authority to Settlement
* **Context**: Onchain contracts must not honor bare calls from anyone holding an RPC endpoint (ADV-02); agent intents need cryptographic provenance.
* **Decision**: Settle only against EIP-712 authorizations over domain (`Microcosm`, `1`, chainId, verifying contract), verified via `ecrecover` against registered Space Controllers, with per-Space nonces and deadlines. Offchain SDK encoders in `packages/policy-engine` are cross-checked byte-for-byte against the onchain verifier via a shared fixture vector.
* **Consequence**: Tampered, stale, replayed, or cross-chain intents revert deterministically.

### DEC-007: Internet Court Adjudication Instead of Ad-Hoc Quorums
* **Context**: Contested deliverables need a neutral verdict path; ad-hoc offchain voter quorums lack standards alignment and onchain enforceability.
* **Decision**: Define `IAdjudicator` (GenLayer-compatible): the court receives `(jobId, deliverableHash, evidenceUri, rubricHash)` and posts its verdict back through `resolveAdjudication`, callable only by the bound adjudicator contract. `Adjudicating` jobs halt all payouts; a stalled court cannot strand escrow (expiry escape hatch reclaims funds).
### DEC-008: Adopt Rebaseline v2 as the Canonical Product Definition
* **Context**: The implementation drifted toward a provider-hire-evaluate loop that reads as an agent marketplace; the product is the environment where a business runs work with people and software.
* **Decision**: Adopt `docs/canonical/REBASELINE_v2.md` as the product authority. Single kernel noun broadens from `Space` alone to the product loop `Space → Request → Work → Result → Payment → Activity`, with `Request` introduced as a first-class object and `Work Order` demoted to an escrow mechanism. External ontology stays small (`docs/canonical/REBASELINE_v2.md` §22).
* **Consequence**: All new MCP/REST/SDK surfaces are named for the product loop; marketplace nouns (`Provider Registry`, `Agent Reputation`, hiring/matching) are prohibited from external surfaces per §15. Existing escrow and adjudication machinery is retained underneath per §19.
* **Consequence**: One standard adapter covers human fallback and future GenLayer integration; MCP mirrors it via `work_request_verdict` / `work_post_verdict`.
