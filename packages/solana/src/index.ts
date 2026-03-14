// @fabrknt/stratum-solana — Solana-specific SDK
export * from './pda';
export * from './hash';
export * from './orderbook';

// Re-export core for convenience
export {
  MerkleTree,
  hashLeaf,
  hashNodes,
  Bitfield,
  splitIndex,
  globalIndex,
  chunksNeeded,
  BITS_PER_CHUNK,
  BYTES_PER_CHUNK,
  OrderMatcher,
} from '@fabrknt/stratum-core';

export type { HashFunction, MerkleProof } from '@fabrknt/stratum-core';

// Re-export common Solana types
export { PublicKey } from '@solana/web3.js';
