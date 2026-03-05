// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumBitfield} from "../src/StratumBitfield.sol";

contract BitfieldHarness {
    using StratumBitfield for StratumBitfield.Bitfield;
    using StratumBitfield for StratumBitfield.BitfieldRegistry;

    StratumBitfield.Bitfield internal bitfield;
    StratumBitfield.BitfieldRegistry internal registry;

    function get(uint256 index) external view returns (bool) {
        return bitfield.get(index);
    }

    function set(uint256 index) external returns (bool) {
        return bitfield.set(index);
    }

    function unset(uint256 index) external returns (bool) {
        return bitfield.unset(index);
    }

    function count() external view returns (uint256) {
        return bitfield.getCount();
    }

    function getBatch(uint256[] memory indices) external view returns (bool[] memory) {
        return bitfield.getBatch(indices);
    }

    function setInRegistry(bytes32 key, uint256 index) external returns (bool) {
        return registry.setInRegistry(key, index);
    }

    function getInRegistry(bytes32 key, uint256 index) external view returns (bool) {
        return registry.getInRegistry(key, index);
    }

    function unsetInRegistry(bytes32 key, uint256 index) external returns (bool) {
        return registry.unsetInRegistry(key, index);
    }

    function countInRegistry(bytes32 key) external view returns (uint256) {
        return registry.countInRegistry(key);
    }
}

contract StratumBitfieldTest is Test {
    BitfieldHarness harness;

    function setUp() public {
        harness = new BitfieldHarness();
    }

    function test_set_and_get() public {
        assertFalse(harness.get(0));
        assertFalse(harness.get(100));
        assertFalse(harness.get(2047));

        harness.set(0);
        harness.set(100);
        harness.set(2047);

        assertTrue(harness.get(0));
        assertTrue(harness.get(100));
        assertTrue(harness.get(2047));
        assertFalse(harness.get(1));

        assertEq(harness.count(), 3);
    }

    function test_unset() public {
        harness.set(42);
        assertTrue(harness.get(42));
        assertEq(harness.count(), 1);

        harness.unset(42);
        assertFalse(harness.get(42));
        assertEq(harness.count(), 0);
    }

    function test_set_returns_changed() public {
        // First set returns true (newly set)
        assertTrue(harness.set(10));
        // Second set returns false (already set)
        assertFalse(harness.set(10));
    }

    function test_unset_returns_changed() public {
        harness.set(10);
        // First unset returns true (was set)
        assertTrue(harness.unset(10));
        // Second unset returns false (wasn't set)
        assertFalse(harness.unset(10));
    }

    function test_cross_bucket_boundaries() public {
        // Bucket 0: indices 0-255
        harness.set(255);
        assertTrue(harness.get(255));

        // Bucket 1: indices 256-511
        harness.set(256);
        assertTrue(harness.get(256));
        assertFalse(harness.get(257));

        // Large index (bucket 1000)
        harness.set(256000);
        assertTrue(harness.get(256000));

        assertEq(harness.count(), 3);
    }

    function test_all_bits_in_bucket() public {
        // Set all 256 bits in bucket 0
        for (uint256 i = 0; i < 256; i++) {
            harness.set(i);
        }
        assertEq(harness.count(), 256);

        // Verify all set
        for (uint256 i = 0; i < 256; i++) {
            assertTrue(harness.get(i));
        }

        // Bucket 1 should be untouched
        assertFalse(harness.get(256));
    }

    function test_getBatch() public {
        harness.set(0);
        harness.set(5);
        harness.set(100);

        uint256[] memory indices = new uint256[](4);
        indices[0] = 0;
        indices[1] = 1;
        indices[2] = 5;
        indices[3] = 100;

        bool[] memory results = harness.getBatch(indices);

        assertTrue(results[0]);    // 0 is set
        assertFalse(results[1]);   // 1 is not set
        assertTrue(results[2]);    // 5 is set
        assertTrue(results[3]);    // 100 is set
    }

    function test_registry_operations() public {
        bytes32 key1 = keccak256("domain1");
        bytes32 key2 = keccak256("domain2");

        // Set in different domains
        harness.setInRegistry(key1, 0);
        harness.setInRegistry(key2, 0);
        harness.setInRegistry(key1, 5);

        // Verify isolation
        assertTrue(harness.getInRegistry(key1, 0));
        assertTrue(harness.getInRegistry(key1, 5));
        assertTrue(harness.getInRegistry(key2, 0));
        assertFalse(harness.getInRegistry(key2, 5));

        // Counts are independent
        assertEq(harness.countInRegistry(key1), 2);
        assertEq(harness.countInRegistry(key2), 1);

        // Unset in one domain doesn't affect other
        harness.unsetInRegistry(key1, 0);
        assertFalse(harness.getInRegistry(key1, 0));
        assertTrue(harness.getInRegistry(key2, 0));
    }

    function test_sequential_sets_gas() public {
        // Set 256 sequential bits — should use one storage slot
        for (uint256 i = 0; i < 256; i++) {
            harness.set(i);
        }
        assertEq(harness.count(), 256);
    }
}
