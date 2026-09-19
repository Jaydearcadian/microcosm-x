// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {EnvelopeRegistry} from "../src/EnvelopeRegistry.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {MockERC20} from "../src/test/MockERC20.sol";

interface Vm {
    function startBroadcast() external;
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployXLayer {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (
        address envelopeRegistryAddr,
        address settlementRouterAddr,
        address claimEscrowAddr,
        address usdcAddr,
        address agenticCommerceAddr
    ) {
        vm.startBroadcast();

        address deployer = msg.sender;

        // 1. Deploy EnvelopeRegistry
        EnvelopeRegistry envelopeRegistry = new EnvelopeRegistry(deployer);
        envelopeRegistryAddr = address(envelopeRegistry);

        // 2. Deploy SettlementRouter (receipt storage enabled)
        SettlementRouter settlementRouter = new SettlementRouter(deployer, true);
        settlementRouterAddr = address(settlementRouter);

        // 3. Deploy ClaimEscrow (receipt storage enabled)
        ClaimEscrow claimEscrow = new ClaimEscrow(deployer, true);
        claimEscrowAddr = address(claimEscrow);

        // 4. Deploy testnet USDC token
        MockERC20 usdc = new MockERC20();
        usdcAddr = address(usdc);

        // 5. Deploy AgenticCommerce kernel bound to USDC
        AgenticCommerce agenticCommerce = new AgenticCommerce(deployer, address(usdc));
        agenticCommerceAddr = address(agenticCommerce);

        vm.stopBroadcast();
    }
}
