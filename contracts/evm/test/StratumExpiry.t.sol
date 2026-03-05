// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumExpiry} from "../src/StratumExpiry.sol";

contract ExpiryHarness {
    using StratumExpiry for StratumExpiry.ExpiryRegistry;

    StratumExpiry.ExpiryRegistry internal registry;

    constructor() {
        registry.config = StratumExpiry.ExpiryConfig({
            minDeposit: 0.001 ether,
            minTTL: 60,           // 1 minute
            maxTTL: 365 days,
            cleanerRewardBps: 1000,  // 10%
            ownerRefundBps: 9000     // 90%
        });
    }

    function create(bytes32 entryId, address owner, uint32 ttlSeconds, uint128 deposit) external {
        registry.create(entryId, owner, ttlSeconds, deposit);
    }

    function extend(bytes32 entryId, uint32 additionalTTL, uint128 additionalDeposit) external {
        registry.extend(entryId, additionalTTL, additionalDeposit);
    }

    function isExpired(bytes32 entryId) external view returns (bool) {
        return registry.isExpired(entryId);
    }

    function cleanup(bytes32 entryId) external returns (uint128) {
        return registry.cleanup(entryId);
    }

    function voluntaryCleanup(bytes32 entryId) external returns (uint128) {
        return registry.voluntaryCleanup(entryId);
    }

    function getEntry(bytes32 entryId) external view returns (
        address owner, uint128 deposit, uint64 createdAt, uint64 expiresAt, bool exists
    ) {
        StratumExpiry.Entry storage entry = registry.getEntry(entryId);
        return (entry.owner, entry.deposit, entry.createdAt, entry.expiresAt, entry.exists);
    }
}

contract StratumExpiryTest is Test {
    ExpiryHarness harness;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        harness = new ExpiryHarness();
    }

    function test_create_entry() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.01 ether);

        (address owner, uint128 deposit, uint64 createdAt, uint64 expiresAt, bool exists) = harness.getEntry(id);
        assertEq(owner, alice);
        assertEq(deposit, 0.01 ether);
        assertTrue(exists);
        assertEq(expiresAt, createdAt + 3600);
    }

    function test_create_duplicate_reverts() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.01 ether);
        vm.expectRevert("StratumExpiry: entry exists");
        harness.create(id, bob, 3600, 0.01 ether);
    }

    function test_create_deposit_too_low() public {
        bytes32 id = keccak256("entry1");
        vm.expectRevert("StratumExpiry: deposit too low");
        harness.create(id, alice, 3600, 0.0001 ether);
    }

    function test_create_ttl_too_short() public {
        bytes32 id = keccak256("entry1");
        vm.expectRevert("StratumExpiry: TTL too short");
        harness.create(id, alice, 30, 0.01 ether); // min is 60
    }

    function test_isExpired_before_ttl() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.01 ether);
        assertFalse(harness.isExpired(id));
    }

    function test_isExpired_after_ttl() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.01 ether);

        vm.warp(block.timestamp + 3601);
        assertTrue(harness.isExpired(id));
    }

    function test_cleanup_expired() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.1 ether);

        vm.warp(block.timestamp + 3601);

        uint128 reward = harness.cleanup(id);
        // 10% of 0.1 ether = 0.01 ether
        assertEq(reward, 0.01 ether);

        // Entry should be deleted
        (, , , , bool exists) = harness.getEntry(id);
        assertFalse(exists);
    }

    function test_cleanup_not_expired_reverts() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.1 ether);

        vm.expectRevert("StratumExpiry: not expired");
        harness.cleanup(id);
    }

    function test_voluntary_cleanup() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.1 ether);

        vm.prank(alice);
        uint128 refund = harness.voluntaryCleanup(id);
        // 90% of 0.1 ether = 0.09 ether
        assertEq(refund, 0.09 ether);

        (, , , , bool exists) = harness.getEntry(id);
        assertFalse(exists);
    }

    function test_voluntary_cleanup_not_owner_reverts() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.1 ether);

        vm.prank(bob);
        vm.expectRevert("StratumExpiry: not owner");
        harness.voluntaryCleanup(id);
    }

    function test_extend_ttl() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.01 ether);

        (, , , uint64 originalExpiry, ) = harness.getEntry(id);

        vm.prank(alice);
        harness.extend(id, 1800, 0.005 ether);

        (, uint128 deposit, , uint64 newExpiry, ) = harness.getEntry(id);
        assertEq(newExpiry, originalExpiry + 1800);
        assertEq(deposit, 0.015 ether);
    }

    function test_extend_not_owner_reverts() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.01 ether);

        vm.prank(bob);
        vm.expectRevert("StratumExpiry: not owner");
        harness.extend(id, 1800, 0);
    }
}
