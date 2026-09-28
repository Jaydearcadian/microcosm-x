// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

/// The per-Space limits contract. Every payment is offered to it before any
/// token moves, so a Space that never signed its limits cannot be paid from.
interface ISpaceBudget {
    function enforce(bytes32 spaceId, address recipient, uint256 amount) external;
    /// The address that signed this Space's limits. Read for withdrawal gating.
    function limits(bytes32 spaceId)
        external
        view
        returns (address owner, uint128 maxPerTransaction, uint128 dailyBudget, uint64 boundAt, uint64 updatedAt, uint256 nonce, bool bound);
}

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

    event BudgetContractSet(address indexed budget);
    event SpaceFunded(bytes32 indexed spaceId, address indexed from, uint256 amount, uint256 spaceBalance);
    event SpaceWithdrawn(bytes32 indexed spaceId, address indexed to, uint256 amount, uint256 spaceBalance);
    event ExcessSwept(address indexed token, address indexed to, uint256 amount, uint256 remaining);

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
    /// Per-Space limits contract. Zero means settlement is closed, not open.
    address public budgetContract;

    /// Funds held on behalf of each Space.
    ///
    /// Until settleDirect draws on this, the broadcaster's own balance is what
    /// actually funds a payment and this is a shadow of it. It exists so the two
    /// can be compared: the sum of these numbers is `totalAccounted`, and the
    /// router's token balance should equal that exactly. Anything above it was
    /// sent here by mistake and is sweepable.
    mapping(bytes32 => uint256) public spaceBalance;

    /// The sum of every Space balance. One number, so the invariant
    /// `token.balanceOf(router) == totalAccounted()` is a single eth_call anyone
    /// can check, rather than a claim our server makes about itself.
    uint256 public totalAccounted;

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

    /// Points the router at the limits contract. Only ever set to something
    /// real: clearing it stops settlement rather than lifting it.
    function setBudgetContract(address budget) external onlyOwner {
        require(budget != address(0), "budget required");
        budgetContract = budget;
        emit BudgetContractSet(budget);
    }

    /// Throws unless a limits contract is configured. Left out of the settle
    /// paths on purpose, so that forgetting to configure one closes the door
    /// instead of quietly reverting to unchecked payments.
    function _requireBudget() private view {
        require(budgetContract != address(0), "budget contract not configured");
    }

    function registerSpaceToken(bytes32 spaceId, address token) external onlyOwner {
        require(spaceId != bytes32(0), "space required");
        require(token != address(0), "token required");
        spaceTokens[spaceId] = token;
        emit SpaceTokenRegistered(spaceId, token);
    }

    /**
     * Put funds into a Space's own pool.
     *
     * The Space's owner does this. It makes the money belong to the Space rather
     * than to the broadcaster: a leaked broadcaster key can no longer reach it,
     * which is the whole point of holding it here at all.
     *
     * A Space whose limits were never signed is refused. Withdrawal is gated on
     * the Space's own signed owner, so an unbound Space has nobody who can ever
     * authorise a refund — and anything deposited here would be unreachable
     * forever, by its owner, by this contract's owner, by anyone. That is not
     * hypothetical: 15,830 USDC was stranded exactly this way, and the only
     * reason the loss was bounded at all is that one Space happened to have been
     * bound by hand. The check belongs here rather than only in the product,
     * because a direct call bypasses the product entirely.
     */
    function deposit(bytes32 spaceId, uint256 amount) external {
        require(spaceId != bytes32(0), "space required");
        require(amount > 0, "amount required");
        address token = spaceTokens[spaceId];
        require(token != address(0), "space token not registered");
        _requireSpaceBound(spaceId);

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(ok, "transfer failed");

        spaceBalance[spaceId] += amount;
        totalAccounted += amount;
        emit SpaceFunded(spaceId, msg.sender, amount, spaceBalance[spaceId]);
    }

    /// Reverts unless this Space's limits have been signed on chain.
    function _requireSpaceBound(bytes32 spaceId) private view {
        require(budgetContract != address(0), "budget not configured");
        (, , , , , , bool bound) = ISpaceBudget(budgetContract).limits(spaceId);
        require(bound, "space limits not bound; a Space with no signed owner could never withdraw");
    }

    /// Withdrawing a Space's own funds arrives with the switch that makes
    /// settlement draw on this pool, because until then there is nothing here
    /// to withdraw. It will be gated on the Space's signed owner rather than on
    /// this contract's owner: the owner of the router must not be able to take a
    /// Space's money, which is the property the whole arrangement exists to get.
    function withdraw(bytes32 spaceId, address token, address to, uint256 amount) external {
        require(spaceId != bytes32(0), "space required");
        require(amount > 0, "amount required");
        require(to != address(0), "recipient required");
        require(spaceTokens[spaceId] == token, "token mismatch");

        // The Space's own signed owner, not this contract's owner. The whole
        // reason funds are held here rather than in a shared wallet is that
        // whoever controls the broadcaster must not be able to reach them, so
        // gating on `owner` would reintroduce exactly that.
        (address spaceOwner,,,,,, bool bound) = ISpaceBudget(budgetContract).limits(spaceId);
        require(bound, "space not bound");
        require(msg.sender == spaceOwner, "not space owner");

        require(spaceBalance[spaceId] >= amount, "insufficient space balance");
        // totalAccounted has to come down with the Space's balance. If it did
        // not, the amount withdrawn would sit above the accounted total looking
        // like excess — and sweepExcess exists precisely to hand that out.
        spaceBalance[spaceId] -= amount;
        totalAccounted -= amount;

        require(IERC20(token).transfer(to, amount), "transfer failed");
        emit SpaceWithdrawn(spaceId, to, amount, spaceBalance[spaceId]);
    }

    /// Settle a payment out of the Space's own pool rather than the caller's
    /// wallet.
    ///
    /// This is deliberately a separate function from settleDirect rather than a
    /// change to it. settleDirect pulls from msg.sender, so it keeps working
    /// unchanged for any Space that has not funded a pool, and the switch is
    /// something a Space opts into rather than something that happens to everyone
    /// on upgrade.
    function settleFromPool(
        bytes32 spaceId,
        bytes32 paymentIdHash,
        address token,
        address recipient,
        uint256 amount
    ) external returns (bytes32 settlementId) {
        require(paymentIdHash != bytes32(0), "payment required");
        require(token != address(0), "token required");
        require(recipient != address(0), "recipient required");
        require(amount > 0, "amount required");
        require(spaceTokens[spaceId] == token, "token mismatch");

        _requireBudget();
        // The Space's signed limits still apply, unchanged. Holding money in a
        // pool is not permission to spend without a cap.
        ISpaceBudget(budgetContract).enforce(spaceId, recipient, amount);

        // A Space cannot spend what it never deposited, and the message has to
        // say which Space is short rather than failing as a bare transfer error.
        require(spaceBalance[spaceId] >= amount, "insufficient space balance");

        // Both figures move together. Leaving totalAccounted alone would make
        // the payout look like unclaimed excess to sweepExcess, which would hand
        // a Space's spent money to this contract's owner.
        spaceBalance[spaceId] -= amount;
        totalAccounted -= amount;

        require(IERC20(token).transfer(recipient, amount), "transfer failed");

        settlementId = keccak256(
            abi.encode(spaceId, paymentIdHash, token, address(this), recipient, amount)
        );

        emit DirectSettlementRecorded(paymentIdHash, token, address(this), recipient, amount);
    }

    /**
     * Sweep tokens the router holds that no Space has a claim to.
     *
     * Bounded by the difference between what the router holds and what it owes,
     * so this can never touch a Space's funds even if called by mistake. That
     * difference is also the standing evidence of whether the books balance: if
     * it is ever negative, something has been taken and the number says so.
     */
    function sweepExcess(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "recipient required");
        uint256 held = IERC20(token).balanceOf(address(this));
        require(held > totalAccounted, "no excess to sweep");
        uint256 excess = held - totalAccounted;
        require(amount <= excess, "amount exceeds excess");
        bool ok = IERC20(token).transfer(to, amount);
        require(ok, "transfer failed");
        emit ExcessSwept(token, to, amount, excess - amount);
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

        _requireBudget();
        ISpaceBudget(budgetContract).enforce(auth.spaceId, auth.recipient, auth.amount);

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
        bytes32 spaceId,
        bytes32 paymentIdHash,
        address token,
        address recipient,
        uint256 amount
    ) external returns (bytes32 settlementId) {
        require(paymentIdHash != bytes32(0), "payment required");
        require(token != address(0), "token required");
        require(recipient != address(0), "recipient required");
        require(amount > 0, "amount required");

        _requireBudget();
        ISpaceBudget(budgetContract).enforce(spaceId, recipient, amount);

        bool ok = IERC20(token).transferFrom(msg.sender, recipient, amount);
        require(ok, "transfer failed");

        settlementId = keccak256(
            abi.encode(spaceId, paymentIdHash, token, msg.sender, recipient, amount)
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
