// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumBitfield} from "../../src/StratumBitfield.sol";

contract BitfieldFuzzHarness {
    using StratumBitfield for StratumBitfield.Bitfield;

    StratumBitfield.Bitfield internal bitfield;

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
}

contract BitfieldFuzzTest is Test {
    BitfieldFuzzHarness harness;

    function setUp() public {
        harness = new BitfieldFuzzHarness();
    }

    /// @dev Setting a bit always makes it readable
    function testFuzz_set_then_get(uint256 index) public {
        index = bound(index, 0, type(uint128).max); // reasonable bound
        harness.set(index);
        assertTrue(harness.get(index));
    }

    /// @dev Setting then unsetting returns to false
    function testFuzz_set_unset_roundtrip(uint256 index) public {
        index = bound(index, 0, type(uint128).max);
        harness.set(index);
        harness.unset(index);
        assertFalse(harness.get(index));
    }

    /// @dev Count increments on set, decrements on unset
    function testFuzz_count_consistency(uint256 a, uint256 b) public {
        a = bound(a, 0, type(uint128).max);
        b = bound(b, 0, type(uint128).max);
        vm.assume(a != b);

        assertEq(harness.count(), 0);
        harness.set(a);
        assertEq(harness.count(), 1);
        harness.set(b);
        assertEq(harness.count(), 2);
        harness.unset(a);
        assertEq(harness.count(), 1);
        harness.unset(b);
        assertEq(harness.count(), 0);
    }

    /// @dev Double-set doesn't increment count
    function testFuzz_idempotent_set(uint256 index) public {
        index = bound(index, 0, type(uint128).max);
        assertTrue(harness.set(index));
        assertFalse(harness.set(index));
        assertEq(harness.count(), 1);
    }

    /// @dev Double-unset doesn't decrement count
    function testFuzz_idempotent_unset(uint256 index) public {
        index = bound(index, 0, type(uint128).max);
        harness.set(index);
        assertTrue(harness.unset(index));
        assertFalse(harness.unset(index));
        assertEq(harness.count(), 0);
    }

    /// @dev Setting one bit doesn't affect others in same bucket
    function testFuzz_isolation_within_bucket(uint8 bit1, uint8 bit2) public {
        vm.assume(bit1 != bit2);
        // Both bits are in bucket 0
        uint256 index1 = uint256(bit1);
        uint256 index2 = uint256(bit2);

        harness.set(index1);
        assertFalse(harness.get(index2));
        assertTrue(harness.get(index1));
    }
}
