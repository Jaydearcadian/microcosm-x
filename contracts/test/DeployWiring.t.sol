// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";
import {SpaceBudget} from "../src/SpaceBudget.sol";
import {MockERC20} from "../src/test/MockERC20.sol";

interface VmDeploy {
    function envUint(string calldata) external returns (uint256);
    function envOr(string calldata, address) external returns (address);
    function addr(uint256) external returns (address);
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes calldata) external;
}

/// The deployment script used to leave the router with no limits contract, which
/// makes it incapable of settling: `_requireBudget` reverts on both paths. So
/// the live router looked deployed and was inert.
///
/// This runs the same sequence the script performs and then actually tries to
/// settle, because "the call went through" is the only evidence that matters.
interface VmSign {
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

abstract contract DeployAssertions {
    function assertEq(address a, address b, string memory why) internal pure {
        require(a == b, why);
    }
    function assertEq(address a, address b) internal pure {
        require(a == b, "assertEq(address) failed");
    }
    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "assertEq(uint256) failed");
    }
    function assertEq(string memory a, string memory b) internal pure {
        require(keccak256(bytes(a)) == keccak256(bytes(b)), "assertEq(string) failed");
    }
}

contract DeployWiringTest is DeployAssertions {
    VmDeploy internal constant vm = VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));
    VmSign internal constant vms = VmSign(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal deployerKey = 0xA11CE5EED;
    address internal owner;
    address internal recipient = address(0xB0B);
    bytes32 internal spaceId = keccak256("deployed-space");

    SettlementRouter internal router;
    SpaceBudget internal budget;
    MockERC20 internal token;

    function setUp() public {
        owner = vm.addr(deployerKey);
        router = new SettlementRouter(owner, true);
        token = new MockERC20();
        budget = new SpaceBudget();

        // exactly what the script does, from the owner the script deploys from
        vm.startPrank(owner);
        router.setBudgetContract(address(budget));
        router.registerSpaceToken(spaceId, address(token));
        vm.stopPrank();

        token.mint(owner, 1_000_000e6);
        vm.startPrank(owner);
        token.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _bind() internal {
        address[] memory allow = new address[](1);
        allow[0] = recipient;
        SpaceBudget.Binding memory b = SpaceBudget.Binding({
            spaceId: spaceId,
            owner: owner,
            maxPerTransaction: 500e6,
            dailyBudget: 2000e6,
            recipients: allow,
            deadline: block.timestamp + 3650 days,
            nonce: 0
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vms.sign(deployerKey, budget.bindingDigestFor(address(budget), block.chainid, b));
        budget.bind(b, abi.encodePacked(r, s, v));
    }

    function testTheRouterIsWiredAndCanSettleAfterDeployAndBind() public {
        assertEq(router.budgetContract(), address(budget), "router has no limits contract");
        _bind();
        vm.prank(owner);
        router.settleDirect(spaceId, keccak256("pay"), address(token), recipient, 350e6);
        assertEq(token.balanceOf(recipient), 350e6);
    }

    function testWithoutTheWiringTheRouterCannotSettleAtAll() public {
        SettlementRouter bare = new SettlementRouter(owner, true);
        token.mint(owner, 1_000_000e6);
        vm.prank(owner);
        token.approve(address(bare), type(uint256).max);
        vm.expectRevert(bytes("budget contract not configured"));
        vm.prank(owner);
        bare.settleDirect(spaceId, keccak256("pay"), address(token), recipient, 1);
    }
}
