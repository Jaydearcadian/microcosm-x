// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SpaceBudget} from "../src/SpaceBudget.sol";

interface VmBudget {
    function addr(uint256) external returns (address);
    function warp(uint256) external;
    function expectRevert(bytes calldata) external;
    function expectRevert(bytes4) external;
    function prank(address) external;
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

/// The onchain half of the budget binding. Every test here is a way an agent,
/// a bug, or a hostile caller could try to move money the Space owner did not
/// agree to, and each one has to revert.

/// Minimal assertions, kept local so this test does not depend on another
/// test file's contract. Failing loudly with the value is the point.
contract SpaceBudgetAssertions {
    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "uint mismatch");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "address mismatch");
    }

    function assertEq(bool left, bool right) internal pure {
        require(left == right, "bool mismatch");
    }
}

contract SpaceBudgetTest is SpaceBudgetAssertions {
    VmBudget constant vm = VmBudget(address(uint160(uint256(keccak256("hevm cheat code")))));

    SpaceBudget internal budget;
    // The owner is derived from the key. Treating an address literal as a
    // private key signs with a different identity entirely, which is why every
    // binding here was rejected until this was fixed.
    uint256 internal ownerKey = 0xA11CE5EED;
    address internal owner;
    address internal stranger = address(0xB0B);
    address internal vendor = address(0xC0FFEE);
    address internal other = address(0xD00D);

    uint256 constant CAP = 500e6; // 500 USDC, 6dp
    uint256 constant DAILY = 2000e6;
    uint256 constant NONCE = 0;

    function setUp() public {
        budget = new SpaceBudget();
        owner = vm.addr(ownerKey);
    }

    function _sign(SpaceBudget.Binding memory b) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            ownerKey,
            budget.bindingDigestFor(address(budget), block.chainid, b)
        );
        return abi.encodePacked(r, s, v);
    }

    function _binding(
        address signer,
        uint256 cap,
        uint256 daily,
        address[] memory recipients,
        uint256 deadline,
        uint256 nonce
    ) internal pure returns (SpaceBudget.Binding memory) {
        return
            SpaceBudget.Binding({
                spaceId: keccak256("space-1"),
                owner: signer,
                maxPerTransaction: cap,
                dailyBudget: daily,
                recipients: recipients,
                deadline: deadline,
                nonce: nonce
            });
    }

    function _recipients() internal pure returns (address[] memory list) {
        list = new address[](2);
        list[0] = address(0xC0FFEE);
        list[1] = address(0xD00D);
    }

    function _bind() internal {
        SpaceBudget.Binding memory b = _binding(owner, CAP, DAILY, _recipients(), block.timestamp + 1 days, NONCE);
        budget.bind(b, _sign(b));
    }

    // ---- binding -------------------------------------------------------

    function testOwnerBindsAndCapsAreReadable() public {
        _bind();
        (address boundOwner, uint128 cap, uint128 daily,,,,) = budget.limits(keccak256("space-1"));
        assertEq(boundOwner, owner);
        assertEq(uint256(cap), CAP);
        assertEq(uint256(daily), DAILY);
        assertEq(budget.remainingToday(keccak256("space-1")), DAILY);
    }

    function testASignatureFromAnyoneElseIsRejected() public {
        SpaceBudget.Binding memory b = _binding(vendor, CAP, DAILY, _recipients(), block.timestamp + 1 days, NONCE);
        // signed by `owner` but naming `vendor` as the Space owner
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            ownerKey,
            budget.bindingDigestFor(address(budget), block.chainid, b)
        );
        vm.expectRevert(SpaceBudget.BadSignature.selector);
        budget.bind(b, abi.encodePacked(r, s, v));
    }

    function testATamperedLimitIsRejected() public {
        // sign 500, then claim 50000
        SpaceBudget.Binding memory signed_ = _binding(owner, CAP, DAILY, _recipients(), block.timestamp + 1 days, NONCE);
        bytes memory signature = _sign(signed_);
        SpaceBudget.Binding memory tampered = _binding(
            owner,
            600e6,
            2400e6,
            _recipients(),
            block.timestamp + 1 days,
            NONCE
        );
        vm.expectRevert(SpaceBudget.BadSignature.selector);
        budget.bind(tampered, signature);
    }

    function testAnAddedRecipientIsRejected() public {
        SpaceBudget.Binding memory signed_ = _binding(owner, CAP, DAILY, _recipients(), block.timestamp + 1 days, NONCE);
        bytes memory signature = _sign(signed_);
        address[] memory extra = new address[](3);
        extra[0] = address(0xC0FFEE);
        extra[1] = address(0xD00D);
        extra[2] = stranger; // one more payee than was signed for
        SpaceBudget.Binding memory tampered = _binding(
            owner,
            CAP,
            DAILY,
            extra,
            block.timestamp + 1 days,
            NONCE
        );
        vm.expectRevert(SpaceBudget.BadSignature.selector);
        budget.bind(tampered, signature);
    }

    function testAnExpiredBindingIsRejected() public {
        SpaceBudget.Binding memory b = _binding(owner, CAP, DAILY, _recipients(), block.timestamp - 1, NONCE);
        bytes memory signature = _sign(b);
        vm.expectRevert(abi.encodeWithSelector(SpaceBudget.Expired.selector, block.timestamp - 1));
        budget.bind(b, signature);
    }

    function testAReplayedNonceIsRejected() public {
        _bind();
        // the same signed payload a second time: the nonce has moved on
        SpaceBudget.Binding memory replay = _binding(
            owner,
            CAP,
            DAILY,
            _recipients(),
            block.timestamp + 1 days,
            NONCE
        );
        bytes memory signature = _sign(replay);
        vm.expectRevert(SpaceBudget.BadSignature.selector);
        budget.bind(replay, signature);
    }

    function testARaisedCapNeedsAFreshSignature() public {
        _bind();
        // the owner may tighten freely, but raising it needs a new nonce and a
        // new signature, so a captured one cannot be replayed to loosen later
        // both figures move together: a daily budget below the per-payment cap
        // is not a coherent Space, and the contract refuses to bind one
        SpaceBudget.Binding memory raised = _binding(
            owner,
            5000e6,
            20000e6,
            _recipients(),
            block.timestamp + 1 days,
            1
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            ownerKey,
            budget.bindingDigestFor(address(budget), block.chainid, raised)
        );
        budget.bind(raised, abi.encodePacked(r, s, v));
        (, uint128 cap, uint128 daily,,,,) = budget.limits(keccak256("space-1"));
        assertEq(uint256(cap), 5000e6);
        assertEq(uint256(daily), 20000e6);
    }

    function testAnotherOwnerCannotRebind() public {
        _bind();
        SpaceBudget.Binding memory stolen = _binding(
            stranger,
            CAP,
            DAILY,
            _recipients(),
            block.timestamp + 1 days,
            1
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            uint256(uint160(stranger)),
            budget.bindingDigestFor(address(budget), block.chainid, stolen)
        );
        vm.expectRevert(
            abi.encodeWithSelector(SpaceBudget.NotOwner.selector, keccak256("space-1"), stranger)
        );
        budget.bind(stolen, abi.encodePacked(r, s, v));
    }

    // ---- enforcement ---------------------------------------------------

    function testAPaymentInsideEveryLimitPasses() public {
        _bind();
        budget.enforce(keccak256("space-1"), vendor, 350e6);
        assertEq(budget.spentToday(keccak256("space-1")), 350e6);
        assertEq(budget.remainingToday(keccak256("space-1")), DAILY - 350e6);
    }

    function testAnOverCapPaymentReverts() public {
        _bind();
        vm.expectRevert(
            abi.encodeWithSelector(SpaceBudget.OverCap.selector, keccak256("space-1"), 900e6, CAP)
        );
        budget.enforce(keccak256("space-1"), vendor, 900e6);
    }

    function testAnUnlistedRecipientReverts() public {
        _bind();
        vm.expectRevert(
            abi.encodeWithSelector(SpaceBudget.RecipientNotApproved.selector, keccak256("space-1"), stranger)
        );
        budget.enforce(keccak256("space-1"), stranger, 10e6);
    }

    function testAnUnboundSpaceCannotBePaidAtAll() public {
        vm.expectRevert(abi.encodeWithSelector(SpaceBudget.NotBound.selector, keccak256("space-unbound")));
        budget.enforce(keccak256("space-unbound"), vendor, 1e6);
    }

    function testTheDailyBudgetHoldsAcrossPaymentsInsideTheCap() public {
        _bind();
        // four payments of 500 each is 2000, exactly the daily budget
        budget.enforce(keccak256("space-1"), vendor, 500e6);
        budget.enforce(keccak256("space-1"), vendor, 500e6);
        budget.enforce(keccak256("space-1"), vendor, 500e6);
        budget.enforce(keccak256("space-1"), vendor, 500e6);
        assertEq(budget.remainingToday(keccak256("space-1")), 0);
        // a fifth reverts, which a per-transaction cap alone would have allowed
        vm.expectRevert(
            abi.encodeWithSelector(
                SpaceBudget.OverDailyBudget.selector,
                keccak256("space-1"),
                2500e6,
                2000e6
            )
        );
        budget.enforce(keccak256("space-1"), vendor, 500e6);
    }

    function testARemovedRecipientStopsBeingPayable() public {
        _bind();
        SpaceBudget.Binding memory narrowed = _binding(
            owner,
            CAP,
            DAILY,
            _singleton(vendor),
            block.timestamp + 1 days,
            1
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            ownerKey,
            budget.bindingDigestFor(address(budget), block.chainid, narrowed)
        );
        budget.bind(narrowed, abi.encodePacked(r, s, v));
        assertEq(budget.permits(keccak256("space-1"), other, 1e6), false);
        vm.expectRevert(
            abi.encodeWithSelector(SpaceBudget.RecipientNotApproved.selector, keccak256("space-1"), other)
        );
        budget.enforce(keccak256("space-1"), other, 1e6);
    }

    function testTheDailyBudgetResetsOnANewDay() public {
        _bind();
        // exhaust the day in payments that each sit under the per-transaction cap
        budget.enforce(keccak256("space-1"), vendor, CAP);
        budget.enforce(keccak256("space-1"), vendor, CAP);
        budget.enforce(keccak256("space-1"), vendor, CAP);
        budget.enforce(keccak256("space-1"), vendor, CAP);
        assertEq(budget.remainingToday(keccak256("space-1")), 0);
        vm.warp(block.timestamp + 1 days);
        assertEq(budget.remainingToday(keccak256("space-1")), DAILY);
        budget.enforce(keccak256("space-1"), vendor, CAP);
    }

    function testPermitsAnswersWithoutReverting() public {
        // an unbound Space must answer false, not revert, so a caller can ask
        // before attempting anything
        assertEq(budget.permits(keccak256("space-nothing"), vendor, 1e6), false);
        _bind();
        assertEq(budget.permits(keccak256("space-1"), vendor, 350e6), true);
        assertEq(budget.permits(keccak256("space-1"), vendor, 900e6), false);
        assertEq(budget.permits(keccak256("space-1"), stranger, 1e6), false);
    }

    function _singleton(address who) internal pure returns (address[] memory list) {
        list = new address[](1);
        list[0] = who;
    }
}
