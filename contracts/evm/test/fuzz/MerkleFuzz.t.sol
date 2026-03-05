// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumMerkle} from "../../src/StratumMerkle.sol";

contract MerkleFuzzTest is Test {
    /// @dev hashLeaf is deterministic
    function testFuzz_hashLeaf_deterministic(bytes memory data) public pure {
        bytes32 h1 = StratumMerkle.hashLeaf(data);
        bytes32 h2 = StratumMerkle.hashLeaf(data);
        assertEq(h1, h2);
    }

    /// @dev hashNode is commutative (sorted pairs)
    function testFuzz_hashNode_commutative(bytes32 a, bytes32 b) public pure {
        assertEq(StratumMerkle.hashNode(a, b), StratumMerkle.hashNode(b, a));
    }

    /// @dev Different leaf data produces different hashes
    function testFuzz_hashLeaf_collision_resistance(bytes memory a, bytes memory b) public pure {
        vm.assume(keccak256(a) != keccak256(b));
        assertTrue(StratumMerkle.hashLeaf(a) != StratumMerkle.hashLeaf(b));
    }

    /// @dev A valid 2-leaf tree always verifies
    function testFuzz_2_leaf_verify(bytes memory data0, bytes memory data1) public pure {
        bytes32 leaf0 = StratumMerkle.hashLeaf(data0);
        bytes32 leaf1 = StratumMerkle.hashLeaf(data1);
        bytes32 root = StratumMerkle.hashNode(leaf0, leaf1);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertTrue(StratumMerkle.verify(proof, root, leaf0));
    }

    /// @dev Wrong leaf always fails verification
    function testFuzz_wrong_leaf_fails(
        bytes memory data0,
        bytes memory data1,
        bytes memory wrongData
    ) public pure {
        vm.assume(keccak256(data0) != keccak256(wrongData));

        bytes32 leaf0 = StratumMerkle.hashLeaf(data0);
        bytes32 leaf1 = StratumMerkle.hashLeaf(data1);
        bytes32 wrongLeaf = StratumMerkle.hashLeaf(wrongData);
        bytes32 root = StratumMerkle.hashNode(leaf0, leaf1);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertFalse(StratumMerkle.verify(proof, root, wrongLeaf));
    }

    /// @dev hashNode with same inputs is not the same as hashLeaf
    function testFuzz_domain_separation(bytes32 data) public pure {
        // hashNode(data, data) uses prefix 0x01
        bytes32 nodeHash = StratumMerkle.hashNode(data, data);
        // hashLeaf with same raw bytes uses prefix 0x00 + double hash
        bytes32 leafHash = StratumMerkle.hashLeaf(abi.encodePacked(data, data));
        assertTrue(nodeHash != leafHash);
    }
}
