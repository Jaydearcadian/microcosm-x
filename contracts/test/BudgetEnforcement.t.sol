// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";
import {SpaceBudget} from "../src/SpaceBudget.sol";
import {MockERC20} from "../src/test/MockERC20.sol";

/// The point of these: limits that live only in our own server are a decision
/// we are trusted to make. These tests drive the router itself, so the cap has
/// to hold even if something upstream forgets to check it.
interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function addr(uint256) external returns (address);
    function warp(uint256) external;
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function expectRevert() external;
    function expectRevert(bytes calldata) external;
}

abstract contract Assertions {
    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "assertEq failed");
    }
    function assertTrue(bool c) internal pure {
        require(c, "assertTrue failed");
    }
}

contract BudgetEnforcementTest is Assertions {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SettlementRouter internal router;
    SpaceBudget internal budget;
    MockERC20 internal token;

    uint256 internal ownerKey = 0xA11CE5EED;
    address internal spaceOwner;
    address internal payer = address(0xA11CE);
    address internal vendor = address(0xB0B);
    address internal stranger = address(0xDEAD);

    bytes32 internal spaceId = keccak256("space-enforced");
    bytes32 internal unboundSpaceId = keccak256("space-never-bound");

    uint256 internal constant CAP = 1_000e6;
    uint256 internal constant DAILY = 2_000e6;

    function setUp() public {
        router = new SettlementRouter(address(this), true);
        budget = new SpaceBudget();
        token = new MockERC20();
        spaceOwner = vm.addr(ownerKey);

        router.setBudgetContract(address(budget));
        router.registerSpaceToken(spaceId, address(token));
        _bind(spaceId, CAP, DAILY, _list(vendor), 0);

        token.mint(payer, 100_000_000e6);
        vm.startPrank(payer);
        token.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _list(address a) internal pure returns (address[] memory out) {
        out = new address[](1);
        out[0] = a;
    }

    /// Signs the limits for a Space. Same signature the owner would send from a
    /// wallet, so the test exercises the real path rather than a privileged one.
    function _bind(bytes32 id, uint256 cap, uint256 daily, address[] memory who, uint256 nonce) internal {
        SpaceBudget.Binding memory b = SpaceBudget.Binding({
            spaceId: id,
            owner: spaceOwner,
            maxPerTransaction: cap,
            dailyBudget: daily,
            recipients: who,
            deadline: block.timestamp + 3650 days,
            nonce: nonce
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(ownerKey, budget.bindingDigestFor(address(budget), block.chainid, b));
        budget.bind(b, abi.encodePacked(r, s, v));
    }

    function _pay(bytes32 id, address to, uint256 amount) internal {
        vm.prank(payer);
        router.settleDirect(id, keccak256("pay"), address(token), to, amount);
    }

    // ---- the payment path is open when the owner signed limits that allow it

    function testAPaymentInsideTheSignedLimitsStillGoesThrough() public {
        _pay(spaceId, vendor, 400e6);
        assertEq(token.balanceOf(vendor), 400e6);
    }

    // ---- and shut against every way the limits could be ignored

    function testAnOverCapPaymentIsRejectedByTheRouter() public {
        vm.expectRevert();
        _pay(spaceId, vendor, CAP + 1);
    }

    function testAPaymentToSomeoneTheOwnerNeverSignedIsRejected() public {
        vm.expectRevert();
        _pay(spaceId, stranger, 100e6);
        assertEq(token.balanceOf(stranger), 0);
    }

    function testASpaceThatWasNeverBoundCannotBePaidFrom() public {
        vm.expectRevert();
        _pay(unboundSpaceId, vendor, 100e6);
    }

    function testTheDailyBudgetHoldsAcrossSeparatePayments() public {
        _pay(spaceId, vendor, CAP);
        _pay(spaceId, vendor, CAP);
        assertEq(budget.remainingToday(spaceId), 0);
        vm.expectRevert();
        _pay(spaceId, vendor, 1);
    }

    function testTheDailyBudgetOpensAgainTheNextDay() public {
        _pay(spaceId, vendor, CAP);
        _pay(spaceId, vendor, CAP);
        vm.warp(block.timestamp + 1 days);
        _pay(spaceId, vendor, CAP);
        assertEq(token.balanceOf(vendor), 3 * CAP);
    }

    function testAnUnconfiguredBudgetStopsSettlementRatherThanSkippingIt() public {
        SettlementRouter bare = new SettlementRouter(address(this), true);
        vm.prank(payer);
        token.approve(address(bare), type(uint256).max);
        vm.expectRevert(bytes("budget contract not configured"));
        vm.prank(payer);
        bare.settleDirect(spaceId, keccak256("pay"), address(token), vendor, 1);
    }

    function testTheOwnerCannotClearTheBudgetToUnlockUnlimitedSpending() public {
        vm.expectRevert(bytes("budget required"));
        router.setBudgetContract(address(0));
    }

    /// Tightening the limits has to bind, or the router would keep honouring the
    /// looser numbers the Space started with.
    function testATightenedCapStopsAPaymentTheOldLimitsAllowed() public {
        _pay(spaceId, vendor, CAP);
        _bind(spaceId, 100e6, 200e6, _list(vendor), 1);
        vm.expectRevert();
        _pay(spaceId, vendor, 500e6);
    }

    function testAReloadedOwnerCannotWidenTheAllowlist() public {
        SpaceBudget.Binding memory b = SpaceBudget.Binding({
            spaceId: spaceId,
            owner: stranger,
            maxPerTransaction: CAP,
            dailyBudget: DAILY,
            recipients: _list(stranger),
            deadline: block.timestamp + 3650 days,
            nonce: 2
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(uint256(uint160(stranger)), budget.bindingDigestFor(address(budget), block.chainid, b));
        vm.expectRevert();
        budget.bind(b, abi.encodePacked(r, s, v));
        vm.expectRevert();
        _pay(spaceId, stranger, 100e6);
    }
}
