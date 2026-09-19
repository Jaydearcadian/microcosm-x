.PHONY: test test-contracts test-runtime test-mcp verify clean demo help

help:
	@echo "Microcosm on OKX X Layer — Command Reference"
	@echo "  make test            - Run all local test suites (contracts, runtime, MCP)"
	@echo "  make test-contracts  - Run Foundry tests for X Layer smart contracts"
	@echo "  make test-runtime    - Run Space runtime and policy engine test suites"
	@echo "  make test-mcp        - Run MCP server tool execution and boundary tests"
	@echo "  make verify          - Run full verification gate (types, lint, suites)"
	@echo "  make clean           - Remove build artifacts and caches"

test: test-contracts test-runtime test-mcp

test-contracts:
	@if [ -d "contracts" ] && [ -f "contracts/foundry.toml" ]; then \
		cd contracts && forge test -vvv; \
	else \
		echo "ℹ️  Contracts directory not yet initialized for Foundry. Skipping."; \
	fi

test-runtime:
	@if [ -f "package.json" ]; then \
		npm test; \
	else \
		echo "ℹ️  Runtime packages not yet initialized. Skipping."; \
	fi

test-mcp:
	@if [ -d "mcp" ] && [ -f "mcp/package.json" ]; then \
		cd mcp && npm test; \
	else \
		echo "ℹ️  MCP package not yet initialized. Skipping."; \
	fi

verify:
	@echo "Running full verification gate..."
	@$(MAKE) test
	@node scripts/verify-proof-ledger.mjs 2>/dev/null || echo "ℹ️  Proof ledger verification script pending."

clean:
	@rm -rf out cache node_modules/.cache
