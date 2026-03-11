// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumDynamicExpiry} from "../src/StratumDynamicExpiry.sol";

contract DynamicExpiryHarness {
    using StratumDynamicExpiry for StratumDynamicExpiry.DynamicExpiryRegistry;

    StratumDynamicExpiry.DynamicExpiryRegistry internal registry;

    constructor() {
        registry.config = StratumDynamicExpiry.DynamicExpiryConfig({
            minDeposit: 0.001 ether,
            minTTL: 60,
            maxTTL: 365 days,
            baseRewardBps: 100,        // 1%
            maxRewardBps: 5000,        // 50%
            ownerRefundBps: 9000,      // 90%
            escalationPeriod: 86400,   // 24 hours
            gasRewardMultiplier: 15000 // 1.5x
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

    function estimateReward(bytes32 entryId) external view returns (uint128 total, uint128 gas_, uint128 time_) {
        return registry.estimateReward(entryId);
    }

    function getEntry(bytes32 entryId) external view returns (
        address owner, uint128 deposit, uint64 createdAt, uint64 expiresAt, bool exists
    ) {
        StratumDynamicExpiry.DynamicEntry storage entry = registry.getEntry(entryId);
        return (entry.owner, entry.deposit, entry.createdAt, entry.expiresAt, entry.exists);
    }
}

contract StratumDynamicExpiryTest is Test {
    DynamicExpiryHarness harness;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        harness = new DynamicExpiryHarness();
    }

    // --- Basic CRUD ---

    function test_create_entry() public {
        bytes32 id = keccak256("entry1");
        harness.create(id, alice, 3600, 0.01 ether);

        (address owner, uint128 deposit, , uint64 expiresAt, bool exists) = harness.getEntry(id);
        assertEq(owner, alice);
        assertEq(deposit, 0.01 ether);
        assertTrue(exists);
        assertGt(expiresAt, uint64(block.timestamp));
    }

    function test_create_duplicate_reverts() public {
        bytes32 id = keccak256("dup");
        harness.create(id, alice, 3600, 0.01 ether);
        vm.expectRevert("StratumDynamicExpiry: entry exists");
        harness.create(id, bob, 3600, 0.01 ether);
    }

    function test_create_deposit_too_low() public {
        bytes32 id = keccak256("low");
        vm.expectRevert("StratumDynamicExpiry: deposit too low");
        harness.create(id, alice, 3600, 0.0001 ether);
    }

    function test_create_ttl_too_short() public {
        bytes32 id = keccak256("short");
        vm.expectRevert("StratumDynamicExpiry: TTL too short");
        harness.create(id, alice, 30, 0.01 ether);
    }

    function test_create_ttl_too_long() public {
        bytes32 id = keccak256("long");
        vm.expectRevert("StratumDynamicExpiry: TTL too long");
        harness.create(id, alice, uint32(366 days), 0.01 ether);
    }

    // --- Expiry ---

    function test_isExpired_before_ttl() public {
        bytes32 id = keccak256("notyet");
        harness.create(id, alice, 3600, 0.01 ether);
        assertFalse(harness.isExpired(id));
    }

    function test_isExpired_after_ttl() public {
        bytes32 id = keccak256("expired");
        harness.create(id, alice, 3600, 0.01 ether);
        vm.warp(block.timestamp + 3601);
        assertTrue(harness.isExpired(id));
    }

    // --- Dynamic Reward Escalation ---

    function test_reward_base_right_after_expiry() public {
        bytes32 id = keccak256("base");
        harness.create(id, alice, 3600, 1 ether);

        vm.warp(block.timestamp + 3601); // 1 second overdue

        (uint128 total, uint128 gasComp, uint128 timeComp) = harness.estimateReward(id);

        // Base reward = 1% of 1 ether = 0.01 ether
        // Time bonus is nearly zero (1 second out of 86400)
        assertGe(timeComp, 0.01 ether);
        assertLt(timeComp, 0.011 ether); // small escalation above base
        assertGt(total, 0);
    }

    function test_reward_half_escalation() public {
        bytes32 id = keccak256("half");
        harness.create(id, alice, 3600, 1 ether);

        // Warp to 12 hours overdue (half of 24h escalation period)
        vm.warp(block.timestamp + 3600 + 43200);

        (, , uint128 timeComp) = harness.estimateReward(id);

        // At 50% escalation: base(1%) + 50% of bonus(49%) = ~25.5%
        // Expected: ~0.255 ether
        assertGe(timeComp, 0.24 ether);
        assertLe(timeComp, 0.26 ether);
    }

    function test_reward_full_escalation() public {
        bytes32 id = keccak256("full");
        harness.create(id, alice, 3600, 1 ether);

        // Warp past full escalation period
        vm.warp(block.timestamp + 3600 + 86400);

        (, , uint128 timeComp) = harness.estimateReward(id);

        // Full escalation: base(1%) + bonus(49%) = 50% = 0.5 ether
        assertEq(timeComp, 0.5 ether);
    }

    function test_reward_capped_at_max() public {
        bytes32 id = keccak256("cap");
        harness.create(id, alice, 3600, 1 ether);

        // Way past escalation period
        vm.warp(block.timestamp + 3600 + 86400 * 10);

        (uint128 total, , ) = harness.estimateReward(id);

        // Should be capped at maxRewardBps = 50%
        assertLe(total, 0.5 ether);
    }

    function test_reward_gas_component() public {
        bytes32 id = keccak256("gas");
        harness.create(id, alice, 3600, 100 ether);

        vm.warp(block.timestamp + 3601);
        vm.txGasPrice(100 gwei);

        (, uint128 gasComp, ) = harness.estimateReward(id);

        // gas = 100 gwei * 200000 * 15000 / 10000 = 0.03 ether
        assertEq(gasComp, 0.03 ether);
    }

    function test_reward_takes_max_of_time_and_gas() public {
        bytes32 id = keccak256("maxof");
        harness.create(id, alice, 3600, 100 ether);

        // Small overdue => low time component
        vm.warp(block.timestamp + 3601);
        // High gas price => high gas component
        vm.txGasPrice(100 gwei);

        (uint128 total, uint128 gasComp, uint128 timeComp) = harness.estimateReward(id);

        // total should be max(time, gas)
        if (gasComp > timeComp) {
            assertEq(total, gasComp);
        } else {
            assertEq(total, timeComp);
        }
    }

    // --- Cleanup ---

    function test_cleanup_returns_dynamic_reward() public {
        bytes32 id = keccak256("cleanup");
        harness.create(id, alice, 3600, 1 ether);

        vm.warp(block.timestamp + 3600 + 43200); // 12h overdue

        uint128 reward = harness.cleanup(id);
        assertGt(reward, 0);

        // Entry should be deleted
        (, , , , bool exists) = harness.getEntry(id);
        assertFalse(exists);
    }

    function test_cleanup_not_expired_reverts() public {
        bytes32 id = keccak256("notexpired");
        harness.create(id, alice, 3600, 1 ether);

        vm.expectRevert("StratumDynamicExpiry: not expired");
        harness.cleanup(id);
    }

    function test_cleanup_nonexistent_reverts() public {
        bytes32 id = keccak256("ghost");
        vm.expectRevert("StratumDynamicExpiry: entry not found");
        harness.cleanup(id);
    }

    // --- Voluntary Cleanup ---

    function test_voluntary_cleanup_returns_refund() public {
        bytes32 id = keccak256("voluntary");
        harness.create(id, alice, 3600, 1 ether);

        vm.prank(alice);
        uint128 refund = harness.voluntaryCleanup(id);

        // 90% of 1 ether = 0.9 ether
        assertEq(refund, 0.9 ether);

        (, , , , bool exists) = harness.getEntry(id);
        assertFalse(exists);
    }

    function test_voluntary_cleanup_not_owner_reverts() public {
        bytes32 id = keccak256("notmine");
        harness.create(id, alice, 3600, 1 ether);

        vm.prank(bob);
        vm.expectRevert("StratumDynamicExpiry: not owner");
        harness.voluntaryCleanup(id);
    }

    // --- Extension ---

    function test_extend_ttl() public {
        bytes32 id = keccak256("ext");
        harness.create(id, alice, 3600, 0.01 ether);

        (, , , uint64 originalExpiry, ) = harness.getEntry(id);

        vm.prank(alice);
        harness.extend(id, 1800, 0.005 ether);

        (, uint128 deposit, , uint64 newExpiry, ) = harness.getEntry(id);
        assertEq(newExpiry, originalExpiry + 1800);
        assertEq(deposit, 0.015 ether);
    }

    function test_extend_not_owner_reverts() public {
        bytes32 id = keccak256("extno");
        harness.create(id, alice, 3600, 0.01 ether);

        vm.prank(bob);
        vm.expectRevert("StratumDynamicExpiry: not owner");
        harness.extend(id, 1800, 0);
    }

    // --- Estimate before expiry returns zero ---

    function test_estimateReward_before_expiry() public {
        bytes32 id = keccak256("notdue");
        harness.create(id, alice, 3600, 1 ether);

        (uint128 total, uint128 gasComp, uint128 timeComp) = harness.estimateReward(id);
        assertEq(total, 0);
        assertEq(gasComp, 0);
        assertEq(timeComp, 0);
    }
}
