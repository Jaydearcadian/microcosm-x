// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Per-Space spending limits, bound by wallet signature, enforced on settlement.
 *
 * The policy engine already refuses an over-cap payment. That is a decision made
 * by our own server, which means it holds only as long as nobody routes around
 * it. This contract is the version that does not depend on our cooperation: a
 * Space's cap, daily budget and recipient allowlist are committed to by the
 * owner's signature, and a settlement that breaks them reverts.
 *
 * The signature is over the limits themselves, so a Space cannot be quietly
 * loosened. Tightening needs no special case because it needs the same
 * signature; loosening cannot happen without one.
 *
 * A Space that has never been bound is denied. The default here is deliberately
 * the opposite of the old allowlist behaviour, where an empty list meant "no
 * restriction" and a fresh Space could pay anyone.
 */
contract SpaceBudget {
    struct Limits {
        address owner;
        uint128 maxPerTransaction;
        uint128 dailyBudget;
        uint64 boundAt;
        uint64 updatedAt;
        uint256 nonce;
        bool bound;
    }

    struct Binding {
        bytes32 spaceId;
        address owner;
        uint256 maxPerTransaction;
        uint256 dailyBudget;
        address[] recipients;
        uint256 deadline;
        uint256 nonce;
    }

    /// Spend recorded per space per day, so the daily budget is a real budget
    /// rather than a per-payment cap applied repeatedly.
    mapping(bytes32 => mapping(uint256 => uint256)) public spentByDay;

    mapping(bytes32 => Limits) public limits;
    mapping(bytes32 => mapping(address => bool)) public approvedRecipient;
    mapping(bytes32 => address[]) private _recipients;

    event BudgetBound(
        bytes32 indexed spaceId,
        address indexed owner,
        uint256 maxPerTransaction,
        uint256 dailyBudget,
        uint256 recipientCount,
        uint256 nonce
    );
    event SettlementAllowed(
        bytes32 indexed spaceId,
        address indexed recipient,
        uint256 amount,
        uint256 day,
        uint256 spentBefore
    );

    error NotBound(bytes32 spaceId);
    error NotOwner(bytes32 spaceId, address caller);
    error OverCap(bytes32 spaceId, uint256 amount, uint256 cap);
    error OverDailyBudget(bytes32 spaceId, uint256 requested, uint256 remaining);
    error RecipientNotApproved(bytes32 spaceId, address recipient);
    error BadSignature();
    error Expired(uint256 deadline);
    error ZeroSpace();
    error ZeroAmount();
    error BadCap(uint256 maxPerTransaction, uint256 dailyBudget);
    error BadRecipient(address recipient);
    error ZeroOwner();

    function recipients(bytes32 spaceId) external view returns (address[] memory) {
        return _recipients[spaceId];
    }

    /// Whether a payment would be allowed, without reverting. The router and the
    /// UI can both ask before attempting a settlement.
    function permits(bytes32 spaceId, address recipient, uint256 amount) external view returns (bool) {
        Limits storage limit = limits[spaceId];
        if (!limit.bound) return false;
        if (amount > limit.maxPerTransaction) return false;
        if (!approvedRecipient[spaceId][recipient]) return false;
        uint256 day = _day();
        return spentByDay[spaceId][day] + amount <= limit.dailyBudget;
    }

    function _day() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("MicrocosmSpaceBudget")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function bindingDigest(Binding calldata binding) public view returns (bytes32) {
        return bindingDigestFor(address(this), block.chainid, binding);
    }

    /// Pure reference encoder so offchain callers can cross-check the digest
    /// against a fixed (contract, chain) pair, as SettlementRouter does.
    function bindingDigestFor(
        address verifyingContract,
        uint256 chainId,
        Binding calldata binding
    ) public pure returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("MicrocosmSpaceBudget")),
                keccak256(bytes("1")),
                chainId,
                verifyingContract
            )
        );
        // the dynamic recipient list is hashed rather than concatenated, so the
        // struct hash stays a fixed size and the encoding cannot be ambiguous
        bytes32 recipientsHash = keccak256(abi.encode(binding.recipients));
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Binding(bytes32 spaceId,address owner,uint256 maxPerTransaction,uint256 dailyBudget,address[] recipients,uint256 deadline,uint256 nonce)"
                ),
                binding.spaceId,
                binding.owner,
                binding.maxPerTransaction,
                binding.dailyBudget,
                recipientsHash,
                binding.deadline,
                binding.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// Commits a Space's limits. The first bind sets the owner; after that only
    /// the owner may re-bind, and any change needs a fresh signature.
    function bind(Binding calldata binding, bytes calldata signature) external {
        if (binding.spaceId == bytes32(0)) revert ZeroSpace();
        if (binding.owner == address(0)) revert ZeroOwner();
        if (binding.maxPerTransaction == 0 || binding.dailyBudget == 0) {
            revert BadCap(binding.maxPerTransaction, binding.dailyBudget);
        }
        if (binding.dailyBudget < binding.maxPerTransaction) {
            revert BadCap(binding.maxPerTransaction, binding.dailyBudget);
        }
        if (binding.recipients.length == 0) revert BadRecipient(address(0));
        if (block.timestamp > binding.deadline) revert Expired(binding.deadline);

        Limits storage limit = limits[binding.spaceId];
        if (limit.bound && limit.owner != binding.owner) revert NotOwner(binding.spaceId, binding.owner);
        if (limit.nonce != binding.nonce) revert BadSignature();

        bytes32 digest = bindingDigestFor(address(this), block.chainid, binding);
        if (_recover(digest, signature) != binding.owner) revert BadSignature();

        for (uint256 i = 0; i < binding.recipients.length; i += 1) {
            address recipient = binding.recipients[i];
            if (recipient == address(0)) revert BadRecipient(recipient);
            approvedRecipient[binding.spaceId][recipient] = true;
        }
        // a re-bind replaces the list rather than accumulating it, so a recipient
        // cannot be removed by anyone and then silently re-added by a stale bind
        address[] storage previous = _recipients[binding.spaceId];
        for (uint256 i = 0; i < previous.length; i += 1) {
            approvedRecipient[binding.spaceId][previous[i]] = false;
        }
        delete _recipients[binding.spaceId];
        for (uint256 i = 0; i < binding.recipients.length; i += 1) {
            _recipients[binding.spaceId].push(binding.recipients[i]);
        }

        limit.owner = binding.owner;
        limit.maxPerTransaction = uint128(binding.maxPerTransaction);
        limit.dailyBudget = uint128(binding.dailyBudget);
        limit.nonce = binding.nonce + 1;
        limit.bound = true;
        if (limit.boundAt == 0) limit.boundAt = uint64(block.timestamp);
        limit.updatedAt = uint64(block.timestamp);

        emit BudgetBound(
            binding.spaceId,
            binding.owner,
            binding.maxPerTransaction,
            binding.dailyBudget,
            binding.recipients.length,
            binding.nonce
        );
    }

    /// Reverts unless the payment is inside every limit. Call this before
    /// moving funds; there is no way to satisfy it by ordering events cleverly.
    function enforce(bytes32 spaceId, address recipient, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Limits storage limit = limits[spaceId];
        // fail closed: a Space nobody has bound cannot be paid from
        if (!limit.bound) revert NotBound(spaceId);
        if (!approvedRecipient[spaceId][recipient]) revert RecipientNotApproved(spaceId, recipient);
        if (amount > limit.maxPerTransaction) revert OverCap(spaceId, amount, limit.maxPerTransaction);

        uint256 day = _day();
        uint256 already = spentByDay[spaceId][day];
        if (already + amount > limit.dailyBudget) {
            revert OverDailyBudget(spaceId, already + amount, limit.dailyBudget);
        }

        spentByDay[spaceId][day] = already + amount;
        emit SettlementAllowed(spaceId, recipient, amount, day, already);
    }

    /// A view of the day's headroom, for the UI to show before anyone tries.
    function remainingToday(bytes32 spaceId) external view returns (uint256) {
        Limits storage limit = limits[spaceId];
        if (!limit.bound) return 0;
        uint256 already = spentByDay[spaceId][_day()];
        if (already >= limit.dailyBudget) return 0;
        return limit.dailyBudget - already;
    }

    function spentToday(bytes32 spaceId) external view returns (uint256) {
        return spentByDay[spaceId][_day()];
    }

    /// Public so tooling and tests can check what the contract would recover
    /// from a given signature, rather than having to trust it.
    function recoverSigner(bytes32 digest, bytes calldata signature) external pure returns (address) {
        return _recover(digest, signature);
    }

    /// Takes `bytes memory`, not calldata. Reading a calldata array through
    /// `.offset` inside an internal function is not safe, because the internal
    /// call may re-point the slice; SettlementRouter copies to memory first for
    /// the same reason, and a calldata read here recovered the wrong signer.
    function _recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        if (signature.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly {
                r := mload(add(signature, 0x20))
                s := mload(add(signature, 0x40))
                v := byte(0, mload(add(signature, 0x60)))
            }
            if (v < 27) v += 27;
            if (v != 27 && v != 28) revert BadSignature();
            address signer = ecrecover(digest, v, r, s);
            if (signer == address(0)) revert BadSignature();
            return signer;
        }
        if (signature.length == 64) {
            // EIP-2098 compact signatures, which is what most wallets return
            bytes32 r;
            bytes32 vs;
            assembly {
                r := mload(add(signature, 0x20))
                vs := mload(add(signature, 0x40))
            }
            address signer = ecrecover(digest, 27, r, bytes32(vs));
            if (signer == address(0)) revert BadSignature();
            return signer;
        }
        revert BadSignature();
    }}
