// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumBitfield} from "../../src/StratumBitfield.sol";
import {StratumMerkle} from "../../src/StratumMerkle.sol";
import {StratumEvents} from "../../src/StratumEvents.sol";

/// @title GasBenchmark
/// @notice Gas benchmarks comparing Stratum primitives vs naive approaches

contract NaiveBoolMapping {
    mapping(uint256 => bool) public flags;
    uint256 public count;

    function set(uint256 index) external {
        if (!flags[index]) {
            flags[index] = true;
            count++;
        }
    }

    function get(uint256 index) external view returns (bool) {
        return flags[index];
    }
}

contract NaiveRecordStorage {
    struct Record {
        uint128 value;
        bytes data;
        uint64 timestamp;
    }

    Record[] public records;
    uint128 public totalSum;

    function addRecord(uint128 value, bytes calldata data) external {
        records.push(Record({
            value: value,
            data: data,
            timestamp: uint64(block.timestamp)
        }));
        totalSum += value;
    }
}

contract BitfieldBenchHarness {
    using StratumBitfield for StratumBitfield.Bitfield;
    StratumBitfield.Bitfield internal bitfield;

    function set(uint256 index) external {
        bitfield.set(index);
    }

    function get(uint256 index) external view returns (bool) {
        return bitfield.get(index);
    }

    function count() external view returns (uint256) {
        return bitfield.getCount();
    }
}

contract EventsBenchHarness {
    using StratumEvents for StratumEvents.HistorySummary;
    StratumEvents.HistorySummary internal summary;

    function addRecord(uint128 value, bytes memory data) external {
        summary.addRecord(keccak256("bench"), value, data);
    }
}

contract GasBenchmarkTest is Test {
    NaiveBoolMapping naiveBool;
    BitfieldBenchHarness stratumBitfield;
    NaiveRecordStorage naiveRecords;
    EventsBenchHarness stratumEvents;

    function setUp() public {
        naiveBool = new NaiveBoolMapping();
        stratumBitfield = new BitfieldBenchHarness();
        naiveRecords = new NaiveRecordStorage();
        stratumEvents = new EventsBenchHarness();
    }

    /// @notice Benchmark: 256 sequential sets — Bitfield vs mapping(uint256 => bool)
    function test_benchmark_bitfield_vs_naive_256_sets() public {
        // Naive: mapping(uint256 => bool)
        uint256 gasBefore = gasleft();
        for (uint256 i = 0; i < 256; i++) {
            naiveBool.set(i);
        }
        uint256 naiveGas = gasBefore - gasleft();

        // Stratum Bitfield: mapping(uint256 => uint256)
        gasBefore = gasleft();
        for (uint256 i = 0; i < 256; i++) {
            stratumBitfield.set(i);
        }
        uint256 stratumGas = gasBefore - gasleft();

        emit log_named_uint("Naive bool mapping (256 sets)", naiveGas);
        emit log_named_uint("Stratum bitfield (256 sets)", stratumGas);
        emit log_named_uint("Savings (gas)", naiveGas - stratumGas);

        // Bitfield should be cheaper for 256 sequential sets (same storage slot)
        assertLt(stratumGas, naiveGas, "Bitfield should be cheaper than naive bool mapping");
    }

    /// @notice Benchmark: events vs storage for record keeping
    function test_benchmark_events_vs_storage_10_records() public {
        bytes memory data = "order_id=123,price=100,amount=50,maker=0xabc";

        // Naive: store each record
        uint256 gasBefore = gasleft();
        for (uint256 i = 0; i < 10; i++) {
            naiveRecords.addRecord(uint128(100 + i), data);
        }
        uint256 naiveGas = gasBefore - gasleft();

        // Stratum: events + summary
        gasBefore = gasleft();
        for (uint256 i = 0; i < 10; i++) {
            stratumEvents.addRecord(uint128(100 + i), data);
        }
        uint256 stratumGas = gasBefore - gasleft();

        emit log_named_uint("Naive storage (10 records)", naiveGas);
        emit log_named_uint("Stratum events (10 records)", stratumGas);
        emit log_named_uint("Savings (gas)", naiveGas - stratumGas);

        // Events should be significantly cheaper than storage
        assertLt(stratumGas, naiveGas, "Events should be cheaper than storage");
    }

    /// @notice Benchmark: Merkle proof verification for a tree of depth 17 (~100k entries)
    function test_benchmark_merkle_verify_depth_17() public {
        // Build a proof of depth 17 (simulating ~131k leaf tree)
        bytes32 leaf = StratumMerkle.hashLeaf("user_address_claim_data");
        bytes32 currentHash = leaf;

        bytes32[] memory proof = new bytes32[](17);
        for (uint256 i = 0; i < 17; i++) {
            proof[i] = keccak256(abi.encodePacked("sibling", i));
            currentHash = StratumMerkle.hashNode(currentHash, proof[i]);
        }
        bytes32 root = currentHash;

        uint256 gasBefore = gasleft();
        bool valid = StratumMerkle.verify(proof, root, leaf);
        uint256 verifyGas = gasBefore - gasleft();

        assertTrue(valid);
        emit log_named_uint("Merkle verify (depth 17, ~100k entries)", verifyGas);
    }

    /// @notice Benchmark: reads — bitfield get vs naive bool get
    function test_benchmark_read_bitfield_vs_naive() public {
        // Setup
        for (uint256 i = 0; i < 100; i++) {
            naiveBool.set(i);
            stratumBitfield.set(i);
        }

        // Read 100 entries — naive
        uint256 gasBefore = gasleft();
        for (uint256 i = 0; i < 100; i++) {
            naiveBool.get(i);
        }
        uint256 naiveGas = gasBefore - gasleft();

        // Read 100 entries — bitfield
        gasBefore = gasleft();
        for (uint256 i = 0; i < 100; i++) {
            stratumBitfield.get(i);
        }
        uint256 stratumGas = gasBefore - gasleft();

        emit log_named_uint("Naive bool read (100)", naiveGas);
        emit log_named_uint("Stratum bitfield read (100)", stratumGas);
    }
}
