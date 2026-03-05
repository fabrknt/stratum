import type { HashFunction } from './types';

// Domain separation prefixes (must match on-chain implementations)
const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

/**
 * Default hash function — FNV-1a variant expanded to 256 bits with mixing.
 * Matches the original Solana on-chain implementation.
 *
 * For EVM, inject keccak256 instead. For production Solana, this is
 * the hash that matches the Rust program.
 */
function defaultHash(data: Uint8Array): Uint8Array {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  for (let i = 0; i < data.length; i++) {
    const idx = i % 8;
    state[idx] = Math.imul(state[idx], 0x01000193) + data[i];
    // Mix
    state[(idx + 1) % 8] ^= rotateLeft32(state[idx], 5);
  }

  // Final mixing
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 8; i++) {
      state[i] = Math.imul(state[i], 0x01000193) ^ state[(i + 1) % 8];
    }
  }

  const result = new Uint8Array(32);
  const view = new DataView(result.buffer);
  for (let i = 0; i < 8; i++) {
    view.setUint32(i * 4, state[i] >>> 0, true);
  }
  return result;
}

function rotateLeft32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/**
 * Hash a leaf with domain separation using the given hash function
 */
export function hashLeaf(data: Uint8Array, hashFn: HashFunction = defaultHash): Uint8Array {
  const prefixed = new Uint8Array(1 + data.length);
  prefixed[0] = LEAF_PREFIX;
  prefixed.set(data, 1);
  return hashFn(prefixed);
}

/**
 * Hash two nodes together with domain separation
 */
export function hashNodes(left: Uint8Array, right: Uint8Array, hashFn: HashFunction = defaultHash): Uint8Array {
  const combined = new Uint8Array(1 + left.length + right.length);
  combined[0] = NODE_PREFIX;
  combined.set(left, 1);
  combined.set(right, 1 + left.length);
  return hashFn(combined);
}

/**
 * Compare two Uint8Arrays for equality
 */
function uint8ArrayEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Merkle tree builder with injectable hash function.
 *
 * Chain-agnostic — use with any hash function:
 * - Solana: `new MerkleTree(leaves, solanaHash)`
 * - EVM: `new MerkleTree(leaves, evmHash)`
 * - Default: FNV-1a variant (matches original Solana program)
 */
export class MerkleTree {
  private leaves: Uint8Array[];
  private layers: Uint8Array[][];
  private hashFn: HashFunction;

  constructor(leaves: (Uint8Array | string)[], hashFn: HashFunction = defaultHash) {
    this.hashFn = hashFn;

    // Hash all leaves
    this.leaves = leaves.map((leaf) => {
      const data = typeof leaf === 'string' ? new TextEncoder().encode(leaf) : leaf;
      return hashLeaf(data, this.hashFn);
    });

    // Build tree layers
    this.layers = this.buildLayers();
  }

  /**
   * Create tree from raw leaf hashes (already hashed)
   */
  static fromHashes(hashes: Uint8Array[], hashFn: HashFunction = defaultHash): MerkleTree {
    const tree = new MerkleTree([], hashFn);
    tree.leaves = hashes;
    tree.layers = tree.buildLayers();
    return tree;
  }

  private buildLayers(): Uint8Array[][] {
    if (this.leaves.length === 0) {
      return [[new Uint8Array(32)]];
    }

    const layers: Uint8Array[][] = [this.leaves];

    while (layers[layers.length - 1].length > 1) {
      const currentLayer = layers[layers.length - 1];
      const nextLayer: Uint8Array[] = [];

      for (let i = 0; i < currentLayer.length; i += 2) {
        const left = currentLayer[i];
        // If odd number, duplicate the last node
        const right = currentLayer[i + 1] || left;
        nextLayer.push(hashNodes(left, right, this.hashFn));
      }

      layers.push(nextLayer);
    }

    return layers;
  }

  /**
   * Get the merkle root
   */
  get root(): Uint8Array {
    return this.layers[this.layers.length - 1][0];
  }

  /**
   * Get root as number array (for Anchor/ABI encoding)
   */
  get rootArray(): number[] {
    return Array.from(this.root);
  }

  /**
   * Get the number of leaves
   */
  get leafCount(): number {
    return this.leaves.length;
  }

  /**
   * Get the depth of the tree
   */
  get depth(): number {
    return this.layers.length - 1;
  }

  /**
   * Get proof for a leaf at given index
   */
  getProof(index: number): Uint8Array[] {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Index ${index} out of bounds (0-${this.leaves.length - 1})`);
    }

    const proof: Uint8Array[] = [];
    let idx = index;

    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer = this.layers[i];
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

      if (siblingIdx < layer.length) {
        proof.push(layer[siblingIdx]);
      } else {
        // Odd number of nodes, sibling is self
        proof.push(layer[idx]);
      }

      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /**
   * Get proof as array of number arrays (for Anchor/ABI encoding)
   */
  getProofArray(index: number): number[][] {
    return this.getProof(index).map((buf) => Array.from(buf));
  }

  /**
   * Verify a proof
   */
  static verifyProof(
    proof: Uint8Array[],
    root: Uint8Array,
    leaf: Uint8Array,
    index: number,
    hashFn: HashFunction = defaultHash
  ): boolean {
    let computedHash = leaf;
    let idx = index;

    for (const sibling of proof) {
      if (idx % 2 === 0) {
        computedHash = hashNodes(computedHash, sibling, hashFn);
      } else {
        computedHash = hashNodes(sibling, computedHash, hashFn);
      }
      idx = Math.floor(idx / 2);
    }

    return uint8ArrayEquals(computedHash, root);
  }

  /**
   * Get leaf hash at index
   */
  getLeaf(index: number): Uint8Array {
    return this.leaves[index];
  }

  /**
   * Find index of a leaf by its original data
   */
  findLeafIndex(data: Uint8Array | string): number {
    const inputData = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const targetHash = hashLeaf(inputData, this.hashFn);
    return this.leaves.findIndex((leaf) => uint8ArrayEquals(leaf, targetHash));
  }
}
