// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";
import {SpaceBudget} from "../src/SpaceBudget.sol";
import {MockERC20} from "../src/test/MockERC20.sol";

interface VmPool {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function expectRevert() external;
    function expectRevert(bytes calldata) external;
}

/// Why this exists: today the broadcaster's own wallet funds every Space's
/// payments, so one leaked key loses everything, and `space.balance` is a number
/// in our JSON that nobody on chain can check. The router can hold a per-Space
/// pool instead, and the sum of it should equal what the router actually holds.
///
/// These tests pin the deposit side and, more importantly, the invariant. The
/// switch that makes settleDirect draw on the pool comes later; until then this
/// is a shadow, and a shadow nobody checks is worth nothing.
contract SpacePoolTest {
    VmPool internal constant vm = VmPool(address(uint160(uint256(keccak256("hevm cheat code")))));

    SettlementRouter internal router;
    SpaceBudget internal budget;
    MockERC20 internal token;

    uint256 internal ownerKey = 0xA11CE5EED;
    address internal owner;
    address internal funder = address(0xF00);
    address internal recipient = address(0xB0B);
    bytes32 internal spaceId = keccak256("pool-space");
    bytes32 internal otherSpace = keccak256("other-pool-space");

    function setUp() public {
        owner = vm.addr(ownerKey);
        router = new SettlementRouter(owner, true);
        token = new MockERC20();
        budget = new SpaceBudget();
        // The router is owned by `owner`, so its own wiring is done as the owner.
        vm.startPrank(owner);
        router.setBudgetContract(address(budget));
        router.registerSpaceToken(spaceId, address(token));
        router.registerSpaceToken(otherSpace, address(token));
        vm.stopPrank();

        token.mint(funder, 1_000_000e6);
        // The mistaken-sender needs a balance to send from.
        token.mint(address(0xBAD), 1_000e6);
        vm.startPrank(funder);
        token.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _require(bool ok, string memory why) internal pure {
        require(ok, why);
    }

    // ---- depositing

    function testADepositLandsInThatSpacesPool() public {
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        _require(router.spaceBalance(spaceId) == 400e6, "space balance not credited");
        _require(router.totalAccounted() == 400e6, "total not accounted");
        _require(token.balanceOf(address(router)) == 400e6, "tokens not received");
    }

    function testTwoSpacesAreKeptApart() public {
        vm.startPrank(funder);
        router.deposit(spaceId, 400e6);
        router.deposit(otherSpace, 100e6);
        vm.stopPrank();
        _require(router.spaceBalance(spaceId) == 400e6, "first space wrong");
        _require(router.spaceBalance(otherSpace) == 100e6, "second space wrong");
        _require(router.totalAccounted() == 500e6, "total wrong");
    }

    function testDepositsAccumulate() public {
        vm.startPrank(funder);
        router.deposit(spaceId, 100e6);
        router.deposit(spaceId, 250e6);
        vm.stopPrank();
        _require(router.spaceBalance(spaceId) == 350e6, "deposits did not accumulate");
    }

    // ---- the invariant, which is the whole point

    function testWhatTheRouterHoldsEqualsWhatItOwes() public {
        vm.startPrank(funder);
        router.deposit(spaceId, 400e6);
        router.deposit(otherSpace, 100e6);
        vm.stopPrank();
        _require(token.balanceOf(address(router)) == router.totalAccounted(), "the books do not balance");
    }

    function testTheInvariantHoldsAfterAMistakenTransfer() public {
        // Someone sends tokens straight to the router. That is excess, not a
        // deposit, and it must not be mistaken for money owed to a Space.
        vm.prank(address(0xBAD));
        token.transfer(address(router), 7e6);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        _require(token.balanceOf(address(router)) == 407e6, "unexpected holding");
        _require(router.totalAccounted() == 400e6, "excess was accounted as a deposit");
    }

    // ---- and the excess sweep cannot reach a Space's money

    function testExcessCanBeSwept() public {
        vm.prank(address(0xBAD));
        token.transfer(address(router), 7e6);
        vm.prank(owner);
        router.sweepExcess(address(token), recipient, 7e6);
        _require(token.balanceOf(address(router)) == 0, "excess not swept");
        _require(router.totalAccounted() == 0, "total moved");
    }

    function testTheSweepCannotTouchASpacesFunds() public {
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.prank(owner);
        vm.expectRevert(bytes("no excess to sweep"));
        router.sweepExcess(address(token), recipient, 1);
    }

    function testTheSweepIsBoundedByTheExcessNotTheBalance() public {
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.prank(address(0xBAD));
        token.transfer(address(router), 7e6);
        // 500 would take 7 of the excess and 493 of the Space's money.
        vm.prank(owner);
        vm.expectRevert(bytes("amount exceeds excess"));
        router.sweepExcess(address(token), recipient, 500e6);
    }

    function testOnlyTheRouterOwnerCanSweep() public {
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.prank(address(0xBAD));
        token.transfer(address(router), 7e6);
        vm.prank(funder);
        vm.expectRevert(bytes("only owner"));
        router.sweepExcess(address(token), recipient, 1e6);
    }

    // ---- bad deposits

    function testDepositingForAnUnregisteredSpaceIsRefused() public {
        vm.prank(funder);
        vm.expectRevert(bytes("space token not registered"));
        router.deposit(keccak256("never-registered"), 10e6);
    }

    function testDepositingNothingIsRefused() public {
        vm.prank(funder);
        vm.expectRevert(bytes("amount required"));
        router.deposit(spaceId, 0);
    }

    function testDepositingWithoutAnApprovalIsRefused() public {
        address other = address(0xA11CE);
        vm.prank(other);
        vm.expectRevert();
        router.deposit(spaceId, 10e6);
    }

    /// The pool is shadow only: a payment is still funded by the broadcaster, so
    /// depositing does not change what a Space can pay for. This test exists so
    /// that if the switch ever lands, it fails here and gets a decision rather
    /// than happening quietly.
    function testDepositingDoesNotYetChangeWhatASpaceCanPay() public {
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        _require(router.spaceBalance(spaceId) == 400e6, "pool not credited");
        // Still no switch: settleDirect pulls from the caller, so a funded Space
        // with a signed cap of 500 can still only move what the caller holds.
        _require(token.balanceOf(funder) == 999_600e6, "the funder's own balance changed");
    }
}
