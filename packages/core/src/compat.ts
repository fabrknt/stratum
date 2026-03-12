/**
 * Compatibility layer for API consumers.
 *
 * Provides:
 * - String-based HashFunctionName type (maps to concrete hash implementations)
 * - API-shaped OrderLeaf (bigint fields, owner instead of maker)
 * - Structured MerkleProof with leaf/siblings/index/root
 * - Functional buildMerkleRoot / verifyMerkleProof helpers
 *
 * All existing exports remain unchanged.
 */

import { MerkleTree, hashLeaf } from './merkle';
import type { OrderSide } from './types';
import type { HashFunction } from './types';

// ---------------------------------------------------------------------------
// Hash function name type — mirrors the API's string-union HashFunction
// ---------------------------------------------------------------------------

/** Named hash function identifier, as used by API consumers. */
export type HashFunctionName = 'poseidon' | 'sha256' | 'keccak256';

/**
 * Resolve a HashFunctionName to a concrete HashFunction.
 *
 * poseidon and keccak256 fall back to sha256 in this self-contained
 * implementation (matches the API's existing behaviour).  Consumers that
 * need real keccak/poseidon should inject their own HashFunction instead.
 */
export function resolveHashFunction(name: HashFunctionName): HashFunction {
  // All three currently resolve to the same SHA-256 implementation,
  // matching the API's existing fallback behaviour.
  return sha256Hash;
}

function sha256Hash(data: Uint8Array): Uint8Array {
  // Use Node crypto — safe for server-side SDK consumers.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  return new Uint8Array(crypto.createHash('sha256').update(data).digest());
}

// ---------------------------------------------------------------------------
// API-shaped OrderLeaf
// ---------------------------------------------------------------------------

/**
 * Order leaf shape used by the API layer.
 *
 * Differs from the SDK's native OrderLeaf:
 * - `owner` (Uint8Array) instead of `maker`
 * - `price` and `qty` are bigint instead of number
 * - `nonce` replaces orderId/epochIndex/orderIndex/createdAt/expiresAt
 */
export interface ApiOrderLeaf {
  price: bigint;
  qty: bigint;
  side: OrderSide;
  owner: Uint8Array;
  nonce: bigint;
}

// ---------------------------------------------------------------------------
// Structured MerkleProof (API shape)
// ---------------------------------------------------------------------------

/**
 * Merkle proof with explicit leaf, siblings, index and root.
 * This is the shape the API layer expects.
 */
export interface StructuredMerkleProof {
  leaf: Uint8Array;
  siblings: Uint8Array[];
  index: number;
  root: Uint8Array;
}

// ---------------------------------------------------------------------------
// Functional Merkle helpers — match the API's calling convention
// ---------------------------------------------------------------------------

/**
 * Build a Merkle root from a set of raw leaf byte arrays.
 *
 * Mirrors the API's `buildMerkleRoot(leaves, hashFn)` signature where
 * `hashFn` is a string name like "sha256".
 */
export function buildMerkleRoot(
  leaves: Uint8Array[],
  hashFn: HashFunctionName = 'sha256',
): Uint8Array {
  if (leaves.length === 0) return new Uint8Array(32);
  if (leaves.length === 1) return leaves[0];

  const fn = resolveHashFunction(hashFn);

  // Pad to power of 2
  const padded = [...leaves];
  while (padded.length & (padded.length - 1)) {
    padded.push(new Uint8Array(padded[0].length));
  }

  let layer = padded;
  while (layer.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      const combined = new Uint8Array(layer[i].length + layer[i + 1].length);
      combined.set(layer[i], 0);
      combined.set(layer[i + 1], layer[i].length);
      next.push(fn(combined));
    }
    layer = next;
  }

  return layer[0];
}

/**
 * Verify a structured Merkle proof.
 *
 * Accepts the API's `StructuredMerkleProof` shape and an optional
 * `HashFunctionName` string.
 */
export function verifyMerkleProof(
  proof: StructuredMerkleProof,
  hashFn: HashFunctionName = 'sha256',
): boolean {
  const fn = resolveHashFunction(hashFn);
  let current = proof.leaf;
  let idx = proof.index;

  for (const sibling of proof.siblings) {
    const combined = new Uint8Array(current.length + sibling.length);
    if (idx % 2 === 0) {
      combined.set(current, 0);
      combined.set(sibling, current.length);
    } else {
      combined.set(sibling, 0);
      combined.set(current, sibling.length);
    }
    current = fn(combined);
    idx = Math.floor(idx / 2);
  }

  if (current.length !== proof.root.length) return false;
  for (let i = 0; i < current.length; i++) {
    if (current[i] !== proof.root[i]) return false;
  }
  return true;
}
