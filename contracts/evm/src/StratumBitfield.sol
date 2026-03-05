// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StratumBitfield
/// @notice Compact bit tracking using mapping(uint256 => uint256).
///         Each storage slot packs 256 booleans. No chunking needed — mappings auto-expand.
/// @dev Bucket index = index >> 8, bit position = index & 0xff
library StratumBitfield {
    /// @notice A bitfield is just a mapping from bucket index to packed uint256
    struct Bitfield {
        mapping(uint256 => uint256) buckets;
        uint256 count;
    }

    /// @notice A registry of independent bitfields keyed by bytes32
    struct BitfieldRegistry {
        mapping(bytes32 => Bitfield) bitfields;
    }

    // --- Core operations ---

    /// @notice Check if a bit is set
    /// @param self The bitfield to query
    /// @param index The global bit index
    /// @return True if the bit is set
    function get(Bitfield storage self, uint256 index) internal view returns (bool) {
        uint256 bucket = index >> 8;
        uint256 bit = index & 0xff;
        return (self.buckets[bucket] >> bit) & 1 == 1;
    }

    /// @notice Set a bit
    /// @param self The bitfield to modify
    /// @param index The global bit index
    /// @return changed True if the bit was newly set (was 0, now 1)
    function set(Bitfield storage self, uint256 index) internal returns (bool changed) {
        uint256 bucket = index >> 8;
        uint256 bit = index & 0xff;
        uint256 mask = 1 << bit;
        uint256 word = self.buckets[bucket];

        if (word & mask == 0) {
            self.buckets[bucket] = word | mask;
            self.count++;
            return true;
        }
        return false;
    }

    /// @notice Unset a bit
    /// @param self The bitfield to modify
    /// @param index The global bit index
    /// @return changed True if the bit was cleared (was 1, now 0)
    function unset(Bitfield storage self, uint256 index) internal returns (bool changed) {
        uint256 bucket = index >> 8;
        uint256 bit = index & 0xff;
        uint256 mask = 1 << bit;
        uint256 word = self.buckets[bucket];

        if (word & mask != 0) {
            self.buckets[bucket] = word & ~mask;
            self.count--;
            return true;
        }
        return false;
    }

    /// @notice Get the count of set bits
    /// @param self The bitfield to query
    /// @return The number of set bits
    function getCount(Bitfield storage self) internal view returns (uint256) {
        return self.count;
    }

    /// @notice Check multiple bits at once
    /// @param self The bitfield to query
    /// @param indices Array of global bit indices
    /// @return results Array of booleans
    function getBatch(
        Bitfield storage self,
        uint256[] memory indices
    ) internal view returns (bool[] memory results) {
        results = new bool[](indices.length);
        for (uint256 i = 0; i < indices.length; i++) {
            results[i] = get(self, indices[i]);
        }
    }

    // --- Registry operations ---

    /// @notice Set a bit in a registry entry
    /// @param self The registry
    /// @param key The registry key
    /// @param index The global bit index
    /// @return changed True if newly set
    function setInRegistry(
        BitfieldRegistry storage self,
        bytes32 key,
        uint256 index
    ) internal returns (bool changed) {
        return set(self.bitfields[key], index);
    }

    /// @notice Get a bit from a registry entry
    /// @param self The registry
    /// @param key The registry key
    /// @param index The global bit index
    /// @return True if set
    function getInRegistry(
        BitfieldRegistry storage self,
        bytes32 key,
        uint256 index
    ) internal view returns (bool) {
        return get(self.bitfields[key], index);
    }

    /// @notice Unset a bit in a registry entry
    /// @param self The registry
    /// @param key The registry key
    /// @param index The global bit index
    /// @return changed True if was set
    function unsetInRegistry(
        BitfieldRegistry storage self,
        bytes32 key,
        uint256 index
    ) internal returns (bool changed) {
        return unset(self.bitfields[key], index);
    }

    /// @notice Get count of set bits in a registry entry
    /// @param self The registry
    /// @param key The registry key
    /// @return The count of set bits
    function countInRegistry(
        BitfieldRegistry storage self,
        bytes32 key
    ) internal view returns (uint256) {
        return getCount(self.bitfields[key]);
    }
}
