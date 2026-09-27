// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";

interface Vm {
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
}

/**
 * Deploy only the router, reusing the contracts already in production.
 *
 * Running the full DeployXLayer script again would have produced a fresh
 * EnvelopeRegistry, ClaimEscrow, AgenticCommerce and SpaceBudget along with it.
 * That is not a redeploy, it is a second deployment, and it would have left the
 * already-bound Space pointing at a limits contract nobody reads and orphaned a
 * real settled transaction's contracts. The only thing that actually needs to
 * change is the router, because the pool lives in it.
 *
 * Environment:
 *   PRIVATE_KEY           deployer key funded with testnet OKB
 *   DEPLOYER_ADDRESS      Space authority owning the contracts
 *   EXISTING_SPACE_BUDGET the SpaceBudget already enforcing on the old router
 */
contract RedeployRouterWithPool {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event RouterRedeployed(address indexed router, address indexed spaceBudget, address indexed asset);

    function run() external returns (address routerAddr) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address budget = vm.envAddress("EXISTING_SPACE_BUDGET");

        // Refusing a zero budget is the whole point. The first router shipped
        // without one and could not settle anything, while looking deployed.
        require(budget != address(0), "EXISTING_SPACE_BUDGET required");

        vm.startBroadcast(deployerKey);
        SettlementRouter router = new SettlementRouter(deployer, true);
        // Reuse the limits contract that already holds the signed Space caps.
        // Pointing this at a fresh SpaceBudget would silently orphan every cap
        // signed against the old one.
        router.setBudgetContract(budget);
        vm.stopBroadcast();

        routerAddr = address(router);
        emit RouterRedeployed(routerAddr, budget, address(0));
    }
}
