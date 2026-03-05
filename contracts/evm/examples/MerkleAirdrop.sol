// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Stratum} from "../src/Stratum.sol";
import {StratumBitfield} from "../src/StratumBitfield.sol";
import {StratumMerkle} from "../src/StratumMerkle.sol";
import {StratumExpiry} from "../src/StratumExpiry.sol";
import {StratumEvents} from "../src/StratumEvents.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title MerkleAirdrop
/// @notice Port of Solana airdrop-example. Merkle + Bitfield + Expiry + Events.
///         - Merkle tree whitelist for eligible recipients
///         - Bitfield claim tracking
///         - Expiry with cleanup rewards for unclaimed tokens
///         - Event-based claim history
contract MerkleAirdrop is Stratum {
    using SafeERC20 for IERC20;
    using StratumBitfield for StratumBitfield.Bitfield;
    using StratumMerkle for StratumMerkle.MerkleRootRegistry;
    using StratumExpiry for StratumExpiry.ExpiryRegistry;
    using StratumEvents for StratumEvents.HistorySummary;

    struct Campaign {
        IERC20 token;
        bytes32 merkleRoot;
        uint64 totalRecipients;
        uint128 amountPerClaim;
        address creator;
        bool isActive;
    }

    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => StratumBitfield.Bitfield) internal claimBitfields;
    StratumExpiry.ExpiryRegistry internal expiryRegistry;
    StratumEvents.HistorySummary public claimHistory;

    event CampaignCreated(bytes32 indexed campaignId, address token, uint64 recipients, uint128 amountPerClaim);
    event Claimed(bytes32 indexed campaignId, address indexed recipient, uint256 index, uint128 amount);

    constructor() {
        expiryRegistry.config = StratumExpiry.ExpiryConfig({
            minDeposit: 0,
            minTTL: 1 hours,
            maxTTL: 365 days,
            cleanerRewardBps: 500,   // 5% to cleaner
            ownerRefundBps: 9500     // 95% back to creator
        });
    }

    /// @notice Create an airdrop campaign
    /// @param campaignId Unique campaign identifier
    /// @param token The ERC20 token to distribute
    /// @param merkleRoot Merkle root of eligible recipients
    /// @param totalRecipients Number of eligible recipients
    /// @param amountPerClaim Amount each recipient gets
    /// @param ttlSeconds How long the campaign is active
    function createCampaign(
        bytes32 campaignId,
        IERC20 token,
        bytes32 merkleRoot,
        uint64 totalRecipients,
        uint128 amountPerClaim,
        uint32 ttlSeconds
    ) external {
        require(!campaigns[campaignId].isActive, "Campaign exists");

        uint256 totalAmount = uint256(totalRecipients) * uint256(amountPerClaim);
        token.safeTransferFrom(msg.sender, address(this), totalAmount);

        campaigns[campaignId] = Campaign({
            token: token,
            merkleRoot: merkleRoot,
            totalRecipients: totalRecipients,
            amountPerClaim: amountPerClaim,
            creator: msg.sender,
            isActive: true
        });

        // Create expiry entry for cleanup
        expiryRegistry.create(campaignId, msg.sender, ttlSeconds, 0);

        emit CampaignCreated(campaignId, address(token), totalRecipients, amountPerClaim);
    }

    /// @notice Claim airdrop tokens with merkle proof
    /// @param campaignId The campaign to claim from
    /// @param index Recipient index in the merkle tree
    /// @param proof Merkle proof of eligibility
    function claim(
        bytes32 campaignId,
        uint256 index,
        bytes32[] memory proof
    ) external {
        Campaign storage campaign = campaigns[campaignId];
        require(campaign.isActive, "Campaign not active");
        require(!expiryRegistry.isExpired(campaignId), "Campaign expired");

        // Verify merkle proof: leaf = hash(index || recipient address)
        bytes32 leaf = StratumMerkle.hashLeaf(
            abi.encodePacked(index, msg.sender)
        );
        require(
            StratumMerkle.verify(proof, campaign.merkleRoot, leaf),
            "Invalid proof"
        );

        // Mark as claimed (reverts if already claimed)
        bool newlyClaimed = claimBitfields[campaignId].set(index);
        require(newlyClaimed, "Already claimed");

        // Transfer tokens
        campaign.token.safeTransfer(msg.sender, campaign.amountPerClaim);

        // Record in event history
        claimHistory.addRecord(
            campaignId,
            campaign.amountPerClaim,
            abi.encodePacked(msg.sender, index)
        );

        emit Claimed(campaignId, msg.sender, index, campaign.amountPerClaim);
    }

    /// @notice Check if a specific index has been claimed
    function isClaimed(bytes32 campaignId, uint256 index) external view returns (bool) {
        return claimBitfields[campaignId].get(index);
    }

    /// @notice Get number of claims for a campaign
    function claimCount(bytes32 campaignId) external view returns (uint256) {
        return claimBitfields[campaignId].getCount();
    }
}
