// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SpaceBudget} from "../src/SpaceBudget.sol";
import {SettlementRouter} from "../src/SettlementRouter.sol";

interface VmBind {
    function envUint(string calldata) external returns (uint256);
    function envAddress(string calldata) external returns (address);
    function envString(string calldata) external returns (string memory);
    function envOr(string calldata, uint256) external returns (uint256);
    function toString(uint256) external pure returns (string memory);
    function parseAddress(string calldata) external pure returns (address);
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

/**
 * Binds one Space's limits on the live limits contract, and registers its
 * settlement asset on the router.
 *
 * A Space cannot be paid until this has run for it. Until then every settlement
 * is refused, which is the intended behaviour rather than a fault: an unbound
 * Space has nobody who signed for the money leaving it.
 *
 * The Space id is hashed because the contracts key on bytes32 while the product
 * identifies a Space by a readable string. The same derivation lives in
 * mcp/src/xlayer.js as spaceIdToBytes32, and the two must agree.
 *
 * Environment:
 *   PRIVATE_KEY    Space owner key (defaults to the deployer)
 *   SPACE_ID       readable Space id, e.g. space-procurement-001
 *   ASSET          settlement asset to register
 *   MAX_PER_TX     per-payment cap in base units
 *   DAILY_BUDGET   daily budget in base units
 *   RECIPIENT      comma-separated allowlist
 *   EXPIRY         unix seconds; defaults to 100 years out
 *   NONCE          defaults to 0, which is the first binding for a Space
 */
contract BindSpaceBudget {
    VmBind internal constant vm = VmBind(address(uint160(uint256(keccak256("hevm cheat code")))));

    event Bound(bytes32 indexed spaceId, address indexed owner, address indexed budget);

    function run() external returns (bytes32 spaceId) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address budgetAddr = vm.envAddress("SPACE_BUDGET_ADDRESS");
        address routerAddr = vm.envAddress("SETTLEMENT_ROUTER_ADDRESS");
        address asset = vm.envAddress("ASSET");
        address owner = vm.addr(key);
        spaceId = keccak256(bytes(vm.envString("SPACE_ID")));

        SpaceBudget.Binding memory b = _binding(budgetAddr, key, owner, spaceId);

        vm.startBroadcast(key);
        // Register the asset first: the router refuses to settle a Space whose
        // token it does not know, and a limits binding alone is not enough.
        SettlementRouter(routerAddr).registerSpaceToken(spaceId, asset);
        SpaceBudget(budgetAddr).bind(b, _signature(budgetAddr, key, b));
        vm.stopBroadcast();

        emit Bound(spaceId, owner, budgetAddr);
    }

    /// Split out because run() was at the edge of the stack limit.
    function _binding(address budgetAddr, uint256 key, address owner, bytes32 spaceId)
        internal
        returns (SpaceBudget.Binding memory b)
    {
        address[] memory allowed = new address[](1);
        allowed[0] = vm.parseAddress(vm.envString("RECIPIENT"));
        b = SpaceBudget.Binding({
            spaceId: spaceId,
            owner: owner,
            maxPerTransaction: vm.envOr("MAX_PER_TX", 500e6),
            dailyBudget: vm.envOr("DAILY_BUDGET", 2000e6),
            recipients: allowed,
            deadline: vm.envOr("EXPIRY", block.timestamp + 100 * 365 days),
            nonce: vm.envOr("NONCE", 0)
        });
        budgetAddr;
        key;
    }

    function _signature(address budgetAddr, uint256 key, SpaceBudget.Binding memory b)
        internal
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, SpaceBudget(budgetAddr).bindingDigestFor(budgetAddr, block.chainid, b));
        return abi.encodePacked(r, s, v);
    }
}
