// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

contract ClaimEscrow {
    address public immutable owner;
    bool public immutable storeReceiptAnchors;

    struct Escrow {
        address token;
        uint256 amount;
        address depositor;
        string lookupKey;
        bool claimed;
    }

    struct ReceiptAnchor {
        bytes32 receiptHash;
        bytes32 txHash;
        uint64 blockSettled;
        uint8 receiptType;
        uint8 finality;
    }

    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => ReceiptAnchor) public receipts;

    event EscrowCreated(
        bytes32 indexed paymentIdHash,
        address indexed token,
        address indexed depositor,
        uint256 amount,
        string lookupKey
    );
    event EscrowClaimed(
        bytes32 indexed paymentIdHash,
        address indexed recipient,
        uint256 amount
    );
    event ReceiptRecorded(
        bytes32 indexed paymentIdHash,
        bytes32 indexed receiptHash,
        bytes32 indexed txHash,
        address from,
        address to,
        address asset,
        uint256 amount,
        uint64 blockSettled,
        uint8 receiptType,
        uint8 finality
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address owner_, bool storeReceiptAnchors_) {
        require(owner_ != address(0), "owner required");
        owner = owner_;
        storeReceiptAnchors = storeReceiptAnchors_;
    }

    function createEscrow(
        bytes32 paymentIdHash,
        address token,
        uint256 amount,
        string calldata lookupKey
    ) external {
        require(paymentIdHash != bytes32(0), "payment required");
        require(token != address(0), "token required");
        require(amount > 0, "amount required");
        require(escrows[paymentIdHash].amount == 0, "escrow exists");

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(ok, "transfer failed");

        escrows[paymentIdHash] = Escrow({
            token: token,
            amount: amount,
            depositor: msg.sender,
            lookupKey: lookupKey,
            claimed: false
        });

        emit EscrowCreated(paymentIdHash, token, msg.sender, amount, lookupKey);
    }

    function claim(bytes32 paymentIdHash, address recipient) external onlyOwner {
        Escrow storage escrow = escrows[paymentIdHash];

        require(escrow.amount > 0, "escrow missing");
        require(!escrow.claimed, "already claimed");
        require(recipient != address(0), "recipient required");

        escrow.claimed = true;

        bool ok = IERC20(escrow.token).transfer(recipient, escrow.amount);
        require(ok, "transfer failed");

        emit EscrowClaimed(paymentIdHash, recipient, escrow.amount);
    }

    function anchorReceipt(
        bytes32 paymentIdHash,
        bytes32 receiptHash,
        bytes32 txHash,
        address from,
        address to,
        address asset,
        uint256 amount,
        uint64 blockSettled,
        uint8 receiptType,
        uint8 finality
    ) external onlyOwner {
        require(paymentIdHash != bytes32(0), "payment required");
        require(receiptHash != bytes32(0), "receipt required");
        require(txHash != bytes32(0), "tx required");
        require(from != address(0), "from required");
        require(to != address(0), "to required");
        require(asset != address(0), "asset required");
        require(amount > 0, "amount required");
        require(blockSettled > 0, "block required");

        if (storeReceiptAnchors) {
            receipts[paymentIdHash] = ReceiptAnchor({
                receiptHash: receiptHash,
                txHash: txHash,
                blockSettled: blockSettled,
                receiptType: receiptType,
                finality: finality
            });
        }

        emit ReceiptRecorded(
            paymentIdHash,
            receiptHash,
            txHash,
            from,
            to,
            asset,
            amount,
            blockSettled,
            receiptType,
            finality
        );
    }
}
