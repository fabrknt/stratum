// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StratumBitfield} from "./StratumBitfield.sol";
import {StratumMerkle} from "./StratumMerkle.sol";
import {StratumExpiry} from "./StratumExpiry.sol";
import {StratumEvents} from "./StratumEvents.sol";
import {StratumResurrection} from "./StratumResurrection.sol";
import {StratumDynamicExpiry} from "./StratumDynamicExpiry.sol";
import {StratumZKVerifier} from "./StratumZKVerifier.sol";

/// @title Stratum
/// @notice Unified abstract contract providing all state primitives.
///         Inheriting contracts get access to bitfield, merkle, expiry, events,
///         resurrection, dynamic expiry, and ZK verification via `using...for` directives.
/// @dev Inherit this contract to get all Stratum primitives in one import.
abstract contract Stratum {
    using StratumBitfield for StratumBitfield.Bitfield;
    using StratumBitfield for StratumBitfield.BitfieldRegistry;
    using StratumMerkle for StratumMerkle.MerkleRootRegistry;
    using StratumExpiry for StratumExpiry.ExpiryRegistry;
    using StratumEvents for StratumEvents.HistorySummary;
    using StratumEvents for StratumEvents.RollingWindow;
    using StratumEvents for StratumEvents.SummaryRegistry;
    using StratumResurrection for StratumResurrection.ArchiveRegistry;
    using StratumDynamicExpiry for StratumDynamicExpiry.DynamicExpiryRegistry;
}
