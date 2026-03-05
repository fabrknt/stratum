// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumMerkle} from "../src/StratumMerkle.sol";
import {StratumBitfield} from "../src/StratumBitfield.sol";

contract MerkleHarness {
    using StratumMerkle for StratumMerkle.MerkleRootRegistry;
    using StratumBitfield for StratumBitfield.Bitfield;

    StratumBitfield.Bitfield internal claimBitfield;
    StratumMerkle.MerkleRootRegistry internal registry;

    function hashLeaf(bytes memory data) external pure returns (bytes32) {
        return StratumMerkle.hashLeaf(data);
    }

    function hashNode(bytes32 a, bytes32 b) external pure returns (bytes32) {
        return StratumMerkle.hashNode(a, b);
    }

    function verify(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) external pure returns (bool) {
        return StratumMerkle.verify(proof, root, leaf);
    }

    function verifyAndMark(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf,
        uint256 index
    ) external returns (bool) {
        return StratumMerkle.verifyAndMark(proof, root, leaf, index, claimBitfield);
    }

    function isClaimed(uint256 index) external view returns (bool) {
        return claimBitfield.get(index);
    }

    function updateRoot(
        bytes32 key,
        bytes32 root,
        uint64 leafCount,
        uint32 maxDepth
    ) external {
        registry.updateRoot(key, root, leafCount, maxDepth);
    }

    function verifyAgainstStored(
        bytes32 key,
        bytes32[] memory proof,
        bytes32 leaf
    ) external view returns (bool) {
        return registry.verifyAgainstStored(key, proof, leaf);
    }
}

contract StratumMerkleTest is Test {
    MerkleHarness harness;

    function setUp() public {
        harness = new MerkleHarness();
    }

    // --- Hash function tests ---

    function test_hashLeaf_deterministic() public view {
        bytes32 h1 = harness.hashLeaf("test");
        bytes32 h2 = harness.hashLeaf("test");
        assertEq(h1, h2);
    }

    function test_hashLeaf_different_data() public view {
        bytes32 h1 = harness.hashLeaf("test1");
        bytes32 h2 = harness.hashLeaf("test2");
        assertTrue(h1 != h2);
    }

    function test_hashNode_commutative() public view {
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        // Sorted pairs — order shouldn't matter
        assertEq(harness.hashNode(a, b), harness.hashNode(b, a));
    }

    function test_hashNode_domain_separated_from_leaf() public view {
        bytes memory data = abi.encodePacked(keccak256("a"), keccak256("b"));
        bytes32 asLeaf = harness.hashLeaf(data);
        // hashNode has 0x01 prefix, hashLeaf has 0x00 prefix — they MUST differ
        bytes32 a = keccak256("a");
        bytes32 b = keccak256("b");
        bytes32 asNode = harness.hashNode(a, b);
        assertTrue(asLeaf != asNode);
    }

    // --- Proof verification with real tree ---

    function test_verify_2_leaf_tree() public view {
        // Build tree: leaf0, leaf1
        bytes32 leaf0 = harness.hashLeaf("leaf0");
        bytes32 leaf1 = harness.hashLeaf("leaf1");
        bytes32 root = harness.hashNode(leaf0, leaf1);

        // Proof for leaf0: sibling is leaf1
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertTrue(harness.verify(proof, root, leaf0));

        // Proof for leaf1: sibling is leaf0
        proof[0] = leaf0;
        assertTrue(harness.verify(proof, root, leaf1));
    }

    function test_verify_4_leaf_tree() public view {
        bytes32 leaf0 = harness.hashLeaf("leaf0");
        bytes32 leaf1 = harness.hashLeaf("leaf1");
        bytes32 leaf2 = harness.hashLeaf("leaf2");
        bytes32 leaf3 = harness.hashLeaf("leaf3");

        bytes32 node01 = harness.hashNode(leaf0, leaf1);
        bytes32 node23 = harness.hashNode(leaf2, leaf3);
        bytes32 root = harness.hashNode(node01, node23);

        // Verify leaf0: proof = [leaf1, node23]
        bytes32[] memory proof = new bytes32[](2);
        proof[0] = leaf1;
        proof[1] = node23;
        assertTrue(harness.verify(proof, root, leaf0));

        // Verify leaf2: proof = [leaf3, node01]
        proof[0] = leaf3;
        proof[1] = node01;
        assertTrue(harness.verify(proof, root, leaf2));
    }

    function test_verify_invalid_proof_fails() public view {
        bytes32 leaf0 = harness.hashLeaf("leaf0");
        bytes32 leaf1 = harness.hashLeaf("leaf1");
        bytes32 root = harness.hashNode(leaf0, leaf1);

        // Wrong sibling
        bytes32[] memory proof = new bytes32[](1);
        proof[0] = keccak256("wrong");
        assertFalse(harness.verify(proof, root, leaf0));
    }

    function test_verify_wrong_root_fails() public view {
        bytes32 leaf0 = harness.hashLeaf("leaf0");
        bytes32 leaf1 = harness.hashLeaf("leaf1");

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertFalse(harness.verify(proof, keccak256("wrong_root"), leaf0));
    }

    // --- verifyAndMark ---

    function test_verifyAndMark_marks_bitfield() public {
        bytes32 leaf0 = harness.hashLeaf("leaf0");
        bytes32 leaf1 = harness.hashLeaf("leaf1");
        bytes32 root = harness.hashNode(leaf0, leaf1);

        assertFalse(harness.isClaimed(0));

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertTrue(harness.verifyAndMark(proof, root, leaf0, 0));
        assertTrue(harness.isClaimed(0));

        // Second call returns false (already marked)
        assertFalse(harness.verifyAndMark(proof, root, leaf0, 0));
    }

    function test_verifyAndMark_invalid_proof() public {
        bytes32 leaf0 = harness.hashLeaf("leaf0");

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = keccak256("wrong");
        assertFalse(harness.verifyAndMark(proof, keccak256("root"), leaf0, 0));
        assertFalse(harness.isClaimed(0));
    }

    // --- Registry ---

    function test_registry_store_and_verify() public {
        bytes32 key = keccak256("airdrop_1");
        bytes32 leaf0 = harness.hashLeaf("leaf0");
        bytes32 leaf1 = harness.hashLeaf("leaf1");
        bytes32 root = harness.hashNode(leaf0, leaf1);

        harness.updateRoot(key, root, 2, 1);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertTrue(harness.verifyAgainstStored(key, proof, leaf0));

        // Wrong key should fail
        assertFalse(harness.verifyAgainstStored(keccak256("wrong_key"), proof, leaf0));
    }

    function test_registry_nonexistent_key() public view {
        bytes32[] memory proof = new bytes32[](0);
        assertFalse(harness.verifyAgainstStored(keccak256("nonexistent"), proof, keccak256("leaf")));
    }

    // --- Large tree verification ---

    function test_verify_8_leaf_tree() public view {
        bytes32[8] memory leaves;
        for (uint256 i = 0; i < 8; i++) {
            leaves[i] = harness.hashLeaf(abi.encodePacked("leaf", i));
        }

        // Build tree bottom-up
        bytes32 n01 = harness.hashNode(leaves[0], leaves[1]);
        bytes32 n23 = harness.hashNode(leaves[2], leaves[3]);
        bytes32 n45 = harness.hashNode(leaves[4], leaves[5]);
        bytes32 n67 = harness.hashNode(leaves[6], leaves[7]);
        bytes32 n0123 = harness.hashNode(n01, n23);
        bytes32 n4567 = harness.hashNode(n45, n67);
        bytes32 root = harness.hashNode(n0123, n4567);

        // Verify leaf5: proof = [leaves[4], n67, n0123]
        bytes32[] memory proof = new bytes32[](3);
        proof[0] = leaves[4];
        proof[1] = n67;
        proof[2] = n0123;
        assertTrue(harness.verify(proof, root, leaves[5]));
    }
}
