// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {Stratum} from "../src/Stratum.sol";
import {StratumBitfield} from "../src/StratumBitfield.sol";
import {StratumMerkle} from "../src/StratumMerkle.sol";
import {StratumExpiry} from "../src/StratumExpiry.sol";
import {StratumEvents} from "../src/StratumEvents.sol";
import {StratumResurrection} from "../src/StratumResurrection.sol";

/// @notice A complete example contract using all 5 primitives
contract StratumApp is Stratum {
    using StratumBitfield for StratumBitfield.Bitfield;
    using StratumBitfield for StratumBitfield.BitfieldRegistry;
    using StratumMerkle for StratumMerkle.MerkleRootRegistry;
    using StratumExpiry for StratumExpiry.ExpiryRegistry;
    using StratumEvents for StratumEvents.HistorySummary;
    using StratumResurrection for StratumResurrection.ArchiveRegistry;

    StratumBitfield.BitfieldRegistry internal claimRegistry;
    StratumMerkle.MerkleRootRegistry internal merkleRoots;
    StratumExpiry.ExpiryRegistry internal expiryRegistry;
    StratumEvents.HistorySummary public history;
    StratumResurrection.ArchiveRegistry internal archives;

    constructor() {
        expiryRegistry.config = StratumExpiry.ExpiryConfig({
            minDeposit: 0.001 ether,
            minTTL: 60,
            maxTTL: 365 days,
            cleanerRewardBps: 1000,
            ownerRefundBps: 9000
        });
    }

    function setClaim(bytes32 domain, uint256 index) external {
        claimRegistry.setInRegistry(domain, index);
    }

    function isClaimed(bytes32 domain, uint256 index) external view returns (bool) {
        return claimRegistry.getInRegistry(domain, index);
    }

    function setMerkleRoot(bytes32 key, bytes32 root, uint64 leafCount) external {
        merkleRoots.updateRoot(key, root, leafCount, 20);
    }

    function verifyMerkle(bytes32 key, bytes32[] memory proof, bytes32 leaf) external view returns (bool) {
        return merkleRoots.verifyAgainstStored(key, proof, leaf);
    }

    function createExpiry(bytes32 id, uint32 ttl) external {
        expiryRegistry.create(id, msg.sender, ttl, 0.01 ether);
    }

    function isExpired(bytes32 id) external view returns (bool) {
        return expiryRegistry.isExpired(id);
    }

    function addRecord(uint128 value, bytes memory data) external {
        history.addRecord(keccak256("app"), value, data);
    }

    function getHistory() external view returns (uint64 count, uint128 sum) {
        return (history.count, history.sum);
    }

    function createArchive(bytes32 id, bytes32 root, uint64 count) external {
        archives.createArchive(id, root, count, bytes32(0));
    }

    function restoreEntry(bytes32 id, uint256 index, bytes32[] memory proof, bytes memory data) external returns (bool) {
        return archives.restore(id, index, proof, data);
    }

    function isRestored(bytes32 id, uint256 index) external view returns (bool) {
        return archives.isRestored(id, index);
    }
}

contract StratumIntegrationTest is Test {
    StratumApp app;

    function setUp() public {
        app = new StratumApp();
    }

    /// @notice Integration test: all 5 primitives working together
    function test_all_primitives_together() public {
        // 1. Merkle: set up a root
        bytes32 leaf0 = StratumMerkle.hashLeaf("user_alice");
        bytes32 leaf1 = StratumMerkle.hashLeaf("user_bob");
        bytes32 root = StratumMerkle.hashNode(leaf0, leaf1);

        bytes32 merkleKey = keccak256("whitelist_v1");
        app.setMerkleRoot(merkleKey, root, 2);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = leaf1;
        assertTrue(app.verifyMerkle(merkleKey, proof, leaf0));

        // 2. Bitfield: track claims
        bytes32 domain = keccak256("airdrop_v1");
        assertFalse(app.isClaimed(domain, 0));
        app.setClaim(domain, 0);
        assertTrue(app.isClaimed(domain, 0));

        // 3. Expiry: create temporary state
        bytes32 expiryId = keccak256("temp_state_1");
        app.createExpiry(expiryId, 3600);
        assertFalse(app.isExpired(expiryId));
        vm.warp(block.timestamp + 3601);
        assertTrue(app.isExpired(expiryId));

        // 4. Events: add records
        app.addRecord(100, "trade_1");
        app.addRecord(200, "trade_2");
        (uint64 count, uint128 sum) = app.getHistory();
        assertEq(count, 2);
        assertEq(sum, 300);

        // 5. Resurrection: archive and restore
        // Leaves include entryIndex (matching StratumResurrection.restore)
        bytes32 archLeaf0 = StratumMerkle.hashLeaf(abi.encodePacked(uint256(0), "archived_0"));
        bytes32 archLeaf1 = StratumMerkle.hashLeaf(abi.encodePacked(uint256(1), "archived_1"));
        bytes32 archRoot = StratumMerkle.hashNode(archLeaf0, archLeaf1);

        bytes32 archiveId = keccak256("archive_v1");
        app.createArchive(archiveId, archRoot, 2);

        assertFalse(app.isRestored(archiveId, 0));
        bytes32[] memory archProof = new bytes32[](1);
        archProof[0] = archLeaf1;
        app.restoreEntry(archiveId, 0, archProof, "archived_0");
        assertTrue(app.isRestored(archiveId, 0));
    }
}
