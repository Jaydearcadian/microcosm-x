// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {SpaceBudget} from "../src/SpaceBudget.sol";
import {MockERC20} from "../src/test/MockERC20.sol";

/// Escrow holds money, so it is spending. Before this, a Work Order was a way
/// to move a Space's money without the Space's signed limits ever being
/// consulted: the kernel had no spaceId on a Job and no SpaceBudget reference at
/// all. These tests pin that escrow now passes the same gate a direct payment
/// does.
interface VmEscrow {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function expectRevert() external;
    function expectRevert(bytes calldata) external;
}

contract EscrowLimitsTest {
    VmEscrow internal constant vm = VmEscrow(address(uint160(uint256(keccak256("hevm cheat code")))));
    AgenticCommerce internal commerce;
    SpaceBudget internal budget;
    MockERC20 internal token;

    uint256 internal spaceOwnerKey = 0xA11CE5EED;
    address internal spaceOwner;
    address internal client = address(0xC11);
    address internal provider = address(0xBD);
    address internal evaluator = address(0x3E5);
    address internal stranger = address(0xFF);
    bytes32 internal spaceId = keccak256("escrow-space");

    function setUp() public {
        spaceOwner = vm.addr(spaceOwnerKey);
        token = new MockERC20();
        commerce = new AgenticCommerce(address(this), address(token));
        budget = new SpaceBudget();
        commerce.setSpaceBudget(address(budget));

        address[] memory allow = new address[](1);
        allow[0] = provider;
        SpaceBudget.Binding memory b = SpaceBudget.Binding({
            spaceId: spaceId,
            owner: spaceOwner,
            maxPerTransaction: 100e6,
            dailyBudget: 200e6,
            recipients: allow,
            deadline: block.timestamp + 3650 days,
            nonce: 0
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(spaceOwnerKey, budget.bindingDigestFor(address(budget), block.chainid, b));
        budget.bind(b, abi.encodePacked(r, s, v));

        token.mint(client, 1_000_000e6);
        vm.startPrank(client);
        token.approve(address(commerce), type(uint256).max);
        vm.stopPrank();
    }

    /// The client is whoever opened the Work Order, so the job is created as
    /// them — otherwise fund is refused as NotClient and the test would be
    /// measuring the wrong thing.
    function _job(uint256 budgetAmount) internal returns (uint256) {
        // A prank covers one call, so both are pranked: setBudget is only open
        // to the job's client or provider.
        vm.prank(client);
        uint256 id = commerce.createJob(spaceId, provider, evaluator, block.timestamp + 7 days, "work");
        vm.prank(client);
        commerce.setBudget(id, budgetAmount);
        return id;
    }

    // ---- the gate

    function testEscrowInsideTheSignedLimitsStillWorks() public {
        uint256 id = _job(80e6);
        vm.prank(client);
        commerce.fund(id, 80e6);
        // The escrow really holds the money, which is what "Funded" means here.
        require(token.balanceOf(address(commerce)) == 80e6, "the kernel is not holding the escrow");
    }

    function testEscrowExactlyAtTheCapIsAllowedAndOneUnitOverIsNot() public {
        // The boundary is the point: at the cap the Space owner's signature
        // still permits it, one base unit past it does not.
        uint256 atCap = _job(100e6);
        vm.prank(client);
        commerce.fund(atCap, 100e6);

        uint256 overCap = _job(100e6 + 1);
        vm.prank(client);
        vm.expectRevert();
        commerce.fund(overCap, 100e6 + 1);
    }

    function testEscrowBeyondTheSignedCapCannotEvenBeSetAsTheBudget() public {
        // setBudget is where a wrong number would first appear.
        uint256 id = _job(150e6);
        vm.prank(client);
        vm.expectRevert();
        commerce.fund(id, 150e6);
    }

    function testEscrowToAPersonTheSpaceNeverApprovedIsRefused() public {
        vm.prank(client);
        uint256 id = commerce.createJob(spaceId, stranger, evaluator, block.timestamp + 7 days, "work");
        vm.prank(client);
        commerce.setBudget(id, 50e6);
        vm.prank(client);
        vm.expectRevert();
        commerce.fund(id, 50e6);
    }

    function testTheDailyLimitHoldsAcrossTwoEscrows() public {
        // Two escrows of the per-payment cap each, and the daily budget is
        // exactly twice that — so the third has nothing left, even though every
        // one of them is individually inside the per-payment cap.
        uint256 first = _job(100e6);
        uint256 second = _job(100e6);
        uint256 third = _job(100e6);
        vm.startPrank(client);
        commerce.fund(first, 100e6);
        commerce.fund(second, 100e6);
        vm.expectRevert();
        commerce.fund(third, 100e6);
        vm.stopPrank();
    }

    // ---- and it fails closed

    function testEscrowIsRefusedWhenNoLimitsContractIsConfigured() public {
        AgenticCommerce bare = new AgenticCommerce(address(this), address(token));
        token.mint(client, 1_000_000e6);
        vm.startPrank(client);
        token.approve(address(bare), type(uint256).max);
        uint256 id = bare.createJob(spaceId, provider, evaluator, block.timestamp + 7 days, "work");
        bare.setBudget(id, 10e6);
        vm.expectRevert(bytes("space budget not configured"));
        bare.fund(id, 10e6);
        vm.stopPrank();
    }

    function testAJobWithNoSpaceCannotBeOpenedAtAll() public {
        // Refused at creation rather than left to fail at funding, so the
        // mistake is visible where it is made.
        vm.expectRevert(bytes("spaceId required"));
        commerce.createJob(bytes32(0), provider, evaluator, block.timestamp + 7 days, "work");
    }

    function testTheOwnerCannotClearTheLimitsToUnlockUnrestrictedEscrow() public {
        vm.expectRevert(bytes("budget required"));
        commerce.setSpaceBudget(address(0));
    }
}
