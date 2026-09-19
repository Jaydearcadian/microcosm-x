# PROOF LEDGER — Microcosm on OKX X Layer

This ledger tracks the verified evidence for every claim in the repository. A status of `VERIFIED` requires a real, reproducible command execution output.

Status vocabulary: `UNTESTED · PARTIAL · FAILED · VERIFIED · REGRESSED`.

---

| Claim ID | Category | Claim Description | Status | Evidence Command / Reference | Last Checked |
|---|---|---|---|---|---|
| **SPACE-1** | Space Policy | An agent cannot exceed the Space's `maxPerTransaction` rule | `UNTESTED` | Pending `packages/policy-engine/test/space-policy.test.ts` | 2026-09-19 |
| **SPACE-2** | Space Policy | Violations produce a deterministic `DenialProof` with actor ID and rule details | `UNTESTED` | Pending `packages/policy-engine/test/space-boundary.test.ts` | 2026-09-19 |
| **SPACE-3** | Space Policy | Allowed counterparties filter restricts payments to unapproved recipients | `UNTESTED` | Pending `packages/policy-engine/test/counterparty-whitelist.test.ts` | 2026-09-19 |
| **CHAIN-1** | X Layer | Contracts compile cleanly with Foundry targeting X Layer EVM | `UNTESTED` | Pending `cd contracts && forge build` | 2026-09-19 |
| **CHAIN-2** | X Layer | `SettlementRouter.sol` executes atomic direct payment on X Layer with ERC-20 / USDC | `UNTESTED` | Pending `cd contracts && forge test --match-contract SettlementRouterTest` | 2026-09-19 |
| **CHAIN-3** | X Layer | `ClaimEscrow.sol` holds funds and releases only upon verified claim | `UNTESTED` | Pending `cd contracts && forge test --match-contract ClaimEscrowTest` | 2026-09-19 |
| **MCP-1** | MCP Agent | Agent can list Space capabilities and request valid payment via MCP | `UNTESTED` | Pending `node --test mcp/test/mcp-server.test.js` | 2026-09-19 |
| **MCP-2** | MCP Agent | Agent payment request exceeding rule is rejected with `isError: true` and denial proof | `UNTESTED` | Pending `node --test mcp/test/mcp-boundary.test.js` | 2026-09-19 |
| **E2E-1** | E2E Flow | End-to-end Procurement Space workflow (Creation → Funding → Valid Payment Settles → Over-limit Fails) | `UNTESTED` | Pending `make e2e` | 2026-09-19 |
| **SUITE-1** | CI / Quality | Full repository test suite passes green locally | `UNTESTED` | `make test` | 2026-09-19 |

---

## Log of Executed Evidence

*(Execution outputs will be recorded here chronologically as each claim is verified).*
