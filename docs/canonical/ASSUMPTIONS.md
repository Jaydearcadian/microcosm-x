# ASSUMPTIONS

Every unverified assumption is tracked here until validated with executed evidence.

---

| ID | Domain | Assumption | Validation Method | Current Status |
|---|---|---|---|---|
| **ASM-01** | Substrate | OKX X Layer Testnet supports standard EIP-712 typed data signatures without non-standard precompile requirements | Deploy & execute test transaction with EIP-712 payload on X Layer RPC | `UNVERIFIED` |
| **ASM-02** | Substrate | Native USDC or testnet ERC-20 on X Layer Testnet adheres to standard ERC-20 6-decimal interface | Query token decimals and transfer behavior on X Layer Testnet | `UNVERIFIED` |
| **ASM-03** | Agent | Standard MCP clients (Claude, Cursor) can consume structured error outputs when a policy violation occurs | Integration test against local MCP server returning structured `isError` | `UNVERIFIED` |
| **ASM-04** | Performance | Policy evaluation in TypeScript has <5ms latency and produces zero external RPC calls during check | Benchmark `SpacePolicyEngine.evaluate()` in isolated test | `UNVERIFIED` |
