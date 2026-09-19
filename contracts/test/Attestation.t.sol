// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementRouter} from "../src/SettlementRouter.sol";
import {AgenticCommerce} from "../src/AgenticCommerce.sol";
import {MockERC20} from "../src/test/MockERC20.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function chainId(uint256) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
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

contract AttestationTest is Assertions {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    SettlementRouter internal router;
    AgenticCommerce internal commerce;
    MockERC20 internal token;

    uint256 internal controllerKey = 0xA11CE5EED;
    address internal controller;
    address internal recipient = address(0xB0B);
    bytes32 internal spaceId = keccak256("space-procurement-001");

    event FixtureDigest(bytes32 indexed spaceId, bytes32 deliverableHash, bytes32 digest);

    function setUp() public {
        router = new SettlementRouter(address(this), true);
        token = new MockERC20();
        commerce = new AgenticCommerce(address(this), address(token));

        controller = vm.addr(controllerKey);
        router.setController(controller, true);
        commerce.setController(controller, true);
        router.registerSpaceToken(spaceId, address(token));

        token.mint(controller, 1_000_000_000);
        vm.startPrank(controller);
        token.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _routerAuth(
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes32 deliverableHash
    ) internal view returns (SettlementRouter.PaymentAuthorization memory) {
        return SettlementRouter.PaymentAuthorization({
            spaceId: spaceId,
            recipient: to,
            amount: amount,
            nonce: nonce,
            deadline: deadline,
            deliverableHash: deliverableHash
        });
    }

    function _signRouter(SettlementRouter.PaymentAuthorization memory auth)
        internal
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(controllerKey, router.attestationDigest(auth));
        return abi.encodePacked(r, s, v);
    }

    function testValidAttestationSettlesPayment() public {
        SettlementRouter.PaymentAuthorization memory auth =
            _routerAuth(recipient, 25_000_000, 1, block.timestamp + 1 days, keccak256("work-1"));

        router.settleWithAttestation(auth, _signRouter(auth));

        assertEq(token.balanceOf(recipient), 25_000_000);
        assertTrue(router.usedNonces(spaceId, 1));
    }

    function testRejectsTamperedAmountOrRecipient() public {
        SettlementRouter.PaymentAuthorization memory signedAuth =
            _routerAuth(recipient, 25_000_000, 2, block.timestamp + 1 days, keccak256("work-1"));
        bytes memory sig = _signRouter(signedAuth);

        // Tampered amount: signature no longer matches the intent.
        SettlementRouter.PaymentAuthorization memory tamperedAmount =
            _routerAuth(recipient, 50_000_000, 2, block.timestamp + 1 days, keccak256("work-1"));
        try router.settleWithAttestation(tamperedAmount, sig) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }

        // Tampered recipient: signature no longer matches the intent.
        SettlementRouter.PaymentAuthorization memory tamperedRecipient =
            _routerAuth(address(0xE41), 25_000_000, 2, block.timestamp + 1 days, keccak256("work-1"));
        try router.settleWithAttestation(tamperedRecipient, sig) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }

        // Neither tamper moved funds.
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(address(0xE41)), 0);
    }

    function testRejectsExpiredDeadline() public {
        SettlementRouter.PaymentAuthorization memory auth =
            _routerAuth(recipient, 25_000_000, 3, block.timestamp + 1 days, keccak256("work-1"));
        bytes memory sig = _signRouter(auth);

        vm.warp(block.timestamp + 2 days);

        try router.settleWithAttestation(auth, sig) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }
        assertEq(token.balanceOf(recipient), 0);
    }

    function testReplayAttackFailsOnSecondExecution() public {
        SettlementRouter.PaymentAuthorization memory auth =
            _routerAuth(recipient, 25_000_000, 4, block.timestamp + 1 days, keccak256("work-1"));
        bytes memory sig = _signRouter(auth);

        router.settleWithAttestation(auth, sig);
        assertEq(token.balanceOf(recipient), 25_000_000);

        try router.settleWithAttestation(auth, sig) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }
        // Exactly one payout landed.
        assertEq(token.balanceOf(recipient), 25_000_000);
    }

    function testCrossChainReplayFails() public {
        uint256 homeChain = block.chainid;
        SettlementRouter.PaymentAuthorization memory auth =
            _routerAuth(recipient, 25_000_000, 5, block.timestamp + 1 days, keccak256("work-1"));
        bytes memory sig = _signRouter(auth);

        // Same intent replayed on another chain: the EIP-712 domain binds
        // chainId, so the recovered signer no longer matches the controller.
        vm.chainId(195);
        try router.settleWithAttestation(auth, sig) {
            assertTrue(false);
        } catch Error(string memory) {
            assertTrue(true);
        } catch {
            assertTrue(true);
        }
        assertEq(token.balanceOf(recipient), 0);
        vm.chainId(homeChain);
    }

    function testCommerceAttestedSettlementReleasesEscrow() public {
        address client = address(0xC11);
        address provider = address(0xBD);
        address evaluator = vm.addr(0xE1);
        bytes32 deliverable = keccak256("deliverable-1");

        token.mint(client, 500_000_000);
        vm.startPrank(client);
        token.approve(address(commerce), type(uint256).max);
        uint256 jobId = commerce.createJob(provider, evaluator, block.timestamp + 7 days, "attested work");
        commerce.setBudget(jobId, 100_000_000);
        commerce.fund(jobId, 100_000_000);
        vm.stopPrank();

        vm.prank(provider);
        commerce.submit(jobId, deliverable);

        AgenticCommerce.PaymentAuthorization memory auth = AgenticCommerce.PaymentAuthorization({
            spaceId: spaceId,
            recipient: provider,
            amount: 100_000_000,
            nonce: 7,
            deadline: block.timestamp + 1 days,
            deliverableHash: deliverable
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(controllerKey, commerce.attestationDigest(auth));

        commerce.settleJobWithAttestation(jobId, auth, abi.encodePacked(r, s, v));

        assertEq(token.balanceOf(provider), 100_000_000);
        AgenticCommerce.Job memory job = commerce.getJob(jobId);
        assertEq(uint256(job.status), uint256(AgenticCommerce.JobStatus.Completed));
    }

    function testCommerceAttestationRejectsMismatchedDeliverable() public {
        address client = address(0xC11);
        address provider = address(0xBD);
        address evaluator = vm.addr(0xE1);

        token.mint(client, 500_000_000);
        vm.startPrank(client);
        token.approve(address(commerce), type(uint256).max);
        uint256 jobId = commerce.createJob(provider, evaluator, block.timestamp + 7 days, "attested work");
        commerce.setBudget(jobId, 100_000_000);
        commerce.fund(jobId, 100_000_000);
        vm.stopPrank();

        vm.prank(provider);
        commerce.submit(jobId, keccak256("deliverable-1"));

        // Authorization names a deliverable that was never submitted: no payout.
        AgenticCommerce.PaymentAuthorization memory auth = AgenticCommerce.PaymentAuthorization({
            spaceId: spaceId,
            recipient: provider,
            amount: 100_000_000,
            nonce: 8,
            deadline: block.timestamp + 1 days,
            deliverableHash: keccak256("deliverable-2")
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(controllerKey, commerce.attestationDigest(auth));

        try commerce.settleJobWithAttestation(jobId, auth, abi.encodePacked(r, s, v)) {
            assertTrue(false);
        } catch {
            assertTrue(true);
        }
        assertEq(token.balanceOf(provider), 0);
    }

    /**
     * Canonical cross-implementation vector: fixed inputs produce a fixed
     * EIP-712 digest. The policy-engine JS suite asserts the same constant,
     * proving offchain encoders match the onchain verifier byte-for-byte.
     * Regenerate with: forge test --match-test testDigestFixtureVector -vvvv
     */
    function testDigestFixtureVector() public {
        SettlementRouter.PaymentAuthorization memory auth = SettlementRouter.PaymentAuthorization({
            spaceId: keccak256("space-procurement-001"),
            recipient: address(0x1111111111111111111111111111111111111111),
            amount: 350_000_000,
            nonce: 1,
            deadline: 1893456000,
            deliverableHash: keccak256("deliverable-1")
        });
        bytes32 digest = router.attestationDigestFor(
            address(0x1111111111111111111111111111111111111111),
            195,
            auth
        );
        assertEq(auth.spaceId, 0x3c8fb0c1ef0903e38b5fd254b6263a5dc6d95cd17e6cb408b197e790b283cdb0);
        assertEq(auth.deliverableHash, 0x858629340e58d1faeb24232b139fa588ddc67f4ed71970241fc1bf18f48f65db);
        assertEq(digest, 0x6de0e9235ca74a6f96f11a80d14e386e6969fe4ad84d3a35b802c40b720f3999);
        emit FixtureDigest(auth.spaceId, auth.deliverableHash, digest);
    }
}
