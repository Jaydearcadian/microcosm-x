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

    // ---- the digest has to be one a wallet can actually sign
    //
    // A regression test for a defect that made owner-signed limits impossible.
    // The recipient array was hashed with abi.encode, which is the ABI encoding
    // of a dynamic array: an offset, a length, then 32-byte padded elements.
    // EIP-712 specifies 20-byte packed elements, which is what every wallet's
    // signTypedData produces. The two digests never agreed, so a Space owner
    // could not sign its own limits however hard the product tried — every
    // attempt came back as BadSignature, blaming the signer.
    //
    // The expected digest is recomputed here the EIP-712 way, independently of
    // the contract's own code, so this cannot pass by both being wrong together.

    /// EIP-712 encode of a dynamic address[]: keccak of the concatenated
    /// encodeData of its contents, and encodeData of an address is 32 bytes.
    ///
    /// This is deliberately not the 20-byte packed form. That looks like the
    /// natural encoding of a list of addresses and is what the first attempt at
    /// fixing this used; it is not what EIP-712 specifies, so it still did not
    /// match a wallet. The digest has to be checked against a real wallet's,
    /// not against intuition.
    function _eip712RecipientsHash(address[] memory recipients) internal pure returns (bytes32) {
        uint256 n = recipients.length;
        bytes memory encoded = new bytes(n * 32 + 32);
        for (uint256 i = 0; i < n; i++) {
            address who = recipients[i];
            assembly {
                mstore(add(encoded, add(32, mul(i, 32))), who)
            }
        }
        bytes32 out;
        assembly {
            out := keccak256(add(encoded, 32), mul(n, 32))
        }
        return out;
    }

    function _domainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                    keccak256(bytes("MicrocosmSpaceBudget")),
                    keccak256(bytes("1")),
                    block.chainid,
                    address(budget)
                )
            );
    }

    function _structHash(SpaceBudget.Binding memory b, bytes32 recipientsHash) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    keccak256(
                        "Binding(bytes32 spaceId,address owner,uint256 maxPerTransaction,uint256 dailyBudget,address[] recipients,uint256 deadline,uint256 nonce)"
                    ),
                    b.spaceId,
                    b.owner,
                    b.maxPerTransaction,
                    b.dailyBudget,
                    recipientsHash,
                    b.deadline,
                    b.nonce
                )
            );
    }

    function _eip712Digest(SpaceBudget.Binding memory b) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), _structHash(b, _eip712RecipientsHash(b.recipients))));
    }

    function testTheDigestIsTheOneAWalletWouldCompute() public {
        SpaceBudget.Binding memory b = _binding(owner, CAP, DAILY, _recipients(), block.timestamp + 1 days, NONCE);
        require(
            budget.bindingDigest(b) == _eip712Digest(b),
            "digest is not EIP-712 conformant, so no wallet can sign these limits"
        );
    }

    function testTheDigestStillWorksForASingleRecipient() public {
        SpaceBudget.Binding memory b = _binding(owner, CAP, DAILY, _singleton(address(0xC0FFEE)), block.timestamp + 1 days, NONCE);
        require(budget.bindingDigest(b) == _eip712Digest(b), "single-recipient digests must be conformant too");
    }

    /// A negative control. If the old encoding ever agrees again then the tests
    /// above are not actually discriminating between the two.
    function testTheAbiEncodeEncodingIsNotWhatTheContractProduces() public {
        SpaceBudget.Binding memory b = _binding(owner, CAP, DAILY, _recipients(), block.timestamp + 1 days, NONCE);
        bytes32 wrong = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), _structHash(b, keccak256(abi.encode(b.recipients)))));
        require(wrong != budget.bindingDigest(b), "the abi.encode encoding is being produced again");
    }

    /// A second negative control, for the 20-byte packed form. It looks right and
    /// is wrong, which is why it is pinned here as well.
    function testThePackedTwentyByteEncodingIsNotWhatTheContractProduces() public {
        SpaceBudget.Binding memory b = _binding(owner, CAP, DAILY, _recipients(), block.timestamp + 1 days, NONCE);
        uint256 n = b.recipients.length;
        bytes memory packed = new bytes(n * 20 + 32);
        for (uint256 i = 0; i < n; i++) {
            address who = b.recipients[i];
            assembly {
                mstore(add(packed, add(32, mul(i, 20))), shl(96, who))
            }
        }
        bytes32 packedHash;
        assembly {
            packedHash := keccak256(add(packed, 32), mul(n, 20))
        }
        bytes32 wrong = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), _structHash(b, packedHash)));
        require(wrong != budget.bindingDigest(b), "the packed 20-byte encoding is being produced again");
    }

    function testABindingSignedOverTheEip712DigestIsAccepted() public {
        SpaceBudget.Binding memory b = _binding(owner, CAP, DAILY, _recipients(), block.timestamp + 1 days, NONCE);
        // _sign recovers over bindingDigest, which is the same digest a wallet
        // signs, so this is the path a real owner's signature now takes.
        budget.bind(b, _sign(b));
        (, , , uint64 boundAt, , , ) = budget.limits(b.spaceId);
        require(boundAt != 0, "not bound");
    }
}
