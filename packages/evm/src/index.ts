// @stratum/evm — EVM-specific SDK for Stratum state primitives

// Hash functions matching Solidity StratumMerkle
export { evmHashLeaf, evmHashNode, evmHash } from './hash';

// EVM-compatible merkle tree
export { EvmMerkleTree } from './merkle';

// Contract interaction + event parsing
export {
  STRATUM_EVENT_ABIS,
  stratumInterface,
  parseStratumLogs,
  parseRecordAddedLogs,
  createStratumContract,
  fetchRecordAddedEvents,
  type RecordAddedEvent,
  type ArchiveCreatedEvent,
  type EntryRestoredEvent,
} from './client';

// Events-over-storage: off-chain reconstruction + hash chain verification
export {
  type HistorySummary,
  emptyHistorySummary,
  applyRecord,
  rebuildSummary,
  verifyHashChain,
  validateEventChain,
} from './events';

// State resurrection: off-chain archive management
export {
  type ArchiveMetadata,
  type RestoreProof,
  buildArchive,
  generateRestoreProof,
  generateBatchRestoreProofs,
  verifyRestoreProof,
  ArchiveStore,
} from './resurrection';

// Re-export core types commonly used with EVM SDK
export type { HashFunction, MerkleProof, OrderLeaf, MatchResult } from '@stratum/core';
export { Bitfield, OrderSide } from '@stratum/core';
