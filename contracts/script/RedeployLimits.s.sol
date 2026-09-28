// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";
import {SpaceBudget} from "../src/SpaceBudget.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";

interface Vm {
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
}

/**
 * Redeploy the limits contract and the router that enforces it.
 *
 * The digest SpaceBudget signs has changed. It used to hash the recipient array
 * with abi.encode, which is not the encoding EIP-712 specifies, so the digest a
 * wallet computes and the digest this contract computed never agreed and no
 * Space owner could sign its own limits. Fixing that changes the digest, which
 * invalidates every existing binding: the stored limits survive, but the
 * signature that put them there is no longer the one the contract would check.
 *
 * So the limits contract is new, the router is new and points at it, and the
 * escrow is re-pointed at it in place rather than redeployed — its jobs and
 * state stay where they are. Every Space has to be re-bound by its own owner
 * afterwards, which is the part that cannot be done from here.
 *
 * Environment:
 *   PRIVATE_KEY        deployer key funded with testnet OKB
 *   DEPLOYER_ADDRESS   Space authority owning the contracts
 *   ASSET_ADDRESS      the settlement asset the router will pay from
 *   COMMERCE_ADDRESS   the existing AgenticCommerce to re-point
 */
contract RedeployLimits {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event LimitsRedeployed(address indexed spaceBudget, address indexed router, address indexed commerce, address asset);

    function run() external returns (address budgetAddr, address routerAddr) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address asset = vm.envAddress("ASSET_ADDRESS");
        address commerceAddr = vm.envAddress("COMMERCE_ADDRESS");

        vm.startBroadcast(deployerKey);

        // A fresh limits contract, because the digest is part of what it verifies.
        SpaceBudget budget = new SpaceBudget();
        budgetAddr = address(budget);

        // A fresh router, because it holds the budget address and the pools.
        SettlementRouter router = new SettlementRouter(deployer, true);
        router.setBudgetContract(budgetAddr);
        routerAddr = address(router);

        // Escrow spends money too and must ask the same limits contract. It is
        // re-pointed in place: its existing jobs and attestations are real state
        // and a redeploy would orphan them.
        AgenticCommerce commerce = AgenticCommerce(commerceAddr);
        commerce.setSpaceBudget(budgetAddr);

        vm.stopBroadcast();

        emit LimitsRedeployed(budgetAddr, routerAddr, commerceAddr, asset);
    }
}
