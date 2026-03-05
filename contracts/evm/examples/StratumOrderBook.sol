// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Stratum} from "../src/Stratum.sol";
import {StratumBitfield} from "../src/StratumBitfield.sol";
import {StratumMerkle} from "../src/StratumMerkle.sol";
import {StratumExpiry} from "../src/StratumExpiry.sol";
import {StratumEvents} from "../src/StratumEvents.sol";

/// @title StratumOrderBook
/// @notice Port of Solana stratum-orderbook. Events-over-Storage + Expiry.
///         Orders stored as merkle commitments with deposits and TTLs.
///         Settlement verified via merkle proofs. Cleanup by bots for rewards.
contract StratumOrderBook is Stratum {
    using StratumBitfield for StratumBitfield.Bitfield;
    using StratumMerkle for StratumMerkle.MerkleRootRegistry;
    using StratumExpiry for StratumExpiry.ExpiryRegistry;
    using StratumEvents for StratumEvents.HistorySummary;

    struct Epoch {
        bytes32 merkleRoot;
        uint32 orderCount;
        bool isFinalized;
    }

    address public authority;
    uint32 public currentEpoch;
    uint64 public totalOrders;
    uint64 public totalSettlements;
    uint16 public feeBps;

    mapping(uint32 => Epoch) public epochs;
    mapping(uint32 => StratumBitfield.Bitfield) internal settledBitfields;
    StratumExpiry.ExpiryRegistry internal expiryRegistry;
    StratumEvents.HistorySummary public tradeHistory;
    StratumMerkle.MerkleRootRegistry internal merkleRoots;

    event EpochCreated(uint32 indexed epochIndex);
    event EpochFinalized(uint32 indexed epochIndex, bytes32 merkleRoot, uint32 orderCount);
    event OrderSettled(uint32 indexed epochIndex, uint256 makerIndex, uint256 takerIndex, uint128 fillAmount, uint128 fillPrice);

    modifier onlyAuthority() {
        require(msg.sender == authority, "Not authority");
        _;
    }

    constructor(uint16 _feeBps) {
        authority = msg.sender;
        feeBps = _feeBps;

        expiryRegistry.config = StratumExpiry.ExpiryConfig({
            minDeposit: 0,
            minTTL: 60,
            maxTTL: 30 days,
            cleanerRewardBps: 1000,
            ownerRefundBps: 9000
        });
    }

    /// @notice Create a new epoch
    function createEpoch() external onlyAuthority {
        uint32 epochIndex = currentEpoch++;
        epochs[epochIndex] = Epoch({
            merkleRoot: bytes32(0),
            orderCount: 0,
            isFinalized: false
        });
        emit EpochCreated(epochIndex);
    }

    /// @notice Submit merkle root for an epoch (cranker submits off-chain computed root)
    /// @param epochIndex The epoch to submit for
    /// @param root The computed merkle root
    /// @param orderCount Number of orders in the epoch
    function submitEpochRoot(
        uint32 epochIndex,
        bytes32 root,
        uint32 orderCount
    ) external onlyAuthority {
        Epoch storage epoch = epochs[epochIndex];
        require(!epoch.isFinalized, "Already finalized");
        require(epoch.merkleRoot == bytes32(0), "Root already submitted");

        epoch.merkleRoot = root;
        epoch.orderCount = orderCount;
        totalOrders += orderCount;
    }

    /// @notice Finalize an epoch (no more changes allowed)
    function finalizeEpoch(uint32 epochIndex) external onlyAuthority {
        Epoch storage epoch = epochs[epochIndex];
        require(epoch.merkleRoot != bytes32(0), "No root submitted");
        require(!epoch.isFinalized, "Already finalized");

        epoch.isFinalized = true;
        emit EpochFinalized(epochIndex, epoch.merkleRoot, epoch.orderCount);
    }

    /// @notice Settle a match between two orders with merkle proofs
    /// @param epochIndex The epoch containing both orders
    /// @param makerIndex Maker's index in the merkle tree
    /// @param makerLeafData Serialized maker order
    /// @param makerProof Merkle proof for maker
    /// @param takerIndex Taker's index in the merkle tree
    /// @param takerLeafData Serialized taker order
    /// @param takerProof Merkle proof for taker
    /// @param fillAmount Amount being filled
    /// @param fillPrice Price of the fill
    function settleMatch(
        uint32 epochIndex,
        uint256 makerIndex,
        bytes memory makerLeafData,
        bytes32[] memory makerProof,
        uint256 takerIndex,
        bytes memory takerLeafData,
        bytes32[] memory takerProof,
        uint128 fillAmount,
        uint128 fillPrice
    ) external {
        _verifyAndSettle(epochIndex, makerIndex, makerLeafData, makerProof, takerIndex, takerLeafData, takerProof);

        totalSettlements++;

        // Record trade in event history (cheap!)
        tradeHistory.addRecord(
            keccak256(abi.encodePacked("epoch", epochIndex)),
            fillAmount,
            abi.encodePacked(makerIndex, takerIndex, fillPrice)
        );

        emit OrderSettled(epochIndex, makerIndex, takerIndex, fillAmount, fillPrice);
    }

    function _verifyAndSettle(
        uint32 epochIndex,
        uint256 makerIndex,
        bytes memory makerLeafData,
        bytes32[] memory makerProof,
        uint256 takerIndex,
        bytes memory takerLeafData,
        bytes32[] memory takerProof
    ) internal {
        Epoch storage epoch = epochs[epochIndex];
        require(epoch.isFinalized, "Epoch not finalized");

        // Verify both proofs
        require(
            StratumMerkle.verify(makerProof, epoch.merkleRoot, StratumMerkle.hashLeaf(makerLeafData)),
            "Invalid maker proof"
        );
        require(
            StratumMerkle.verify(takerProof, epoch.merkleRoot, StratumMerkle.hashLeaf(takerLeafData)),
            "Invalid taker proof"
        );

        // Mark as settled (prevents double-settlement)
        uint256 settlementBit = uint256(keccak256(abi.encodePacked(epochIndex, makerIndex, takerIndex))) % (2 ** 128);
        require(settledBitfields[epochIndex].set(settlementBit), "Already settled");
    }

    /// @notice Check if a settlement has been processed
    function isSettled(uint32 epochIndex, uint256 makerIndex, uint256 takerIndex) external view returns (bool) {
        bytes32 settlementKey = keccak256(abi.encodePacked(epochIndex, makerIndex, takerIndex));
        uint256 settlementBit = uint256(settlementKey) % (2 ** 128);
        return settledBitfields[epochIndex].get(settlementBit);
    }
}
