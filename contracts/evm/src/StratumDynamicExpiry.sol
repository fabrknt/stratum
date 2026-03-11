// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StratumDynamicExpiry
/// @notice Dynamic cleanup reward scaling based on time elapsed since expiry,
///         current gas price, and deposit size. Replaces static cleanerRewardBps
///         with a three-factor model ensuring cleanup always remains profitable.
library StratumDynamicExpiry {
    /// @notice Configuration for dynamic expiry with escalating rewards
    struct DynamicExpiryConfig {
        uint128 minDeposit;
        uint32 minTTL;
        uint32 maxTTL;
        /// @dev Base reward in bps (floor, e.g. 100 = 1%)
        uint16 baseRewardBps;
        /// @dev Maximum reward in bps (cap, e.g. 5000 = 50%)
        uint16 maxRewardBps;
        /// @dev Refund bps for voluntary owner cleanup
        uint16 ownerRefundBps;
        /// @dev Seconds after expiry for reward to escalate from base to max
        uint32 escalationPeriod;
        /// @dev Multiplier for gas cost coverage in bps (e.g. 15000 = 1.5x gas cost)
        uint64 gasRewardMultiplier;
    }

    /// @notice A single expirable entry with dynamic reward
    struct DynamicEntry {
        address owner;
        uint128 deposit;
        uint64 createdAt;
        uint64 expiresAt;
        bool exists;
    }

    /// @notice Registry of dynamic expirable entries
    struct DynamicExpiryRegistry {
        DynamicExpiryConfig config;
        mapping(bytes32 => DynamicEntry) entries;
    }

    // --- Events ---

    event EntryCreated(bytes32 indexed entryId, address indexed owner, uint128 deposit, uint64 expiresAt);
    event EntryExtended(bytes32 indexed entryId, uint64 newExpiresAt, uint128 additionalDeposit);
    event EntryCleanedUp(
        bytes32 indexed entryId,
        address indexed cleaner,
        uint128 totalReward,
        uint128 gasComponent,
        uint128 timeComponent
    );
    event EntryVoluntaryCleanup(bytes32 indexed entryId, address indexed owner, uint128 refund);

    // --- Core operations ---

    /// @notice Create a new expirable entry
    function create(
        DynamicExpiryRegistry storage self,
        bytes32 entryId,
        address owner,
        uint32 ttlSeconds,
        uint128 deposit
    ) internal {
        require(!self.entries[entryId].exists, "StratumDynamicExpiry: entry exists");
        require(self.config.maxRewardBps >= self.config.baseRewardBps, "StratumDynamicExpiry: max < base reward");
        require(deposit >= self.config.minDeposit, "StratumDynamicExpiry: deposit too low");
        require(ttlSeconds >= self.config.minTTL, "StratumDynamicExpiry: TTL too short");
        require(ttlSeconds <= self.config.maxTTL, "StratumDynamicExpiry: TTL too long");

        uint64 expiresAt = uint64(block.timestamp) + uint64(ttlSeconds);

        self.entries[entryId] = DynamicEntry({
            owner: owner,
            deposit: deposit,
            createdAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            exists: true
        });

        emit EntryCreated(entryId, owner, deposit, expiresAt);
    }

    /// @notice Extend an entry's TTL with additional deposit
    function extend(
        DynamicExpiryRegistry storage self,
        bytes32 entryId,
        uint32 additionalTTL,
        uint128 additionalDeposit
    ) internal {
        require(additionalTTL > 0, "StratumDynamicExpiry: zero TTL extension");
        DynamicEntry storage entry = self.entries[entryId];
        require(entry.exists, "StratumDynamicExpiry: entry not found");
        require(msg.sender == entry.owner, "StratumDynamicExpiry: not owner");

        uint64 newExpiresAt = entry.expiresAt + uint64(additionalTTL);
        uint64 maxExpiry = uint64(block.timestamp) + uint64(self.config.maxTTL);
        require(newExpiresAt <= maxExpiry, "StratumDynamicExpiry: exceeds max TTL");

        entry.expiresAt = newExpiresAt;
        entry.deposit += additionalDeposit;

        emit EntryExtended(entryId, newExpiresAt, additionalDeposit);
    }

    /// @notice Check if an entry is expired
    function isExpired(DynamicExpiryRegistry storage self, bytes32 entryId) internal view returns (bool) {
        DynamicEntry storage entry = self.entries[entryId];
        if (!entry.exists) return false;
        return block.timestamp > entry.expiresAt;
    }

    /// @notice Calculate dynamic cleanup reward with three components:
    ///         1. Time escalation (base -> max over escalationPeriod)
    ///         2. Gas cost coverage (tx.gasprice * estimated gas * multiplier)
    ///         3. Cap at maxRewardBps of deposit
    function calculateDynamicReward(
        DynamicExpiryConfig storage config,
        DynamicEntry storage entry
    ) internal view returns (uint128 totalReward, uint128 gasComponent, uint128 timeComponent) {
        uint256 deposit = uint256(entry.deposit);

        // 1. Base reward
        uint256 baseReward = (deposit * config.baseRewardBps) / 10000;

        // 2. Time escalation: linearly increase from base to max over escalationPeriod
        uint256 overdueSeconds = block.timestamp - entry.expiresAt;
        uint256 escalation = 0;
        if (config.escalationPeriod > 0) {
            uint256 factor = overdueSeconds >= config.escalationPeriod
                ? 10000
                : (overdueSeconds * 10000) / config.escalationPeriod;
            uint256 bonusBps = uint256(config.maxRewardBps - config.baseRewardBps) * factor / 10000;
            escalation = (deposit * bonusBps) / 10000;
        }
        uint256 _timeComp = baseReward + escalation;
        require(_timeComp <= type(uint128).max, "StratumDynamicExpiry: time overflow");
        timeComponent = uint128(_timeComp);

        // 3. Gas cost coverage
        uint256 estimatedGas = 200_000; // conservative estimate for cleanup tx
        uint256 gasCost = tx.gasprice * estimatedGas;
        uint256 _gasComp = (gasCost * config.gasRewardMultiplier) / 10000;
        require(_gasComp <= type(uint128).max, "StratumDynamicExpiry: gas overflow");
        gasComponent = uint128(_gasComp);

        // Total = max(timeComponent, gasComponent), capped at maxRewardBps
        totalReward = timeComponent > gasComponent ? timeComponent : gasComponent;
        uint256 maxReward = (deposit * config.maxRewardBps) / 10000;
        if (uint256(totalReward) > maxReward) {
            require(maxReward <= type(uint128).max, "StratumDynamicExpiry: max overflow");
            totalReward = uint128(maxReward);
        }
    }

    /// @notice Cleanup an expired entry with dynamic reward
    function cleanup(
        DynamicExpiryRegistry storage self,
        bytes32 entryId
    ) internal returns (uint128 cleanerReward) {
        DynamicEntry storage entry = self.entries[entryId];
        require(entry.exists, "StratumDynamicExpiry: entry not found");
        require(block.timestamp > entry.expiresAt, "StratumDynamicExpiry: not expired");

        (uint128 reward, uint128 gasComp, uint128 timeComp) = calculateDynamicReward(self.config, entry);

        // Clear entry
        delete self.entries[entryId];

        emit EntryCleanedUp(entryId, msg.sender, reward, gasComp, timeComp);
        return reward;
    }

    /// @notice Owner voluntarily cleans up their entry
    function voluntaryCleanup(
        DynamicExpiryRegistry storage self,
        bytes32 entryId
    ) internal returns (uint128 ownerRefund) {
        DynamicEntry storage entry = self.entries[entryId];
        require(entry.exists, "StratumDynamicExpiry: entry not found");
        require(msg.sender == entry.owner, "StratumDynamicExpiry: not owner");

        uint128 deposit = entry.deposit;
        ownerRefund = uint128((uint256(deposit) * self.config.ownerRefundBps) / 10000);

        // Clear entry
        delete self.entries[entryId];

        emit EntryVoluntaryCleanup(entryId, msg.sender, ownerRefund);
        return ownerRefund;
    }

    /// @notice Get entry details
    function getEntry(
        DynamicExpiryRegistry storage self,
        bytes32 entryId
    ) internal view returns (DynamicEntry storage entry) {
        return self.entries[entryId];
    }

    /// @notice Estimate reward without executing (view function for off-chain estimation)
    function estimateReward(
        DynamicExpiryRegistry storage self,
        bytes32 entryId
    ) internal view returns (uint128 totalReward, uint128 gasComponent, uint128 timeComponent) {
        DynamicEntry storage entry = self.entries[entryId];
        require(entry.exists, "StratumDynamicExpiry: entry not found");
        if (block.timestamp <= entry.expiresAt) {
            return (0, 0, 0);
        }
        return calculateDynamicReward(self.config, entry);
    }
}
