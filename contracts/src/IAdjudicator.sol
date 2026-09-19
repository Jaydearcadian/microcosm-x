// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * Internet Court / GenLayer-compatible adjudication interface.
 *
 * A resolver implementing this interface acts as the job's evaluator of
 * last resort: AgenticCommerce refers (jobId, deliverableHash, evidenceUri,
 * rubricHash) and the resolver posts its verdict back via
 * `AgenticCommerce.resolveAdjudication`, which only the bound adjudicator
 * contract may call.
 */
interface IAdjudicator {
    function requestAdjudication(
        uint256 jobId,
        bytes32 deliverableHash,
        string calldata evidenceUri,
        bytes32 rubricHash
    ) external returns (bytes32 caseId);
}
