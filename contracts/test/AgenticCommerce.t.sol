// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {MockERC20} from "../src/test/MockERC20.sol";

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

    function assertTrue(bool value) internal pure {
        require(value, "assert true failed");
    }
}

contract AgenticCommerceTest is Assertions {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    AgenticCommerce internal commerce;
    MockERC20 internal token;

    address internal client = address(0xC11);
    address internal provider = address(0xBD);
    address internal evaluator = address(0x3E5);
    address internal stranger = address(0xFF);

    function setUp() public {
        token = new MockERC20();
        commerce = new AgenticCommerce(address(this), address(token));

        token.mint(client, 1_000_000_000);

        vm.startPrank(client);
        token.approve(address(commerce), type(uint256).max);
        vm.stopPrank();
    }

    function testCreateJobAndFund() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "design review");

        vm.prank(client);
        commerce.setBudget(jobId, 100_000_000);

        vm.prank(client);
        commerce.fund(jobId, 100_000_000);

        assertEq(token.balanceOf(address(commerce)), 100_000_000);
        assertEq(token.balanceOf(client), 900_000_000);

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Funded));
        assertEq(job.budget, 100_000_000);
    }

    function testFullHappyPath() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "happy path");

        vm.prank(client);
        commerce.setBudget(jobId, 200_000_000);

        vm.prank(client);
        commerce.fund(jobId, 200_000_000);

        vm.prank(provider);
        commerce.submit(jobId, keccak256("deliverable-1"));

        vm.prank(evaluator);
        commerce.complete(jobId, keccak256("approved"));

        assertEq(token.balanceOf(address(commerce)), 0);
        assertEq(token.balanceOf(provider), 200_000_000);

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Completed));
    }

    function testRejectByEvaluatorWhenFunded() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "reject test");

        vm.prank(client);
        commerce.setBudget(jobId, 150_000_000);

        vm.prank(client);
        commerce.fund(jobId, 150_000_000);

        vm.prank(evaluator);
        commerce.rejectJob(jobId, keccak256("bad quality"));

        assertEq(token.balanceOf(address(commerce)), 0);
        assertEq(token.balanceOf(client), 1_000_000_000);

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Rejected));
    }

    function testRejectByClientWhenOpen() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "cancel test");

        vm.prank(client);
        commerce.rejectJob(jobId, bytes32(0));

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Rejected));
    }

    function testExpiredClaimRefund() public {
        uint256 expiry = block.timestamp + 1 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "expiry test");

        vm.prank(client);
        commerce.setBudget(jobId, 75_000_000);

        vm.prank(client);
        commerce.fund(jobId, 75_000_000);

        vm.warp(block.timestamp + 2 days);

        vm.prank(stranger);
        commerce.claimRefund(jobId);

        assertEq(token.balanceOf(address(commerce)), 0);
        assertEq(token.balanceOf(client), 1_000_000_000);

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Expired));
    }

    function testCannotSubmitWhenNotFunded() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "early submit");

        vm.prank(provider);
        try commerce.submit(jobId, keccak256("too-early")) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }
    }

    function testCannotCompleteWhenNotEvaluator() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "eval test");

        vm.prank(client);
        commerce.setBudget(jobId, 50_000_000);

        vm.prank(client);
        commerce.fund(jobId, 50_000_000);

        vm.prank(provider);
        commerce.submit(jobId, keccak256("work"));

        vm.prank(stranger);
        try commerce.complete(jobId, bytes32(0)) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }
    }

    function testCannotFundWithWrongBudget() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "budget test");

        vm.prank(client);
        commerce.setBudget(jobId, 100_000_000);

        vm.prank(client);
        try commerce.fund(jobId, 200_000_000) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }
    }

    function testProviderNotSetCannotFund() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(address(0), evaluator, expiry, "no provider");

        vm.prank(client);
        commerce.setBudget(jobId, 100_000_000);

        vm.prank(client);
        try commerce.fund(jobId, 100_000_000) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }
    }

    function testSetProviderAfterCreation() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(address(0), evaluator, expiry, "late provider");

        vm.prank(client);
        commerce.setProvider(jobId, provider);

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(job.provider, provider);

        vm.prank(client);
        commerce.setBudget(jobId, 50_000_000);

        vm.prank(client);
        commerce.fund(jobId, 50_000_000);

        assertEq(uint256(commerce.getJob(jobId).status), uint256(AgenticCommerce.JobStatus.Funded));
    }

    function testRejectByEvaluatorWhenSubmitted() public {
        uint256 expiry = block.timestamp + 7 days;

        vm.prank(client);
        uint256 jobId = commerce.createJob(provider, evaluator, expiry, "reject after submit");

        vm.prank(client);
        commerce.setBudget(jobId, 100_000_000);

        vm.prank(client);
        commerce.fund(jobId, 100_000_000);

        vm.prank(provider);
        commerce.submit(jobId, keccak256("work"));

        assertEq(token.balanceOf(provider), 0);

        vm.prank(evaluator);
        commerce.rejectJob(jobId, keccak256("rejected"));

        assertEq(token.balanceOf(client), 1_000_000_000);

        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Rejected));
    }
}
