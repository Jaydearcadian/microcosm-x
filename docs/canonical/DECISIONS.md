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
