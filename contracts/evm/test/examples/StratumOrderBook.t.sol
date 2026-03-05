// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {StratumOrderBook} from "../../examples/StratumOrderBook.sol";
import {StratumMerkle} from "../../src/StratumMerkle.sol";

contract StratumOrderBookTest is Test {
    StratumOrderBook orderBook;
    address authority;

    function setUp() public {
        authority = address(this);
        orderBook = new StratumOrderBook(30); // 30 bps fee
    }

    function test_createEpoch() public {
        orderBook.createEpoch();
        (bytes32 root, uint32 count, bool finalized) = orderBook.epochs(0);
        assertEq(root, bytes32(0));
        assertEq(count, 0);
        assertFalse(finalized);
    }

    function test_submitAndFinalizeEpoch() public {
        orderBook.createEpoch();

        // Build a simple 2-order merkle tree
        bytes memory order0 = abi.encodePacked("maker=alice,bid,price=100,amount=10");
        bytes memory order1 = abi.encodePacked("maker=bob,ask,price=95,amount=10");

        bytes32 leaf0 = StratumMerkle.hashLeaf(order0);
        bytes32 leaf1 = StratumMerkle.hashLeaf(order1);
        bytes32 root = StratumMerkle.hashNode(leaf0, leaf1);

        orderBook.submitEpochRoot(0, root, 2);

        (bytes32 storedRoot, uint32 count, ) = orderBook.epochs(0);
        assertEq(storedRoot, root);
        assertEq(count, 2);

        orderBook.finalizeEpoch(0);
        (, , bool finalized) = orderBook.epochs(0);
        assertTrue(finalized);
    }

    function test_settleMatch() public {
        orderBook.createEpoch();

        bytes memory order0 = abi.encodePacked("maker=alice,bid,price=100,amount=10");
        bytes memory order1 = abi.encodePacked("maker=bob,ask,price=95,amount=10");

        bytes32 leaf0 = StratumMerkle.hashLeaf(order0);
        bytes32 leaf1 = StratumMerkle.hashLeaf(order1);
        bytes32 root = StratumMerkle.hashNode(leaf0, leaf1);

        orderBook.submitEpochRoot(0, root, 2);
        orderBook.finalizeEpoch(0);

        // Settle: maker=0, taker=1
        bytes32[] memory makerProof = new bytes32[](1);
        makerProof[0] = leaf1;

        bytes32[] memory takerProof = new bytes32[](1);
        takerProof[0] = leaf0;

        orderBook.settleMatch(
            0,          // epoch
            0,          // makerIndex
            order0,     // makerLeafData
            makerProof,
            1,          // takerIndex
            order1,     // takerLeafData
            takerProof,
            10,         // fillAmount
            100         // fillPrice
        );

        assertTrue(orderBook.isSettled(0, 0, 1));
        assertEq(orderBook.totalSettlements(), 1);
    }

    function test_settleMatch_double_reverts() public {
        orderBook.createEpoch();

        bytes memory order0 = "order0";
        bytes memory order1 = "order1";

        bytes32 leaf0 = StratumMerkle.hashLeaf(order0);
        bytes32 leaf1 = StratumMerkle.hashLeaf(order1);
        bytes32 root = StratumMerkle.hashNode(leaf0, leaf1);

        orderBook.submitEpochRoot(0, root, 2);
        orderBook.finalizeEpoch(0);

        bytes32[] memory makerProof = new bytes32[](1);
        makerProof[0] = leaf1;
        bytes32[] memory takerProof = new bytes32[](1);
        takerProof[0] = leaf0;

        orderBook.settleMatch(0, 0, order0, makerProof, 1, order1, takerProof, 10, 100);

        vm.expectRevert("Already settled");
        orderBook.settleMatch(0, 0, order0, makerProof, 1, order1, takerProof, 10, 100);
    }

    function test_settleMatch_not_finalized_reverts() public {
        orderBook.createEpoch();

        bytes32[] memory proof = new bytes32[](0);

        vm.expectRevert("Epoch not finalized");
        orderBook.settleMatch(0, 0, "order0", proof, 1, "order1", proof, 10, 100);
    }

    function test_nonAuthority_reverts() public {
        address rando = address(0xDEAD);
        vm.prank(rando);
        vm.expectRevert("Not authority");
        orderBook.createEpoch();
    }
}
