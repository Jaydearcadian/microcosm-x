// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";
import {ClaimEscrow} from "../src/ClaimEscrow.sol";
import {MockERC20} from "../src/test/MockERC20.sol";
import {SpaceBudget} from "../src/SpaceBudget.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

contract Assertions {
    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "uint mismatch");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "address mismatch");
    }

    function assertEq(string memory left, string memory right) internal pure {
        require(
            keccak256(bytes(left)) == keccak256(bytes(right)),
            "string mismatch"
        );
    }

    function assertTrue(bool value) internal pure {
        require(value, "assert true failed");
    }
}

contract SettlementFlowsTest is Assertions {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SettlementRouter internal router;
    ClaimEscrow internal escrow;
    MockERC20 internal token;

    SpaceBudget internal budget;
    uint256 internal ownerKey = 0xA11CE5EED;
    address internal spaceOwner;

    address internal payer = address(0xA11CE);
    address internal recipient = address(0xB0B);
    bytes32 internal spaceId = keccak256("space_1");

    function setUp() public {
        router = new SettlementRouter(address(this), true);
        escrow = new ClaimEscrow(address(this), true);
        token = new MockERC20();
        budget = new SpaceBudget();
        spaceOwner = vm.addr(ownerKey);
        router.setBudgetContract(address(budget));
        _bindSpace();

        token.mint(payer, 1_000_000_000);

        vm.startPrank(payer);
        token.approve(address(router), type(uint256).max);
        token.approve(address(escrow), type(uint256).max);
        vm.stopPrank();
    }

    /// Signs this Space's limits so the router will let a payment through.
    function _bindSpace() internal {
        address[] memory allow = new address[](1);
        allow[0] = recipient;
        SpaceBudget.Binding memory b = SpaceBudget.Binding({
            spaceId: spaceId,
            owner: spaceOwner,
            maxPerTransaction: 1_000_000_000,
            dailyBudget: 1_000_000_000,
            recipients: allow,
            deadline: block.timestamp + 3650 days,
            nonce: 0
        });
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(ownerKey, budget.bindingDigestFor(address(budget), block.chainid, b));
        budget.bind(b, abi.encodePacked(r, s, v));
    }

    function testSettleDirectTransfersFundsToRecipient() public {
        bytes32 paymentIdHash = keccak256("pay_1");

        vm.prank(payer);
        router.settleDirect(spaceId, paymentIdHash, address(token), recipient, 25_000_000);

        assertEq(token.balanceOf(recipient), 25_000_000);
        assertEq(token.balanceOf(payer), 975_000_000);
    }

    function testCreateAndClaimEscrowTransfersFundsFromEscrow() public {
        bytes32 paymentIdHash = keccak256("pay_2");

        vm.prank(payer);
        escrow.createEscrow(paymentIdHash, address(token), 40_000_000, "alice@gmail.com");

        assertEq(token.balanceOf(address(escrow)), 40_000_000);

        escrow.claim(paymentIdHash, recipient);

        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(recipient), 40_000_000);

        (address escrowToken, uint256 amount,, string memory lookupKey, bool claimed) =
            escrow.escrows(paymentIdHash);
        assertEq(escrowToken, address(token));
        assertEq(amount, 40_000_000);
        assertEq(lookupKey, "alice@gmail.com");
        assertTrue(claimed);
    }

    function testRouterCanStoreReceiptAnchorWhenEnabled() public {
        bytes32 paymentIdHash = keccak256("pay_receipt_router");
        router.anchorReceipt(
            paymentIdHash,
            keccak256("receipt"),
            keccak256("tx"),
            payer,
            recipient,
            address(token),
            25_000_000,
            12345,
            1,
            1
        );

        (bytes32 receiptHash, bytes32 txHash, uint64 blockSettled, uint8 receiptType, uint8 finality) =
            router.receipts(paymentIdHash);
        assertEq(uint256(receiptHash), uint256(keccak256("receipt")));
        assertEq(uint256(txHash), uint256(keccak256("tx")));
        assertEq(uint256(blockSettled), 12345);
        assertEq(uint256(receiptType), 1);
        assertEq(uint256(finality), 1);
    }

    function testEscrowCanSkipReceiptStorageWhenDisabled() public {
        ClaimEscrow eventOnlyEscrow = new ClaimEscrow(address(this), false);
        bytes32 paymentIdHash = keccak256("pay_receipt_escrow");
        eventOnlyEscrow.anchorReceipt(
            paymentIdHash,
            keccak256("receipt2"),
            keccak256("tx2"),
            payer,
            recipient,
            address(token),
            40_000_000,
            67890,
            2,
            1
        );

        (bytes32 receiptHash,, uint64 blockSettled,,) = eventOnlyEscrow.receipts(paymentIdHash);
        assertEq(uint256(receiptHash), 0);
        assertEq(uint256(blockSettled), 0);
    }
}
