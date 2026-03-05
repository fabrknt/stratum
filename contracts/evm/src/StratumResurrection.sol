// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StratumBitfield} from "./StratumBitfield.sol";
import {StratumMerkle} from "./StratumMerkle.sol";

/// @title StratumResurrection
/// @notice Archive state off-chain (delete storage for gas refunds),
///         restore with merkle proof. Bitfield prevents double-restore.
/// @dev Combines Merkle verification + Bitfield tracking + on-chain archive metadata.
library StratumResurrection {
    using StratumBitfield for StratumBitfield.Bitfield;

    /// @notice An archived dataset
    struct Archive {
        bytes32 merkleRoot;
        uint64 entryCount;
        bytes32 dataHash;     // hash of the full archived dataset
        address creator;
        uint64 createdAt;
        bool exists;
    }

    /// @notice Registry of archives with restore tracking
    struct ArchiveRegistry {
        mapping(bytes32 => Archive) archives;
        mapping(bytes32 => StratumBitfield.Bitfield) restored; // tracks restored entries per archive
    }

    // --- Events ---

    event ArchiveCreated(bytes32 indexed archiveId, bytes32 merkleRoot, uint64 entryCount);
    event EntryRestored(bytes32 indexed archiveId, uint256 indexed entryIndex, bytes leafData);
    event BatchRestored(bytes32 indexed archiveId, uint256 count);

    // --- Core operations ---

    /// @notice Create a new archive record
    /// @param self The registry
    /// @param archiveId Unique identifier for the archive
    /// @param merkleRoot The merkle root of the archived entries
    /// @param entryCount Number of entries in the archive
    /// @param dataHash Hash of the full archived dataset (for integrity)
    function createArchive(
        ArchiveRegistry storage self,
        bytes32 archiveId,
        bytes32 merkleRoot,
        uint64 entryCount,
        bytes32 dataHash
    ) internal {
        require(!self.archives[archiveId].exists, "StratumResurrection: archive exists");
        require(merkleRoot != bytes32(0), "StratumResurrection: empty root");

        self.archives[archiveId] = Archive({
            merkleRoot: merkleRoot,
            entryCount: entryCount,
            dataHash: dataHash,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            exists: true
        });

        emit ArchiveCreated(archiveId, merkleRoot, entryCount);
    }

    /// @notice Restore a single entry from an archive
    /// @param self The registry
    /// @param archiveId The archive to restore from
    /// @param entryIndex The index of the entry in the archive
    /// @param proof Merkle proof for the entry
    /// @param leafData The raw leaf data to restore
    /// @return True if restored successfully (not previously restored)
    function restore(
        ArchiveRegistry storage self,
        bytes32 archiveId,
        uint256 entryIndex,
        bytes32[] memory proof,
        bytes memory leafData
    ) internal returns (bool) {
        Archive storage archive = self.archives[archiveId];
        require(archive.exists, "StratumResurrection: archive not found");
        require(entryIndex < archive.entryCount, "StratumResurrection: index out of range");

        // Verify merkle proof
        bytes32 leaf = StratumMerkle.hashLeaf(leafData);
        require(
            StratumMerkle.verify(proof, archive.merkleRoot, leaf),
            "StratumResurrection: invalid proof"
        );

        // Mark as restored (prevents double-restore)
        bool newlyRestored = self.restored[archiveId].set(entryIndex);
        require(newlyRestored, "StratumResurrection: already restored");

        emit EntryRestored(archiveId, entryIndex, leafData);
        return true;
    }

    /// @notice Restore multiple entries in a batch
    /// @param self The registry
    /// @param archiveId The archive to restore from
    /// @param entryIndices Array of entry indices
    /// @param proofs Array of merkle proofs
    /// @param leafDatas Array of raw leaf data
    /// @return count Number of successfully restored entries
    function batchRestore(
        ArchiveRegistry storage self,
        bytes32 archiveId,
        uint256[] memory entryIndices,
        bytes32[][] memory proofs,
        bytes[] memory leafDatas
    ) internal returns (uint256 count) {
        require(
            entryIndices.length == proofs.length && proofs.length == leafDatas.length,
            "StratumResurrection: length mismatch"
        );

        for (uint256 i = 0; i < entryIndices.length; i++) {
            restore(self, archiveId, entryIndices[i], proofs[i], leafDatas[i]);
            count++;
        }

        emit BatchRestored(archiveId, count);
    }

    /// @notice Check if an entry has been restored
    /// @param self The registry
    /// @param archiveId The archive
    /// @param entryIndex The entry index
    /// @return True if already restored
    function isRestored(
        ArchiveRegistry storage self,
        bytes32 archiveId,
        uint256 entryIndex
    ) internal view returns (bool) {
        return self.restored[archiveId].get(entryIndex);
    }

    /// @notice Get archive details
    /// @param self The registry
    /// @param archiveId The archive
    /// @return archive The archive data
    function getArchive(
        ArchiveRegistry storage self,
        bytes32 archiveId
    ) internal view returns (Archive storage archive) {
        return self.archives[archiveId];
    }

    /// @notice Get count of restored entries for an archive
    /// @param self The registry
    /// @param archiveId The archive
    /// @return The count of restored entries
    function restoredCount(
        ArchiveRegistry storage self,
        bytes32 archiveId
    ) internal view returns (uint256) {
        return self.restored[archiveId].getCount();
    }
}
