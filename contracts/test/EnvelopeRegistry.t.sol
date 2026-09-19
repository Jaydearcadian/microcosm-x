// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EnvelopeRegistry} from "../src/EnvelopeRegistry.sol";

interface Vm {
    function prank(address) external;
    function expectRevert(bytes4) external;
}

contract EnvelopeRegistryAssertions {
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
}

contract EnvelopeRegistryTest is EnvelopeRegistryAssertions {
    Vm internal constant vm =
        Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    EnvelopeRegistry internal registry;

    address internal owner = address(this);
    address internal controller = address(0xC011);
    address internal nextController = address(0xC012);
    address internal stranger = address(0xBAD);

    bytes32 internal envelopeIdHash = keccak256("env_1");
    bytes32 internal policyHash = keccak256("policy_v1");
    bytes32 internal nextPolicyHash = keccak256("policy_v2");

    function setUp() public {
        registry = new EnvelopeRegistry(owner);
    }

    function testOwnerCanAnchorEnvelope() public {
        registry.anchorEnvelope(envelopeIdHash, policyHash, controller, "ipfs://policy-v1");

        EnvelopeRegistry.EnvelopeAnchor memory anchor = registry.getEnvelope(envelopeIdHash);

        assertEq(anchor.envelopeIdHash, envelopeIdHash);
        assertEq(anchor.policyHash, policyHash);
        assertEq(anchor.controller, controller);
        assertEq(anchor.uri, "ipfs://policy-v1");
        assertEq(uint256(anchor.status), uint256(EnvelopeRegistry.EnvelopeStatus.Active));
        assertEq(anchor.version, 1);
    }

    function testControllerCannotCreateFirstAnchor() public {
        vm.prank(controller);
        vm.expectRevert(EnvelopeRegistry.NotController.selector);
        registry.anchorEnvelope(envelopeIdHash, policyHash, controller, "ipfs://policy-v1");
    }

    function testControllerCanUpdateEnvelopePolicy() public {
        registry.anchorEnvelope(envelopeIdHash, policyHash, controller, "ipfs://policy-v1");

        vm.prank(controller);
        registry.anchorEnvelope(envelopeIdHash, nextPolicyHash, controller, "ipfs://policy-v2");

        EnvelopeRegistry.EnvelopeAnchor memory anchor = registry.getEnvelope(envelopeIdHash);

        assertEq(anchor.policyHash, nextPolicyHash);
        assertEq(anchor.uri, "ipfs://policy-v2");
        assertEq(anchor.version, 2);
        assertEq(uint256(anchor.status), uint256(EnvelopeRegistry.EnvelopeStatus.Active));
    }

    function testOwnerCanRotateController() public {
        registry.anchorEnvelope(envelopeIdHash, policyHash, controller, "ipfs://policy-v1");

        registry.anchorEnvelope(envelopeIdHash, nextPolicyHash, nextController, "ipfs://policy-v2");

        EnvelopeRegistry.EnvelopeAnchor memory anchor = registry.getEnvelope(envelopeIdHash);

        assertEq(anchor.controller, nextController);
        assertEq(anchor.policyHash, nextPolicyHash);
        assertEq(anchor.version, 2);
    }

    function testControllerCanDeactivateEnvelope() public {
        registry.anchorEnvelope(envelopeIdHash, policyHash, controller, "ipfs://policy-v1");

        vm.prank(controller);
        registry.deactivateEnvelope(envelopeIdHash);

        EnvelopeRegistry.EnvelopeAnchor memory anchor = registry.getEnvelope(envelopeIdHash);

        assertEq(uint256(anchor.status), uint256(EnvelopeRegistry.EnvelopeStatus.Inactive));
        assertEq(anchor.version, 2);
    }

    function testStrangerCannotAnchorForController() public {
        vm.prank(stranger);
        vm.expectRevert(EnvelopeRegistry.NotController.selector);
        registry.anchorEnvelope(envelopeIdHash, policyHash, stranger, "ipfs://policy-v1");
    }

    function testStrangerCannotUpdateExistingEnvelope() public {
        registry.anchorEnvelope(envelopeIdHash, policyHash, controller, "ipfs://policy-v1");

        vm.prank(stranger);
        vm.expectRevert(EnvelopeRegistry.NotController.selector);
        registry.anchorEnvelope(envelopeIdHash, nextPolicyHash, stranger, "ipfs://policy-v2");
    }

    function testRejectsInvalidAnchorInputs() public {
        vm.expectRevert(EnvelopeRegistry.InvalidEnvelope.selector);
        registry.anchorEnvelope(bytes32(0), policyHash, controller, "");

        vm.expectRevert(EnvelopeRegistry.InvalidPolicy.selector);
        registry.anchorEnvelope(envelopeIdHash, bytes32(0), controller, "");

        vm.expectRevert(EnvelopeRegistry.InvalidController.selector);
        registry.anchorEnvelope(envelopeIdHash, policyHash, address(0), "");
    }
}
