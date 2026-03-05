import { keccak256, concat, getBytes } from 'ethers';
import type { HashFunction } from '@stratum/core';

/**
 * EVM leaf hash matching Solidity StratumMerkle.hashLeaf:
 *   keccak256(abi.encodePacked(uint8(0x00), keccak256(data)))
 *
 * Double-hashes with domain prefix for second-preimage attack resistance.
 */
export function evmHashLeaf(data: Uint8Array | string): string {
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const innerHash = keccak256(dataBytes);
  return keccak256(concat([new Uint8Array([0x00]), innerHash]));
}

/**
 * EVM node hash matching Solidity StratumMerkle.hashNode:
 *   keccak256(abi.encodePacked(uint8(0x01), min(a,b), max(a,b)))
 *
 * Sorted pairs ensure commutative hashing — proof verification
 * doesn't need left/right distinction.
 */
export function evmHashNode(a: string, b: string): string {
  const [first, second] = a <= b ? [a, b] : [b, a];
  return keccak256(concat([new Uint8Array([0x01]), first, second]));
}

/**
 * Raw keccak256 as a HashFunction for @stratum/core.
 *
 * NOTE: This is the raw keccak256 without domain separation.
 * For full EVM-compatible merkle trees, use EvmMerkleTree which
 * handles domain separation (leaf prefix, node prefix, sorted pairs)
 * matching the Solidity StratumMerkle library.
 */
export const evmHash: HashFunction = (data: Uint8Array): Uint8Array => {
  return getBytes(keccak256(data));
};
