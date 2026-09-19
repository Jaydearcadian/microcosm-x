# CONTRADICTIONS

Tracks conflicts between specifications, code, architecture, or external dependencies. Every contradiction must be resolved or explicitly cataloged.

---

| ID | Conflict | Sources in Conflict | Resolution Plan | Status |
|---|---|---|---|---|
| **CON-01** | Space nomenclature vs OpenRails nomenclature | `mcosm-OpenRails` uses `pacts`, `paths`, `mandates`. New architecture specifies single noun `Space`. | Internal adapter layer maps Space concepts to OpenRails execution kernel. User/agent APIs expose only `Space`. | `RESOLVED_IN_SPEC` |
| **CON-02** | Settlement target: Arc Testnet vs OKX X Layer | Original Microcosm repo targeted Arc testnet. OKX Dev Day 2026 targets OKX X Layer. | Update Foundry configuration, chain IDs (195/196), RPC endpoints, and USDC addresses for OKX X Layer. | `ACTIVE` |
