// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAdjudicator} from "../IAdjudicator.sol";

interface ICommerceVerdict {
    function resolveAdjudication(uint256 jobId, bool approve, bytes32 reason) external;
}

/**
 * Test double for an Internet Court resolver. Records the exact case tuple
 * it receives and posts verdicts back on demand, simulating asynchronous
 * GenLayer-style adjudication without external dependencies.
 */
contract MockAdjudicator is IAdjudicator {
    struct Case {
        uint256 jobId;
        bytes32 deliverableHash;
        string evidenceUri;
        bytes32 rubricHash;
        bool resolved;
    }

    address public immutable commerce;
    uint256 private _nextCaseSeq = 1;
    mapping(bytes32 => Case) public cases;

    event CaseOpened(bytes32 indexed caseId, uint256 indexed jobId);
    event VerdictPosted(bytes32 indexed caseId, uint256 indexed jobId, bool approve);

    constructor(address commerce_) {
        require(commerce_ != address(0), "commerce required");
        commerce = commerce_;
    }

    function requestAdjudication(
        uint256 jobId,
        bytes32 deliverableHash,
        string calldata evidenceUri,
        bytes32 rubricHash
    ) external override returns (bytes32 caseId) {
        require(msg.sender == commerce, "only commerce");
        caseId = keccak256(abi.encode(jobId, deliverableHash, _nextCaseSeq));
        _nextCaseSeq = _nextCaseSeq + 1;
        cases[caseId] = Case({
            jobId: jobId,
            deliverableHash: deliverableHash,
            evidenceUri: evidenceUri,
            rubricHash: rubricHash,
            resolved: false
        });
        emit CaseOpened(caseId, jobId);
    }

    function postVerdict(bytes32 caseId, bool approve, bytes32 reason) external {
        Case storage c = cases[caseId];
        require(c.deliverableHash != bytes32(0), "case missing");
        require(!c.resolved, "case resolved");
        c.resolved = true;
        ICommerceVerdict(commerce).resolveAdjudication(c.jobId, approve, reason);
        emit VerdictPosted(caseId, c.jobId, approve);
    }
}
