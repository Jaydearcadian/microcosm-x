// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {EnvelopeRegistry} from "../src/EnvelopeRegistry.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {MockERC20} from "../src/test/MockERC20.sol";
import {SpaceBudget} from "../src/SpaceBudget.sol";

interface Vm {
    function startBroadcast() external;
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function envUint(string calldata) external returns (uint256);
    function envOr(string calldata, address) external returns (address);
}

/**
 * OKX X Layer deployment script (Chain ID 1952 testnet / 196 mainnet).
 *
 * Environment:
 *   PRIVATE_KEY     deployer key funded with testnet OKB (required for broadcast)
 *   USDC_ADDRESS    existing testnet USDC (optional; deploys MockERC20 when empty)
 *   DEPLOYER_ADDRESS Space authority owning the contracts (defaults to the broadcaster)
 *
 * Deployed addresses are recorded in the forge broadcast artifact
 *   broadcast/DeployXLayer.s.sol/<chainId>/run-latest.json
 * in JSON format for automated ingestion into forge.json.
 */
contract DeployXLayer {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event Deployed(
        address indexed envelopeRegistry,
        address indexed settlementRouter,
        address indexed claimEscrow,
        address usdc,
        address agenticCommerce
    );

    event SpaceBudgetDeployed(address indexed spaceBudget, address indexed settlementRouter, address indexed asset);

    function run() external returns (
        address envelopeRegistryAddr,
        address settlementRouterAddr,
        address claimEscrowAddr,
        address usdcAddr,
        address agenticCommerceAddr,
        address spaceBudgetAddr
    ) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address existingUsdc = vm.envOr("USDC_ADDRESS", address(0));
        address configuredDeployer = vm.envOr("DEPLOYER_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        address deployer = configuredDeployer == address(0) ? msg.sender : configuredDeployer;

        // 1. Deploy EnvelopeRegistry
        EnvelopeRegistry envelopeRegistry = new EnvelopeRegistry(deployer);
        envelopeRegistryAddr = address(envelopeRegistry);

        // 2. Deploy SettlementRouter (with onchain receipt storage)
        SettlementRouter settlementRouter = new SettlementRouter(deployer, true);
        settlementRouterAddr = address(settlementRouter);

        // 3. Deploy ClaimEscrow (with onchain receipt storage)
        ClaimEscrow claimEscrow = new ClaimEscrow(deployer, true);
        claimEscrowAddr = address(claimEscrow);

        // 4. Resolve or deploy the settlement asset
        if (existingUsdc != address(0)) {
            usdcAddr = existingUsdc;
        } else {
            MockERC20 usdc = new MockERC20();
            usdcAddr = address(usdc);
        }

        // 5. Deploy AgenticCommerce kernel bound to the settlement asset
        AgenticCommerce agenticCommerce = new AgenticCommerce(deployer, usdcAddr);
        agenticCommerceAddr = address(agenticCommerce);

        // 6. Deploy the per-Space limits contract and point the router at it.
        spaceBudgetAddr = _deployAndWireLimits(settlementRouter);

        emit Deployed(
            envelopeRegistryAddr,
            settlementRouterAddr,
            claimEscrowAddr,
            usdcAddr,
            agenticCommerceAddr
        );

        vm.stopBroadcast();
    }

    /**
     * Deploy the per-Space limits contract and point the router at it.
     *
     * This step is not optional. SettlementRouter refuses to move anything
     * unless a limits contract is configured, so a router deployed without one
     * cannot settle a single payment, by anyone, ever. The first version of this
     * script left it unset, which is why the live router looked deployed and was
     * in fact inert — and nothing about the deployment itself said so.
     */
    function _deployAndWireLimits(SettlementRouter router) internal returns (address) {
        SpaceBudget spaceBudget = new SpaceBudget();
        router.setBudgetContract(address(spaceBudget));
        emit SpaceBudgetDeployed(address(spaceBudget), address(router), address(0));
        return address(spaceBudget);
    }
}
