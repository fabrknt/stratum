import { evmHashLeaf, evmHashNode } from './hash';

/**
 * EVM-compatible merkle tree matching Solidity StratumMerkle.
 *
 * Key differences from @stratum/core MerkleTree:
 * - Leaf hashing: double-hash with 0x00 prefix (keccak256(0x00 || keccak256(data)))
 * - Node hashing: sorted pairs with 0x01 prefix (commutative)
 * - Proof verification: no index needed (commutative hashing)
 * - All hashes are hex strings (bytes32)
 *
 * Usage:
 *   const tree = new EvmMerkleTree([orderData1, orderData2, ...]);
 *   const proof = tree.getProof(0);
 *   // Submit tree.root + proof to Solidity StratumMerkle.verify()
 */
export class EvmMerkleTree {
  private leaves: string[];
  private layers: string[][];

  constructor(leafData: (Uint8Array | string)[]) {
    this.leaves = leafData.map((d) => evmHashLeaf(d));
    this.layers = this.buildLayers();
  }

  /**
   * Create tree from pre-computed leaf hashes (already hashed via evmHashLeaf)
   */
  static fromHashes(hashes: string[]): EvmMerkleTree {
    const tree = Object.create(EvmMerkleTree.prototype) as EvmMerkleTree;
    tree.leaves = hashes;
    tree.layers = tree.buildLayers();
    return tree;
  }

  private buildLayers(): string[][] {
    if (this.leaves.length === 0) {
      return [['0x' + '00'.repeat(32)]];
    }

    const layers: string[][] = [this.leaves];

    while (layers[layers.length - 1].length > 1) {
      const current = layers[layers.length - 1];
      const next: string[] = [];

      for (let i = 0; i < current.length; i += 2) {
        const left = current[i];
        const right = current[i + 1] || left; // odd leaf duplicated
        next.push(evmHashNode(left, right));
      }

      layers.push(next);
    }

    return layers;
  }

  /** The merkle root (bytes32 hex string) */
  get root(): string {
    return this.layers[this.layers.length - 1][0];
  }

  /** Number of leaves */
  get leafCount(): number {
    return this.leaves.length;
  }

  /** Tree depth (number of proof elements for any leaf) */
  get depth(): number {
    return this.layers.length - 1;
  }

  /**
   * Get merkle proof for a leaf at the given index.
   * Returns array of sibling hashes from leaf to root.
   */
  getProof(index: number): string[] {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Index ${index} out of bounds (0-${this.leaves.length - 1})`);
    }

    const proof: string[] = [];
    let idx = index;

    for (let i = 0; i < this.layers.length - 1; i++) {
      const layer = this.layers[i];
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

      if (siblingIdx < layer.length) {
        proof.push(layer[siblingIdx]);
      } else {
        // Odd number of nodes — sibling is self
        proof.push(layer[idx]);
      }

      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /** Get the leaf hash at a given index */
  getLeaf(index: number): string {
    return this.leaves[index];
  }

  /** Find the index of a leaf by its original data */
  findLeafIndex(data: Uint8Array | string): number {
    const hash = evmHashLeaf(data);
    return this.leaves.indexOf(hash);
  }

  /**
   * Verify a merkle proof against a root.
   * Since hashing is commutative (sorted pairs), no index is needed.
   */
  static verify(proof: string[], root: string, leaf: string): boolean {
    let hash = leaf;
    for (const sibling of proof) {
      hash = evmHashNode(hash, sibling);
    }
    return hash.toLowerCase() === root.toLowerCase();
  }
}
