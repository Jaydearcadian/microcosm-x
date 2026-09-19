// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EnvelopeRegistry {
    address public immutable owner;

    enum EnvelopeStatus {
        Unknown,
        Active,
        Inactive
    }

    struct EnvelopeAnchor {
        bytes32 envelopeIdHash;
        bytes32 policyHash;
        address controller;
        string uri;
        EnvelopeStatus status;
        uint256 version;
        uint256 updatedAt;
    }

    mapping(bytes32 => EnvelopeAnchor) public envelopes;

    event EnvelopeAnchored(
        bytes32 indexed envelopeIdHash,
        bytes32 indexed policyHash,
        address indexed controller,
        uint256 version,
        string uri
    );
    event EnvelopeDeactivated(
        bytes32 indexed envelopeIdHash,
        address indexed controller,
        uint256 version
    );

    error InvalidEnvelope();
    error InvalidPolicy();
    error InvalidController();
    error NotController();

    constructor(address owner_) {
        require(owner_ != address(0), "owner required");
        owner = owner_;
    }

    function anchorEnvelope(
        bytes32 envelopeIdHash,
        bytes32 policyHash,
        address controller,
        string calldata uri
    ) external {
        if (envelopeIdHash == bytes32(0)) revert InvalidEnvelope();
        if (policyHash == bytes32(0)) revert InvalidPolicy();
        if (controller == address(0)) revert InvalidController();
        EnvelopeAnchor storage current = envelopes[envelopeIdHash];
        if (current.controller == address(0)) {
            if (msg.sender != owner) revert NotController();
        } else {
            if (msg.sender != current.controller && msg.sender != owner) {
                revert NotController();
            }
        }

        uint256 version = current.version + 1;
        envelopes[envelopeIdHash] = EnvelopeAnchor({
            envelopeIdHash: envelopeIdHash,
            policyHash: policyHash,
            controller: controller,
            uri: uri,
            status: EnvelopeStatus.Active,
            version: version,
            updatedAt: block.timestamp
        });

        emit EnvelopeAnchored(envelopeIdHash, policyHash, controller, version, uri);
    }

    function deactivateEnvelope(bytes32 envelopeIdHash) external {
        EnvelopeAnchor storage current = envelopes[envelopeIdHash];
        if (current.envelopeIdHash == bytes32(0)) revert InvalidEnvelope();
        if (msg.sender != current.controller && msg.sender != owner) revert NotController();

        current.status = EnvelopeStatus.Inactive;
        current.version = current.version + 1;
        current.updatedAt = block.timestamp;

        emit EnvelopeDeactivated(envelopeIdHash, current.controller, current.version);
    }

    function getEnvelope(bytes32 envelopeIdHash) external view returns (EnvelopeAnchor memory) {
        return envelopes[envelopeIdHash];
    }
}
