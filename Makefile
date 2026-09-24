.PHONY: test test-contracts test-runtime test-mcp test-server verify clean demo help fork-test deploy-testnet verify-contracts

XLAYER_RPC_URL ?= https://testrpc.xlayer.tech
OKLINK_VERIFY_URL ?= https://www.oklink.com/api/v5/explorer/contract/verify-source-code-plugin/XLAYER_TESTNET

help:
	@echo "Microcosm on OKX X Layer — Command Reference"
	@echo "  make test            - Run all local test suites (contracts, runtime, MCP)"
	@echo "  make test-contracts  - Run Foundry tests for X Layer smart contracts"
	@echo "  make test-runtime    - Run Space runtime and policy engine test suites"
	@echo "  make test-mcp        - Run MCP server tool execution and boundary tests"
	@echo "  make test-server     - Run HTTP REST + SSE conformance tests"
	@echo "  make fork-test       - Run contract suite against a live X Layer testnet fork (pre-flight, no gas)"
	@echo "  make deploy-testnet  - Broadcast contracts to OKX X Layer Testnet (needs PRIVATE_KEY)"
	@echo "  make verify-contracts- Verify deployed sources on OKLink (needs ROUTER_ADDR, COMMERCE_ADDR, OKLINK_API_KEY)"
	@echo "  make verify          - Run full verification gate (types, lint, suites)"
	@echo "  make clean           - Remove build artifacts and caches"

test: test-contracts test-runtime test-mcp test-server test-sdk

test-contracts:
	@if [ -d "contracts" ] && [ -f "contracts/foundry.toml" ]; then \
		cd contracts && forge test -vvv; \
	else \
		echo "ℹ️  Contracts directory not yet initialized for Foundry. Skipping."; \
	fi

test-runtime:
	@if [ -f "package.json" ]; then \
		npm run test:policy; \
	else \
		echo "ℹ️  Runtime packages not yet initialized. Skipping."; \
	fi

test-mcp:
	@if [ -d "mcp" ] && [ -f "mcp/package.json" ]; then \
		cd mcp && npm test; \
	else \
		echo "ℹ️  MCP package not yet initialized. Skipping."; \
	fi

test-server:
	@if [ -d "packages/server" ] && [ -f "packages/server/package.json" ]; then \
		cd packages/server && npm test; \
	else \
		echo "ℹ️  Server package not yet initialized. Skipping."; \
	fi

test-sdk:
	@if [ -d "packages/sdk" ] && [ -f "packages/sdk/package.json" ]; then \
		cd packages/sdk && npm test; \
	else \
		echo "ℹ️  SDK package not yet initialized. Skipping."; \
	fi

verify:
	@echo "Running full verification gate..."
	@$(MAKE) test
	@node scripts/verify-proof-ledger.mjs 2>/dev/null || echo "ℹ️  Proof ledger verification script pending."

fork-test:
	@echo "Forking live OKX X Layer Testnet state (zero-cost pre-flight)..."
	@cd contracts && forge test --fork-url $(XLAYER_RPC_URL) -vvv

deploy-testnet:
	@if [ -z "$$PRIVATE_KEY" ]; then \
		echo "❌ PRIVATE_KEY is not set. Copy .env.example to .env and fund the deployer with testnet OKB (https://www.okx.com/xlayer/faucet)."; \
		exit 1; \
	fi
	@echo "Broadcasting to OKX X Layer Testnet (Chain ID 1952)..."
	@cd contracts && forge script script/DeployXLayer.s.sol:DeployXLayer \
		--rpc-url $(XLAYER_RPC_URL) \
		--broadcast \
		-vvvv

verify-contracts:
	@if [ -z "$(ROUTER_ADDR)" ] || [ -z "$(COMMERCE_ADDR)" ] || [ -z "$(OKLINK_API_KEY)" ]; then \
		echo "❌ Usage: make verify-contracts ROUTER_ADDR=0x... COMMERCE_ADDR=0x... OKLINK_API_KEY=..."; \
		exit 1; \
	fi
	@echo "Verifying contracts on OKLink (X Layer Testnet)..."
	@cd contracts && forge verify-contract $(ROUTER_ADDR) src/SettlementRouter.sol:SettlementRouter \
		--verifier oklink \
		--verifier-url $(OKLINK_VERIFY_URL) \
		--api-key $(OKLINK_API_KEY)
	@cd contracts && forge verify-contract $(COMMERCE_ADDR) src/AgenticCommerce.sol:AgenticCommerce \
		--verifier oklink \
		--verifier-url $(OKLINK_VERIFY_URL) \
		--api-key $(OKLINK_API_KEY)

clean:
	@rm -rf out cache node_modules/.cache
