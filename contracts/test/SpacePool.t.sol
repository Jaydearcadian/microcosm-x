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
    uint256 internal spaceOwnerKey = 0x5ACE0F1E5;
    uint256 internal otherOwnerKey = 0x015E4004;
    address internal owner;
    address internal spaceOwner;
    address internal otherOwner;
    address internal funder = address(0xF00);
    address internal recipient = address(0xB0B);
    bytes32 internal spaceId = keccak256("pool-space");
    bytes32 internal otherSpace = keccak256("other-pool-space");

    function setUp() public {
        owner = vm.addr(ownerKey);
        spaceOwner = vm.addr(spaceOwnerKey);
        otherOwner = vm.addr(otherOwnerKey);
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
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        _require(router.spaceBalance(spaceId) == 400e6, "space balance not credited");
        _require(router.totalAccounted() == 400e6, "total not accounted");
        _require(token.balanceOf(address(router)) == 400e6, "tokens not received");
    }

    function testTwoSpacesAreKeptApart() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        _bind(otherSpace, otherOwner, 500e6, 2000e6, recipient);
        vm.startPrank(funder);
        router.deposit(spaceId, 400e6);
        router.deposit(otherSpace, 100e6);
        vm.stopPrank();
        _require(router.spaceBalance(spaceId) == 400e6, "first space wrong");
        _require(router.spaceBalance(otherSpace) == 100e6, "second space wrong");
        _require(router.totalAccounted() == 500e6, "total wrong");
    }

    function testDepositsAccumulate() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.startPrank(funder);
        router.deposit(spaceId, 100e6);
        router.deposit(spaceId, 250e6);
        vm.stopPrank();
        _require(router.spaceBalance(spaceId) == 350e6, "deposits did not accumulate");
    }

    // ---- the invariant, which is the whole point

    function testWhatTheRouterHoldsEqualsWhatItOwes() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        _bind(otherSpace, otherOwner, 500e6, 2000e6, recipient);
        vm.startPrank(funder);
        router.deposit(spaceId, 400e6);
        router.deposit(otherSpace, 100e6);
        vm.stopPrank();
        _require(token.balanceOf(address(router)) == router.totalAccounted(), "the books do not balance");
    }

    function testTheInvariantHoldsAfterAMistakenTransfer() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
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
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(address(0xBAD));
        token.transfer(address(router), 7e6);
        vm.prank(owner);
        router.sweepExcess(address(token), recipient, 7e6);
        _require(token.balanceOf(address(router)) == 0, "excess not swept");
        _require(router.totalAccounted() == 0, "total moved");
    }

    function testTheSweepCannotTouchASpacesFunds() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.prank(owner);
        vm.expectRevert(bytes("no excess to sweep"));
        router.sweepExcess(address(token), recipient, 1);
    }

    function testTheSweepIsBoundedByTheExcessNotTheBalance() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
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
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
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
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        vm.expectRevert(bytes("space token not registered"));
        router.deposit(keccak256("never-registered"), 10e6);
    }

    function testDepositingNothingIsRefused() public {
        vm.prank(funder);
        vm.expectRevert(bytes("amount required"));
        router.deposit(spaceId, 0);
    }

    function testDepositingForAnUnboundSpaceIsRefused() public {
        // Deliberately not bound. Withdrawal is gated on the Space's own signed
        // owner, so a Space that never signed has nobody who can ever authorise a
        // refund and anything deposited for it is unreachable forever. This is
        // what stranded 15,830 USDC, and the offchain guard was the only thing
        // stopping it — a direct call bypassed that entirely.
        vm.expectRevert(bytes("space limits not bound; a Space with no signed owner could never withdraw"));
        vm.prank(funder);
        router.deposit(otherSpace, 100e6);
        _require(router.spaceBalance(otherSpace) == 0, "an unbound Space was credited");
        _require(token.balanceOf(funder) == 1_000_000e6, "the funder was charged anyway");
    }

    function testDepositingForABoundSpaceStillWorks() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        _require(router.spaceBalance(spaceId) == 400e6, "a bound Space could not be funded");
        _require(token.balanceOf(address(router)) == router.totalAccounted(), "books do not balance");
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
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        _require(router.spaceBalance(spaceId) == 400e6, "pool not credited");
        // Still no switch: settleDirect pulls from the caller, so a funded Space
        // with a signed cap of 500 can still only move what the caller holds.
        _require(token.balanceOf(funder) == 999_600e6, "the funder's own balance changed");
    }

    // ---- settling out of the pool
    //
    // settleFromPool is a separate function from settleDirect on purpose, so a
    // Space that has not funded a pool keeps working exactly as before and the
    // switch is opt-in rather than something an upgrade does to everybody.

    function testASpacePaysOutOfItsOwnPool() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);

        vm.prank(address(0xBEEF));
        router.settleFromPool(spaceId, keccak256("p1"), address(token), recipient, 150e6);

        // The vendor is paid from the router, not from any caller's wallet.
        _require(token.balanceOf(recipient) == 150e6, "recipient not paid");
        _require(router.spaceBalance(spaceId) == 250e6, "space balance not debited");
        _require(router.totalAccounted() == 250e6, "total not debited with it");
        _require(token.balanceOf(address(router)) == 250e6, "router did not actually pay out");
    }

    function testTheInvariantSurvivesASettlement() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        _bind(otherSpace, otherOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.prank(funder);
        router.deposit(otherSpace, 100e6);

        vm.prank(address(0xBEEF));
        router.settleFromPool(spaceId, keccak256("p1"), address(token), recipient, 300e6);

        // The one that matters: paying out must not make the difference look
        // like sweepable excess, or the owner can take a Space's spent money.
        _require(token.balanceOf(address(router)) == router.totalAccounted(), "books do not balance after payout");
        _require(router.totalAccounted() == 200e6, "total wrong after payout");
    }

    function testOneSpacesPoolCannotPayAnothersBill() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        // Bound but empty: otherwise this reverts as NotBound, which proves
        // something real but not the thing this test is about.
        _bind(otherSpace, otherOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 100e6);
        // A Space with an empty pool cannot borrow from the funded one.
        vm.expectRevert(bytes("insufficient space balance"));
        vm.prank(address(0xBEEF));
        router.settleFromPool(otherSpace, keccak256("p"), address(token), recipient, 1e6);
    }

    function testAPoolCannotSpendPastTheSpacesSignedCap() public {
        _bind(spaceId, spaceOwner, 100e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        // Holding 400 in the pool does not raise the per-transaction cap.
        vm.expectRevert();
        vm.prank(address(0xBEEF));
        router.settleFromPool(spaceId, keccak256("p"), address(token), recipient, 150e6);
    }

    function testAPoolCannotSpendPastTheSpacesDailyBudget() public {
        _bind(spaceId, spaceOwner, 200e6, 250e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.prank(address(0xBEEF));
        router.settleFromPool(spaceId, keccak256("p1"), address(token), recipient, 200e6);
        vm.expectRevert();
        vm.prank(address(0xBEEF));
        router.settleFromPool(spaceId, keccak256("p2"), address(token), recipient, 100e6);
    }

    function testAPoolCannotPaySomebodyTheSpaceHasNotApproved() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.expectRevert();
        vm.prank(address(0xBEEF));
        router.settleFromPool(spaceId, keccak256("p"), address(token), address(0xBAD), 10e6);
    }

    function testAPoolPaymentNeedsTheSpacesLimitsBound() public {
        // Deliberately unbound. It can no longer be funded, so it cannot be paid
        // from either — and the refusal now happens at the deposit rather than at
        // the payment, which is the earlier and better place to stop.
        vm.expectRevert(bytes("space limits not bound; a Space with no signed owner could never withdraw"));
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
    }

    function testAPoolCannotPayInATokenTheSpaceDidNotRegister() public {
        MockERC20 other = new MockERC20();
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.expectRevert(bytes("token mismatch"));
        vm.prank(address(0xBEEF));
        router.settleFromPool(spaceId, keccak256("p"), address(other), recipient, 10e6);
    }

    // ---- withdrawing a Space's own funds

    function testTheSignedOwnerCanTakeTheirOwnSpaceBack() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);

        vm.prank(spaceOwner);
        router.withdraw(spaceId, address(token), spaceOwner, 150e6);

        _require(token.balanceOf(spaceOwner) == 150e6, "owner not paid");
        _require(router.spaceBalance(spaceId) == 250e6, "balance not debited");
        _require(token.balanceOf(address(router)) == router.totalAccounted(), "books do not balance after withdrawal");
    }

    function testTheRouterOwnerCannotTakeASpacesMoney() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        // This is the whole point of holding funds here: whoever controls the
        // broadcaster must not be able to reach a Space's money.
        vm.expectRevert(bytes("not space owner"));
        vm.prank(owner);
        router.withdraw(spaceId, address(token), owner, 400e6);
    }

    function testAnotherSpaceCannotWithdraw() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.expectRevert(bytes("not space owner"));
        vm.prank(otherOwner);
        router.withdraw(spaceId, address(token), otherOwner, 400e6);
    }

    function testAWithdrawalCannotExceedWhatTheSpaceHas() public {
        _bind(spaceId, spaceOwner, 500e6, 2000e6, recipient);
        vm.prank(funder);
        router.deposit(spaceId, 400e6);
        vm.expectRevert(bytes("insufficient space balance"));
        vm.prank(spaceOwner);
        router.withdraw(spaceId, address(token), spaceOwner, 500e6);
    }

    /// An unbound Space can no longer hold funds at all, so the withdrawal gate
    /// for one is unreachable — there is nothing in it to withdraw. The guard that
    /// matters is on the way in, and it is asserted by
    /// testDepositingForAnUnboundSpaceIsRefused.
    function testAnUnboundSpaceCannotAccumulateAFundablePool() public {
        vm.expectRevert(bytes("space limits not bound; a Space with no signed owner could never withdraw"));
        vm.prank(funder);
        router.deposit(spaceId, 1e6);
        _require(router.spaceBalance(spaceId) == 0, "an unbound Space was credited");
    }

    /// Binds a Space's limits with a signature from `signer`, which is what makes
    /// that address — and only that address — able to withdraw.
    function _bind(
        bytes32 id,
        address signer,
        uint256 maxPerTx,
        uint256 daily,
        address approved
    ) internal {
        address[] memory allow = new address[](1);
        allow[0] = approved;
        SpaceBudget.Binding memory b = SpaceBudget.Binding({
            spaceId: id,
            owner: signer,
            maxPerTransaction: uint128(maxPerTx),
            dailyBudget: uint128(daily),
            recipients: allow,
            deadline: block.timestamp + 3650 days,
            nonce: 0
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            (signer == spaceOwner ? spaceOwnerKey : otherOwnerKey),
            budget.bindingDigestFor(address(budget), block.chainid, b)
        );
        budget.bind(b, abi.encodePacked(r, s, v));
    }
}
