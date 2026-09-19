// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {IAdjudicator} from "../src/IAdjudicator.sol";
import {MockERC20} from "../src/test/MockERC20.sol";
import {MockAdjudicator} from "../src/test/MockAdjudicator.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
}

contract Assertions {
    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "uint mismatch");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "address mismatch");
    }

    function assertEq(bytes32 left, bytes32 right) internal pure {
        require(left == right, "bytes32 mismatch");
    }

    function assertEq(string memory left, string memory right) internal pure {
        require(keccak256(bytes(left)) == keccak256(bytes(right)), "string mismatch");
    }

    function assertTrue(bool value) internal pure {
        require(value, "assert true failed");
    }
}

contract AdjudicationTest is Assertions {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    AgenticCommerce internal commerce;
    MockERC20 internal token;
    MockAdjudicator internal court;

    address internal client = address(0xC11);
    address internal provider = address(0xBD);
    address internal evaluator = address(0x3E5);
    address internal stranger = address(0xFF);

    bytes32 internal rubric = keccak256("rubric-v1: 100 gpu-hours, acceptance tests green");
    string internal evidence = "ipfs://QmGpuClusterEvidence9021";

    function setUp() public {
        token = new MockERC20();
        commerce = new AgenticCommerce(address(this), address(token));
        court = new MockAdjudicator(address(commerce));

        token.mint(client, 1_000_000_000);

        vm.startPrank(client);
        token.approve(address(commerce), type(uint256).max);
        vm.stopPrank();
    }

    function _courtBoundSubmittedJob(uint256 budget) internal returns (uint256 jobId) {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        jobId = commerce.createJob(provider, evaluator, expiry, "court-gated work");

        vm.prank(client);
        commerce.setAdjudicator(jobId, address(court));

        vm.prank(client);
        commerce.setRubric(jobId, rubric);

        vm.prank(client);
        commerce.setBudget(jobId, budget);

        vm.prank(client);
        commerce.fund(jobId, budget);

        vm.prank(provider);
        commerce.submit(jobId, keccak256("court-deliverable"));

        vm.prank(provider);
        commerce.attachEvidence(jobId, evidence);
    }

    function testCourtApprovalSettlesEscrowToProvider() public {
        uint256 jobId = _courtBoundSubmittedJob(200_000_000);

        // Either side may refer the deliverable to the Internet Court.
        vm.prank(client);
        bytes32 caseId = commerce.requestAdjudication(jobId);

        assertEq(uint256(commerce.getJob(jobId).status), uint256(AgenticCommerce.JobStatus.Adjudicating));
        assertEq(commerce.jobCaseId(jobId), caseId);

        // The court received the exact adjudication tuple.
        (uint256 cJobId, bytes32 cDeliverable, string memory cEvidence, bytes32 cRubric,) =
            court.cases(caseId);
        assertEq(cJobId, jobId);
        assertEq(cDeliverable, keccak256("court-deliverable"));
        assertEq(cEvidence, evidence);
        assertEq(cRubric, rubric);

        // Payouts halt while adjudicating: the evaluator fast path is locked.
        vm.prank(evaluator);
        try commerce.complete(jobId, bytes32(0)) {
            assertTrue(false);
        } catch {
            assertTrue(true);
        }

        // The court posts its verdict back; escrow settles to the provider.
        court.postVerdict(caseId, true, keccak256("deliverable accepted"));

        assertEq(token.balanceOf(provider), 200_000_000);
        assertEq(uint256(commerce.getJob(jobId).status), uint256(AgenticCommerce.JobStatus.Completed));
    }

    function testCourtRejectionRefundsClientInFull() public {
        uint256 jobId = _courtBoundSubmittedJob(200_000_000);

        vm.prank(provider);
        bytes32 caseId = commerce.requestAdjudication(jobId);
        assertEq(uint256(commerce.getJob(jobId).status), uint256(AgenticCommerce.JobStatus.Adjudicating));

        court.postVerdict(caseId, false, keccak256("deliverable rejected"));

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Rejected));
        assertEq(token.balanceOf(client), 1_000_000_000);
        assertEq(token.balanceOf(address(commerce)), 0);
    }

    function testOnlyBoundCourtCanPostVerdict() public {
        uint256 jobId = _courtBoundSubmittedJob(100_000_000);

        vm.prank(client);
        commerce.requestAdjudication(jobId);

        // A stranger cannot impersonate the court.
        vm.prank(stranger);
        try commerce.resolveAdjudication(jobId, true, bytes32(0)) {
            assertTrue(false);
        } catch {
            assertTrue(true);
        }

        // The job evaluator cannot bypass the court either.
        vm.prank(evaluator);
        try commerce.resolveAdjudication(jobId, true, bytes32(0)) {
            assertTrue(false);
        } catch {
            assertTrue(true);
        }

        assertEq(uint256(commerce.getJob(jobId).status), uint256(AgenticCommerce.JobStatus.Adjudicating));
        assertEq(token.balanceOf(provider), 0);
        assertEq(token.balanceOf(address(commerce)), 100_000_000);
    }

    function testAdjudicationRequiresSubmittedProof() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "no proof yet");

        vm.prank(client);
        commerce.setAdjudicator(jobId, address(court));

        vm.prank(client);
        commerce.setBudget(jobId, 100_000_000);

        vm.prank(client);
        commerce.fund(jobId, 100_000_000);

        // No deliverable submitted: the court has nothing to judge.
        vm.prank(client);
        try commerce.requestAdjudication(jobId) {
            assertTrue(false);
        } catch {
            assertTrue(true);
        }
        assertEq(uint256(commerce.getJob(jobId).status), uint256(AgenticCommerce.JobStatus.Funded));
    }

    function testStalledCourtCannotStrandEscrow() public {
        uint256 jobId = _courtBoundSubmittedJob(100_000_000);

        vm.prank(client);
        commerce.requestAdjudication(jobId);

        // The court never responds; past expiry anyone reclaims for the client.
        vm.warp(block.timestamp + 8 days);
        vm.prank(stranger);
        commerce.claimRefund(jobId);

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Expired));
        assertEq(token.balanceOf(client), 1_000_000_000);
    }
}
