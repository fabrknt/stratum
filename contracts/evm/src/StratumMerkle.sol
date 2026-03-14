// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StratumBitfield} from "./StratumBitfield.sol";

/// @title StratumMerkle
/// @notice Merkle tree verification with domain-separated keccak256.
///         Leaf prefix 0x00, node prefix 0x01. Double-hashes leaves. Sorted pairs.
/// @dev Compatible with @fabrknt/stratum-core MerkleTree when using keccak256 hash function.
library StratumMerkle {
    using StratumBitfield for StratumBitfield.Bitfield;

    /// @notice A stored merkle root with metadata
    struct MerkleRoot {
        bytes32 root;
        uint64 leafCount;
        uint32 maxDepth;
        address authority;
        bool isFinalized;
    }

    /// @notice Registry of merkle roots keyed by bytes32
    struct MerkleRootRegistry {
        mapping(bytes32 => MerkleRoot) roots;
    }

    // --- Domain-separated hashing ---

    /// @notice Hash a leaf with domain separation: keccak256(0x00 || keccak256(data))
    /// @param data The raw leaf data
    /// @return The domain-separated leaf hash
    function hashLeaf(bytes memory data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(uint8(0x00), keccak256(data)));
    }

    /// @notice Hash two nodes with domain separation: keccak256(0x01 || min(a,b) || max(a,b))
    /// @dev Sorted pairs ensure commutative hashing (order-independent)
    /// @param a First node hash
    /// @param b Second node hash
    /// @return The domain-separated node hash
    function hashNode(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        if (a <= b) {
            return keccak256(abi.encodePacked(uint8(0x01), a, b));
        }
        return keccak256(abi.encodePacked(uint8(0x01), b, a));
    }

    // --- Proof verification ---

    /// @dev Maximum proof depth to prevent gas griefing (supports trees up to 2^40 leaves)
    uint256 internal constant MAX_PROOF_DEPTH = 40;

    /// @notice Verify a merkle proof
    /// @param proof The sibling hashes from leaf to root
    /// @param root The expected merkle root
    /// @param leaf The leaf hash to verify
    /// @return True if the proof is valid
    function verify(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure returns (bool) {
        require(proof.length <= MAX_PROOF_DEPTH, "StratumMerkle: proof too long");
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            computedHash = hashNode(computedHash, proof[i]);
        }

        return computedHash == root;
    }

    /// @notice Verify a proof and mark the leaf index in a bitfield (prevents double-use)
    /// @param proof The merkle proof
    /// @param root The expected root
    /// @param leaf The leaf hash
    /// @param index The leaf index in the bitfield
    /// @param bitfield The bitfield to mark
    /// @return True if proof is valid and leaf was newly marked
    function verifyAndMark(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf,
        uint256 index,
        StratumBitfield.Bitfield storage bitfield
    ) internal returns (bool) {
        if (!verify(proof, root, leaf)) {
            return false;
        }
        return bitfield.set(index);
    }

    // --- Registry operations ---

    /// @notice Store a new merkle root in the registry
    /// @param self The registry
    /// @param key The registry key
    /// @param root The merkle root
    /// @param leafCount Number of leaves
    /// @param maxDepth Maximum tree depth
    function updateRoot(
        MerkleRootRegistry storage self,
        bytes32 key,
        bytes32 root,
        uint64 leafCount,
        uint32 maxDepth
    ) internal {
        self.roots[key] = MerkleRoot({
            root: root,
            leafCount: leafCount,
            maxDepth: maxDepth,
            authority: msg.sender,
            isFinalized: false
        });
    }

    /// @notice Verify a proof against a stored root
    /// @param self The registry
    /// @param key The registry key
    /// @param proof The merkle proof
    /// @param leaf The leaf hash
    /// @return True if valid
    function verifyAgainstStored(
        MerkleRootRegistry storage self,
        bytes32 key,
        bytes32[] memory proof,
        bytes32 leaf
    ) internal view returns (bool) {
        MerkleRoot storage stored = self.roots[key];
        if (stored.root == bytes32(0)) return false;
        return verify(proof, stored.root, leaf);
    }
}
