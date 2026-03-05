// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumEvents} from "../src/StratumEvents.sol";

contract EventsHarness {
    using StratumEvents for StratumEvents.HistorySummary;
    using StratumEvents for StratumEvents.RollingWindow;
    using StratumEvents for StratumEvents.SummaryRegistry;

    StratumEvents.HistorySummary internal summary;
    StratumEvents.SummaryRegistry internal registry;

    function addRecord(bytes32 summaryId, uint128 value, bytes memory data) external {
        summary.addRecord(summaryId, value, data);
    }

    function addRecordWithWindow(bytes32 summaryId, uint128 value, bytes memory data) external {
        summary.addRecordWithWindow(registry.windows[summaryId], summaryId, value, data);
    }

    function getSummary() external view returns (
        uint64 count, uint128 sum, uint128 min, uint128 max, bytes32 lastHash
    ) {
        return (summary.count, summary.sum, summary.min, summary.max, summary.lastHash);
    }

    function initWindow(bytes32 key, uint64 bucketSize, uint32 numBuckets) external {
        registry.initWindow(key, bucketSize, numBuckets);
    }

    function getWindowAggregate(bytes32 key, uint32 numBuckets) external view returns (uint64 count, uint128 sum) {
        return registry.windows[key].getWindowAggregate(numBuckets);
    }

    function verifyHashChain(
        bytes32 expectedHash,
        uint128[] memory values,
        bytes[] memory datas,
        bytes32 startHash
    ) external pure returns (bool) {
        return StratumEvents.verifyHashChain(expectedHash, values, datas, startHash);
    }
}

contract StratumEventsTest is Test {
    EventsHarness harness;
    bytes32 constant SUMMARY_ID = keccak256("test_summary");

    function setUp() public {
        harness = new EventsHarness();
    }

    // --- HistorySummary tests ---

    function test_addRecord_single() public {
        harness.addRecord(SUMMARY_ID, 100, "order_filled");

        (uint64 count, uint128 sum, uint128 min, uint128 max, bytes32 lastHash) = harness.getSummary();
        assertEq(count, 1);
        assertEq(sum, 100);
        assertEq(min, 100);
        assertEq(max, 100);
        assertTrue(lastHash != bytes32(0));
    }

    function test_addRecord_multiple() public {
        harness.addRecord(SUMMARY_ID, 100, "trade1");
        harness.addRecord(SUMMARY_ID, 50, "trade2");
        harness.addRecord(SUMMARY_ID, 200, "trade3");

        (uint64 count, uint128 sum, uint128 min, uint128 max, ) = harness.getSummary();
        assertEq(count, 3);
        assertEq(sum, 350);
        assertEq(min, 50);
        assertEq(max, 200);
    }

    function test_addRecord_emits_event() public {
        vm.expectEmit(true, false, false, false);
        emit StratumEvents.RecordAdded(SUMMARY_ID, 100, "data", bytes32(0), 0);
        harness.addRecord(SUMMARY_ID, 100, "data");
    }

    // --- Hash chain tests ---

    function test_hash_chain_verification() public {
        harness.addRecord(SUMMARY_ID, 100, "trade1");
        harness.addRecord(SUMMARY_ID, 200, "trade2");
        harness.addRecord(SUMMARY_ID, 300, "trade3");

        (, , , , bytes32 lastHash) = harness.getSummary();

        // Rebuild chain manually
        uint128[] memory values = new uint128[](3);
        values[0] = 100;
        values[1] = 200;
        values[2] = 300;

        bytes[] memory datas = new bytes[](3);
        datas[0] = "trade1";
        datas[1] = "trade2";
        datas[2] = "trade3";

        assertTrue(harness.verifyHashChain(lastHash, values, datas, bytes32(0)));
    }

    function test_hash_chain_wrong_values() public {
        harness.addRecord(SUMMARY_ID, 100, "trade1");
        harness.addRecord(SUMMARY_ID, 200, "trade2");

        (, , , , bytes32 lastHash) = harness.getSummary();

        uint128[] memory values = new uint128[](2);
        values[0] = 100;
        values[1] = 999; // wrong

        bytes[] memory datas = new bytes[](2);
        datas[0] = "trade1";
        datas[1] = "trade2";

        assertFalse(harness.verifyHashChain(lastHash, values, datas, bytes32(0)));
    }

    // --- Rolling window tests ---

    function test_rolling_window() public {
        harness.initWindow(SUMMARY_ID, 3600, 24); // 1-hour buckets, 24 buckets

        harness.addRecordWithWindow(SUMMARY_ID, 100, "trade1");
        harness.addRecordWithWindow(SUMMARY_ID, 200, "trade2");

        (uint64 count, uint128 sum) = harness.getWindowAggregate(SUMMARY_ID, 1);
        assertEq(count, 2);
        assertEq(sum, 300);
    }

    function test_rolling_window_multiple_buckets() public {
        harness.initWindow(SUMMARY_ID, 3600, 24);

        // Add in current bucket
        harness.addRecordWithWindow(SUMMARY_ID, 100, "trade1");

        // Move to next bucket
        vm.warp(block.timestamp + 3600);
        harness.addRecordWithWindow(SUMMARY_ID, 200, "trade2");

        // Aggregate across 2 buckets
        (uint64 count, uint128 sum) = harness.getWindowAggregate(SUMMARY_ID, 2);
        assertEq(count, 2);
        assertEq(sum, 300);

        // Aggregate across 1 bucket (current only)
        (uint64 count1, uint128 sum1) = harness.getWindowAggregate(SUMMARY_ID, 1);
        assertEq(count1, 1);
        assertEq(sum1, 200);
    }
}
