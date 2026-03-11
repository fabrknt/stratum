// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StratumEvents
/// @notice Events-over-storage pattern. Keeps 88-byte HistorySummary on-chain (3 slots),
///         emits rich data in LOG events (20-30x cheaper than storage).
/// @dev Rolling window aggregation for time-bucketed statistics.
library StratumEvents {
    /// @notice On-chain summary — compact aggregate of all records
    /// @dev Fits in 3 storage slots (96 bytes)
    struct HistorySummary {
        uint64 count;
        uint128 sum;
        uint128 min;
        uint128 max;
        bytes32 lastHash;  // hash chain: keccak256(prevHash || value || data)
    }

    /// @notice Rolling window for time-bucketed aggregation
    struct RollingWindow {
        uint64 bucketSize;       // seconds per bucket
        uint64 startTimestamp;   // when window started
        uint32 numBuckets;       // number of buckets
        mapping(uint256 => WindowBucket) buckets;
    }

    /// @notice A single time bucket in the rolling window
    struct WindowBucket {
        uint64 count;
        uint128 sum;
    }

    /// @notice Registry of summaries keyed by bytes32
    struct SummaryRegistry {
        mapping(bytes32 => HistorySummary) summaries;
        mapping(bytes32 => RollingWindow) windows;
    }

    // --- Events ---

    /// @notice Emitted for each record — rich data lives in logs, not storage
    event RecordAdded(
        bytes32 indexed summaryId,
        uint128 value,
        bytes data,
        bytes32 newHash,
        uint64 count
    );

    // --- Core operations ---

    /// @notice Add a record: update on-chain summary + emit event
    /// @param self The summary to update
    /// @param summaryId Identifier for event indexing
    /// @param value The numeric value to aggregate
    /// @param data Arbitrary data to emit (stored in logs only)
    function addRecord(
        HistorySummary storage self,
        bytes32 summaryId,
        uint128 value,
        bytes memory data
    ) internal {
        self.count++;
        self.sum += value;

        if (self.count == 1) {
            self.min = value;
            self.max = value;
        } else {
            if (value < self.min) self.min = value;
            if (value > self.max) self.max = value;
        }

        // Hash chain: H(prevHash || value || data)
        self.lastHash = keccak256(abi.encodePacked(self.lastHash, value, data));

        emit RecordAdded(summaryId, value, data, self.lastHash, self.count);
    }

    /// @notice Add a record and update rolling window
    /// @param self The summary to update
    /// @param window The rolling window to update
    /// @param summaryId Identifier for event indexing
    /// @param value The numeric value
    /// @param data Arbitrary data
    function addRecordWithWindow(
        HistorySummary storage self,
        RollingWindow storage window,
        bytes32 summaryId,
        uint128 value,
        bytes memory data
    ) internal {
        addRecord(self, summaryId, value, data);

        // Update rolling window bucket
        if (window.bucketSize > 0) {
            require(block.timestamp >= window.startTimestamp, "StratumEvents: timestamp before window start");
            uint256 bucketIndex = (block.timestamp - window.startTimestamp) / window.bucketSize;
            bucketIndex = bucketIndex % window.numBuckets; // circular buffer
            window.buckets[bucketIndex].count++;
            window.buckets[bucketIndex].sum += value;
        }
    }

    /// @notice Get aggregate across N most recent window buckets
    /// @param window The rolling window
    /// @param numBuckets How many buckets to aggregate
    /// @return count Total count across buckets
    /// @return sum Total sum across buckets
    function getWindowAggregate(
        RollingWindow storage window,
        uint32 numBuckets
    ) internal view returns (uint64 count, uint128 sum) {
        if (window.bucketSize == 0) return (0, 0);
        require(block.timestamp >= window.startTimestamp, "StratumEvents: timestamp before window start");

        uint256 currentBucket = (block.timestamp - window.startTimestamp) / window.bucketSize;
        uint32 bucketsToRead = numBuckets > window.numBuckets ? window.numBuckets : numBuckets;
        // Cap at available buckets to prevent underflow when currentBucket < bucketsToRead
        if (bucketsToRead > currentBucket + 1) {
            bucketsToRead = uint32(currentBucket + 1);
        }

        for (uint32 i = 0; i < bucketsToRead; i++) {
            uint256 idx = (currentBucket - i) % window.numBuckets;
            count += window.buckets[idx].count;
            sum += window.buckets[idx].sum;
        }
    }

    /// @notice Verify a hash chain by replaying values
    /// @param expectedHash The expected final hash
    /// @param values Array of values in order
    /// @param datas Array of data payloads in order
    /// @param startHash Starting hash (bytes32(0) for genesis)
    /// @return True if the chain is valid
    function verifyHashChain(
        bytes32 expectedHash,
        uint128[] memory values,
        bytes[] memory datas,
        bytes32 startHash
    ) internal pure returns (bool) {
        require(values.length == datas.length, "StratumEvents: length mismatch");

        bytes32 computedHash = startHash;
        for (uint256 i = 0; i < values.length; i++) {
            computedHash = keccak256(abi.encodePacked(computedHash, values[i], datas[i]));
        }

        return computedHash == expectedHash;
    }

    // --- Registry operations ---

    /// @notice Initialize a rolling window in the registry
    /// @param self The registry
    /// @param key The summary key
    /// @param bucketSize Seconds per bucket
    /// @param numBuckets Number of buckets
    function initWindow(
        SummaryRegistry storage self,
        bytes32 key,
        uint64 bucketSize,
        uint32 numBuckets
    ) internal {
        RollingWindow storage window = self.windows[key];
        window.bucketSize = bucketSize;
        window.startTimestamp = uint64(block.timestamp);
        window.numBuckets = numBuckets;
    }
}
