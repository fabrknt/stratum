// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumResurrection} from "../src/StratumResurrection.sol";
import {StratumMerkle} from "../src/StratumMerkle.sol";

contract ResurrectionHarness {
    using StratumResurrection for StratumResurrection.ArchiveRegistry;

    StratumResurrection.ArchiveRegistry internal registry;

    function createArchive(
        bytes32 archiveId,
        bytes32 merkleRoot,
        uint64 entryCount,
        bytes32 dataHash
    ) external {
        registry.createArchive(archiveId, merkleRoot, entryCount, dataHash);
    }

    function restore(
        bytes32 archiveId,
        uint256 entryIndex,
        bytes32[] memory proof,
        bytes memory leafData
    ) external returns (bool) {
        return registry.restore(archiveId, entryIndex, proof, leafData);
    }

    function batchRestore(
        bytes32 archiveId,
        uint256[] memory entryIndices,
        bytes32[][] memory proofs,
        bytes[] memory leafDatas
    ) external returns (uint256) {
        return registry.batchRestore(archiveId, entryIndices, proofs, leafDatas);
    }

    function isRestored(bytes32 archiveId, uint256 entryIndex) external view returns (bool) {
        return registry.isRestored(archiveId, entryIndex);
    }

    function restoredCount(bytes32 archiveId) external view returns (uint256) {
        return registry.restoredCount(archiveId);
    }

    function getArchive(bytes32 archiveId) external view returns (
        bytes32 merkleRoot, uint64 entryCount, bytes32 dataHash, address creator, bool exists
    ) {
        StratumResurrection.Archive storage archive = registry.getArchive(archiveId);
        return (archive.merkleRoot, archive.entryCount, archive.dataHash, archive.creator, archive.exists);
    }
}

contract StratumResurrectionTest is Test {
    ResurrectionHarness harness;

    // Build a 2-leaf merkle tree for testing
    bytes constant LEAF0_DATA = "archived_entry_0";
    bytes constant LEAF1_DATA = "archived_entry_1";

    bytes32 leaf0;
    bytes32 leaf1;
    bytes32 root;

    function setUp() public {
        harness = new ResurrectionHarness();

        leaf0 = StratumMerkle.hashLeaf(LEAF0_DATA);
        leaf1 = StratumMerkle.hashLeaf(LEAF1_DATA);
        root = StratumMerkle.hashNode(leaf0, leaf1);
    }

    function test_createArchive() public {
        bytes32 id = keccak256("archive1");
        harness.createArchive(id, root, 2, keccak256("full_data"));

        (bytes32 merkleRoot, uint64 entryCount, bytes32 dataHash, address creator, bool exists) = harness.getArchive(id);
        assertEq(merkleRoot, root);
        assertEq(entryCount, 2);
        assertEq(dataHash, keccak256("full_data"));
        assertEq(creator, address(this));
        assertTrue(exists);
    }

    function test_createArchive_duplicate_reverts() public {
        bytes32 id = keccak256("archive1");
        harness.createArchive(id, root, 2, keccak256("data"));
        vm.expectRevert("StratumResurrection: archive exists");
        harness.createArchive(id, root, 2, keccak256("data"));
    }

    function test_restore_single() public {
        bytes32 id = keccak256("archive1");
        harness.createArchive(id, root, 2, bytes32(0));

        assertFalse(harness.isRestored(id, 0));

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertTrue(harness.restore(id, 0, proof, LEAF0_DATA));

        assertTrue(harness.isRestored(id, 0));
        assertFalse(harness.isRestored(id, 1));
        assertEq(harness.restoredCount(id), 1);
    }

    function test_restore_double_reverts() public {
        bytes32 id = keccak256("archive1");
        harness.createArchive(id, root, 2, bytes32(0));

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        harness.restore(id, 0, proof, LEAF0_DATA);

        vm.expectRevert("StratumResurrection: already restored");
        harness.restore(id, 0, proof, LEAF0_DATA);
    }

    function test_restore_invalid_proof_reverts() public {
        bytes32 id = keccak256("archive1");
        harness.createArchive(id, root, 2, bytes32(0));

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = keccak256("wrong_sibling");

        vm.expectRevert("StratumResurrection: invalid proof");
        harness.restore(id, 0, proof, LEAF0_DATA);
    }

    function test_restore_wrong_data_reverts() public {
        bytes32 id = keccak256("archive1");
        harness.createArchive(id, root, 2, bytes32(0));

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;

        vm.expectRevert("StratumResurrection: invalid proof");
        harness.restore(id, 0, proof, "wrong_data");
    }

    function test_restore_nonexistent_archive() public {
        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert("StratumResurrection: archive not found");
        harness.restore(keccak256("nonexistent"), 0, proof, "data");
    }

    function test_restore_index_out_of_range() public {
        bytes32 id = keccak256("archive1");
        harness.createArchive(id, root, 2, bytes32(0));

        bytes32[] memory proof = new bytes32[](0);
        vm.expectRevert("StratumResurrection: index out of range");
        harness.restore(id, 5, proof, "data");
    }

    function test_batchRestore() public {
        bytes32 id = keccak256("archive1");
        harness.createArchive(id, root, 2, bytes32(0));

        uint256[] memory indices = new uint256[](2);
        indices[0] = 0;
        indices[1] = 1;

        bytes32[][] memory proofs = new bytes32[][](2);
        proofs[0] = new bytes32[](1);
        proofs[0][0] = leaf1;
        proofs[1] = new bytes32[](1);
        proofs[1][0] = leaf0;

        bytes[] memory datas = new bytes[](2);
        datas[0] = LEAF0_DATA;
        datas[1] = LEAF1_DATA;

        uint256 count = harness.batchRestore(id, indices, proofs, datas);
        assertEq(count, 2);
        assertTrue(harness.isRestored(id, 0));
        assertTrue(harness.isRestored(id, 1));
    }
}
