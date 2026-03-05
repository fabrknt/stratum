// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {MerkleAirdrop} from "../../examples/MerkleAirdrop.sol";
import {StratumMerkle} from "../../src/StratumMerkle.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MCK") {
        _mint(msg.sender, 1_000_000 ether);
    }
}

contract MerkleAirdropTest is Test {
    MerkleAirdrop airdrop;
    MockToken token;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address charlie = address(0xC4A5);

    bytes32 campaignId = keccak256("campaign_1");

    // Merkle tree: 3 leaves (index || address)
    bytes32 leaf0;
    bytes32 leaf1;
    bytes32 leaf2;
    bytes32 node01;
    bytes32 node2dup;
    bytes32 root;

    function setUp() public {
        airdrop = new MerkleAirdrop();
        token = new MockToken();

        // Build merkle tree for 3 recipients
        leaf0 = StratumMerkle.hashLeaf(abi.encodePacked(uint256(0), alice));
        leaf1 = StratumMerkle.hashLeaf(abi.encodePacked(uint256(1), bob));
        leaf2 = StratumMerkle.hashLeaf(abi.encodePacked(uint256(2), charlie));

        node01 = StratumMerkle.hashNode(leaf0, leaf1);
        node2dup = StratumMerkle.hashNode(leaf2, leaf2); // odd leaf duplicated
        root = StratumMerkle.hashNode(node01, node2dup);
    }

    function _createCampaign() internal {
        uint128 amountPerClaim = 100 ether;
        uint64 totalRecipients = 3;
        uint256 totalAmount = uint256(totalRecipients) * uint256(amountPerClaim);

        token.approve(address(airdrop), totalAmount);
        airdrop.createCampaign(
            campaignId,
            token,
            root,
            totalRecipients,
            amountPerClaim,
            uint32(30 days)
        );
    }

    function test_createCampaign() public {
        _createCampaign();

        (,, uint128 recipients, uint128 amount, , bool isActive) = airdrop.campaigns(campaignId);
        assertEq(recipients, 3);
        assertEq(amount, 100 ether);
        assertTrue(isActive);
    }

    function test_claim() public {
        _createCampaign();

        // Alice claims at index 0
        assertFalse(airdrop.isClaimed(campaignId, 0));

        bytes32[] memory proof = new bytes32[](2);
        proof[0] = leaf1;       // sibling of leaf0
        proof[1] = node2dup;    // sibling of node01

        vm.prank(alice);
        airdrop.claim(campaignId, 0, proof);

        assertTrue(airdrop.isClaimed(campaignId, 0));
        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(airdrop.claimCount(campaignId), 1);
    }

    function test_claim_double_reverts() public {
        _createCampaign();

        bytes32[] memory proof = new bytes32[](2);
        proof[0] = leaf1;
        proof[1] = node2dup;

        vm.prank(alice);
        airdrop.claim(campaignId, 0, proof);

        vm.prank(alice);
        vm.expectRevert("Already claimed");
        airdrop.claim(campaignId, 0, proof);
    }

    function test_claim_wrong_address_reverts() public {
        _createCampaign();

        // Bob tries to claim Alice's slot
        bytes32[] memory proof = new bytes32[](2);
        proof[0] = leaf1;
        proof[1] = node2dup;

        vm.prank(bob);
        vm.expectRevert("Invalid proof");
        airdrop.claim(campaignId, 0, proof);
    }

    function test_claim_bob() public {
        _createCampaign();

        // Bob claims at index 1
        bytes32[] memory proof = new bytes32[](2);
        proof[0] = leaf0;       // sibling of leaf1
        proof[1] = node2dup;    // sibling of node01

        vm.prank(bob);
        airdrop.claim(campaignId, 1, proof);

        assertTrue(airdrop.isClaimed(campaignId, 1));
        assertEq(token.balanceOf(bob), 100 ether);
    }
}
