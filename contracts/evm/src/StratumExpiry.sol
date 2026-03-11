// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StratumExpiry
/// @notice Deposit-based cleanup replacing Solana's rent model.
///         Users deposit ETH when creating entries. After TTL, anyone can cleanup
///         and claim a portion of the deposit as reward.
library StratumExpiry {
    /// @notice Configuration for an expiry registry
    struct ExpiryConfig {
        uint128 minDeposit;
        uint32 minTTL;
        uint32 maxTTL;
        /// @dev Basis points (0-10000) of deposit given to cleaner
        uint16 cleanerRewardBps;
        /// @dev Basis points (0-10000) refunded on voluntary cleanup
        uint16 ownerRefundBps;
    }

    /// @notice A single expirable entry
    struct Entry {
        address owner;
        uint128 deposit;
        uint64 createdAt;
        uint64 expiresAt;
        bool exists;
    }

    /// @notice Registry of expirable entries
    struct ExpiryRegistry {
        ExpiryConfig config;
        mapping(bytes32 => Entry) entries;
    }

    // --- Events ---

    event EntryCreated(bytes32 indexed entryId, address indexed owner, uint128 deposit, uint64 expiresAt);
    event EntryExtended(bytes32 indexed entryId, uint64 newExpiresAt, uint128 additionalDeposit);
    event EntryCleanedUp(bytes32 indexed entryId, address indexed cleaner, uint128 reward);
    event EntryVoluntaryCleanup(bytes32 indexed entryId, address indexed owner, uint128 refund);

    // --- Core operations ---

    /// @notice Create a new expirable entry
    /// @param self The registry
    /// @param entryId Unique identifier for the entry
    /// @param owner The owner of the entry
    /// @param ttlSeconds Time-to-live in seconds
    /// @param deposit The ETH deposit amount
    function create(
        ExpiryRegistry storage self,
        bytes32 entryId,
        address owner,
        uint32 ttlSeconds,
        uint128 deposit
    ) internal {
        require(!self.entries[entryId].exists, "StratumExpiry: entry exists");
        require(deposit >= self.config.minDeposit, "StratumExpiry: deposit too low");
        require(ttlSeconds >= self.config.minTTL, "StratumExpiry: TTL too short");
        require(ttlSeconds <= self.config.maxTTL, "StratumExpiry: TTL too long");

        uint64 expiresAt = uint64(block.timestamp) + uint64(ttlSeconds);

        self.entries[entryId] = Entry({
            owner: owner,
            deposit: deposit,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            exists: true
        });

        emit EntryCreated(entryId, owner, deposit, expiresAt);
    }

    /// @notice Extend an entry's TTL with additional deposit
    /// @param self The registry
    /// @param entryId The entry to extend
    /// @param additionalTTL Additional seconds to add
    /// @param additionalDeposit Additional deposit
    function extend(
        ExpiryRegistry storage self,
        bytes32 entryId,
        uint32 additionalTTL,
        uint128 additionalDeposit
    ) internal {
        require(additionalTTL > 0, "StratumExpiry: zero TTL extension");
        Entry storage entry = self.entries[entryId];
        require(entry.exists, "StratumExpiry: entry not found");
        require(msg.sender == entry.owner, "StratumExpiry: not owner");

        uint64 newExpiresAt = entry.expiresAt + uint64(additionalTTL);
        uint64 maxExpiry = uint64(block.timestamp) + uint64(self.config.maxTTL);
        require(newExpiresAt <= maxExpiry, "StratumExpiry: exceeds max TTL");

        entry.expiresAt = newExpiresAt;
        entry.deposit += additionalDeposit;

        emit EntryExtended(entryId, newExpiresAt, additionalDeposit);
    }

    /// @notice Check if an entry is expired
    /// @param self The registry
    /// @param entryId The entry to check
    /// @return True if expired
    function isExpired(ExpiryRegistry storage self, bytes32 entryId) internal view returns (bool) {
        Entry storage entry = self.entries[entryId];
        if (!entry.exists) return false;
        return block.timestamp > entry.expiresAt;
    }

    /// @notice Cleanup an expired entry — anyone can call, cleaner gets reward
    /// @param self The registry
    /// @param entryId The entry to cleanup
    /// @return cleanerReward The reward amount for the cleaner
    function cleanup(
        ExpiryRegistry storage self,
        bytes32 entryId
    ) internal returns (uint128 cleanerReward) {
        Entry storage entry = self.entries[entryId];
        require(entry.exists, "StratumExpiry: entry not found");
        require(block.timestamp > entry.expiresAt, "StratumExpiry: not expired");

        uint128 deposit = entry.deposit;
        cleanerReward = uint128((uint256(deposit) * self.config.cleanerRewardBps) / 10000);

        // Clear entry
        delete self.entries[entryId];

        emit EntryCleanedUp(entryId, msg.sender, cleanerReward);
        return cleanerReward;
    }

    /// @notice Owner voluntarily cleans up their entry — higher refund than cleaner reward
    /// @param self The registry
    /// @param entryId The entry to cleanup
    /// @return ownerRefund The refund amount for the owner
    function voluntaryCleanup(
        ExpiryRegistry storage self,
        bytes32 entryId
    ) internal returns (uint128 ownerRefund) {
        Entry storage entry = self.entries[entryId];
        require(entry.exists, "StratumExpiry: entry not found");
        require(msg.sender == entry.owner, "StratumExpiry: not owner");

        uint128 deposit = entry.deposit;
        ownerRefund = uint128((uint256(deposit) * self.config.ownerRefundBps) / 10000);

        // Clear entry
        delete self.entries[entryId];

        emit EntryVoluntaryCleanup(entryId, msg.sender, ownerRefund);
        return ownerRefund;
    }

    /// @notice Get entry details
    /// @param self The registry
    /// @param entryId The entry to query
    /// @return entry The entry data
    function getEntry(
        ExpiryRegistry storage self,
        bytes32 entryId
    ) internal view returns (Entry storage entry) {
        return self.entries[entryId];
    }
}
