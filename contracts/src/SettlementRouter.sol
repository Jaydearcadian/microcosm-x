// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

contract SettlementRouter {
    address public immutable owner;
    bool public immutable storeReceiptAnchors;

    struct ReceiptAnchor {
        bytes32 receiptHash;
        bytes32 txHash;
        uint64 blockSettled;
        uint8 receiptType;
        uint8 finality;
    }

    mapping(bytes32 => ReceiptAnchor) public receipts;

    event DirectSettlementRecorded(
        bytes32 indexed paymentIdHash,
        address indexed token,
        address indexed payer,
        address recipient,
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

    // ------------------------------------------------------------------
    // EIP-712 attestation layer (Sprint 1 — production hardening)
    //
    // The router releases funds only for intents carrying a valid
    // EIP-712 signature from a registered Space Controller. Domain:
    //   name: "Microcosm", version: "1",
    //   chainId: block.chainid (1952 testnet / 196 mainnet),
    //   verifyingContract: address(this).
    // ------------------------------------------------------------------

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PAYMENT_AUTH_TYPEHASH =
        keccak256("PaymentAuthorization(bytes32 spaceId,address recipient,uint256 amount,uint256 nonce,uint256 deadline,bytes32 deliverableHash)");
    bytes32 private constant ATTESTATION_NAME_HASH = keccak256(bytes("Microcosm"));
    bytes32 private constant ATTESTATION_VERSION_HASH = keccak256(bytes("1"));

    struct PaymentAuthorization {
        bytes32 spaceId;
        address recipient;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
        bytes32 deliverableHash;
    }

    /// Space Controllers whose attested intents the router honors.
    mapping(address => bool) public controllers;
    /// Settlement asset registered per Space (binds token without signing it).
    mapping(bytes32 => address) public spaceTokens;
    /// Consumed nonces per Space (replay protection).
    mapping(bytes32 => mapping(uint256 => bool)) public usedNonces;

    event ControllerUpdated(address indexed controller, bool authorized);
    event SpaceTokenRegistered(bytes32 indexed spaceId, address indexed token);
    event AttestedSettlement(
        bytes32 indexed spaceId,
        address indexed recipient,
        uint256 amount,
        bytes32 deliverableHash,
        uint256 nonce
    );

    constructor(address owner_, bool storeReceiptAnchors_) {
        require(owner_ != address(0), "owner required");
        owner = owner_;
        storeReceiptAnchors = storeReceiptAnchors_;
    }

    function setController(address controller, bool authorized) external onlyOwner {
        require(controller != address(0), "controller required");
        controllers[controller] = authorized;
        emit ControllerUpdated(controller, authorized);
    }

    function registerSpaceToken(bytes32 spaceId, address token) external onlyOwner {
        require(spaceId != bytes32(0), "space required");
        require(token != address(0), "token required");
        spaceTokens[spaceId] = token;
        emit SpaceTokenRegistered(spaceId, token);
    }

    function domainSeparator() public view returns (bytes32) {
        return _domainSeparator(address(this), block.chainid);
    }

    /// EIP-712 digest for an authorization against this router on this chain.
    function attestationDigest(PaymentAuthorization calldata auth) public view returns (bytes32) {
        return attestationDigestFor(address(this), block.chainid, auth);
    }

    /// Pure reference encoder so offchain SDKs can cross-check digests
    /// against fixed (contract, chain) pairs in tests and tooling.
    function attestationDigestFor(
        address verifyingContract,
        uint256 chainId,
        PaymentAuthorization calldata auth
    ) public pure returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                PAYMENT_AUTH_TYPEHASH,
                auth.spaceId,
                auth.recipient,
                auth.amount,
                auth.nonce,
                auth.deadline,
                auth.deliverableHash
            )
        );
        return keccak256(
            abi.encodePacked("\x19\x01", _domainSeparator(verifyingContract, chainId), structHash)
        );
    }

    /**
     * Settle a Space disbursement authorized by a Controller's EIP-712
     * signature. Pulls `auth.amount` of the Space's registered token from
     * the signer (the Controller pre-approves this router) to the recipient.
     */
    function settleWithAttestation(
        PaymentAuthorization calldata auth,
        bytes calldata signature
    ) external returns (bytes32 settlementId) {
        require(auth.recipient != address(0), "recipient required");
        require(auth.amount > 0, "amount required");
        require(block.timestamp <= auth.deadline, "attestation expired");
        require(!usedNonces[auth.spaceId][auth.nonce], "nonce already used");

        address token = spaceTokens[auth.spaceId];
        require(token != address(0), "space token not registered");

        address signer = _recover(attestationDigest(auth), signature);
        require(controllers[signer], "unauthorized attestation signer");

        usedNonces[auth.spaceId][auth.nonce] = true;

        bool ok = IERC20(token).transferFrom(signer, auth.recipient, auth.amount);
        require(ok, "transfer failed");

        settlementId = keccak256(abi.encode(auth.spaceId, auth.recipient, auth.amount, auth.nonce));
        emit AttestedSettlement(auth.spaceId, auth.recipient, auth.amount, auth.deliverableHash, auth.nonce);
    }

    function _domainSeparator(address verifyingContract, uint256 chainId) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, ATTESTATION_NAME_HASH, ATTESTATION_VERSION_HASH, chainId, verifyingContract)
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "bad signature length");
        bytes memory sig = signature;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }
        if (v < 27) {
            v += 27;
        }
        require(v == 27 || v == 28, "bad signature v");
        // No low-s malleability guard: a malleated signature recovers the
        // SAME signer, so it grants no extra authority. Replay safety comes
        // from consumed nonces + deadlines, and settlement IDs derive from
        // authorization fields, never from signature bytes.
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), "bad signature");
        return signer;
    }
    function settleDirect(
        bytes32 paymentIdHash,
        address token,
        address recipient,
        uint256 amount
    ) external returns (bytes32 settlementId) {
        require(paymentIdHash != bytes32(0), "payment required");
        require(token != address(0), "token required");
        require(recipient != address(0), "recipient required");
        require(amount > 0, "amount required");

        bool ok = IERC20(token).transferFrom(msg.sender, recipient, amount);
        require(ok, "transfer failed");

        settlementId = keccak256(
            abi.encode(paymentIdHash, token, msg.sender, recipient, amount)
        );

        emit DirectSettlementRecorded(
            paymentIdHash,
            token,
            msg.sender,
            recipient,
            amount
        );
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
