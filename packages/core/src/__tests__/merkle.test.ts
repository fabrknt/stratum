import { describe, it, expect } from 'vitest';
import { MerkleTree, hashLeaf, hashNodes } from '../merkle';

describe('MerkleTree', () => {
  it('should create tree from strings', () => {
    const tree = new MerkleTree(['leaf0', 'leaf1', 'leaf2', 'leaf3']);
    expect(tree.leafCount).toBe(4);
    expect(tree.depth).toBe(2);
    expect(tree.root.length).toBe(32);
  });

  it('should generate valid proofs for 2-leaf tree', () => {
    const tree = new MerkleTree(['leaf0', 'leaf1']);

    const proof0 = tree.getProof(0);
    const proof1 = tree.getProof(1);

    expect(proof0.length).toBe(1);
    expect(proof1.length).toBe(1);

    // Verify proofs
    const leaf0 = hashLeaf(new TextEncoder().encode('leaf0'));
    const leaf1 = hashLeaf(new TextEncoder().encode('leaf1'));

    expect(MerkleTree.verifyProof(proof0, tree.root, leaf0, 0)).toBe(true);
    expect(MerkleTree.verifyProof(proof1, tree.root, leaf1, 1)).toBe(true);

    // Wrong index should fail
    expect(MerkleTree.verifyProof(proof0, tree.root, leaf0, 1)).toBe(false);
  });

  it('should generate valid proofs for 4-leaf tree', () => {
    const tree = new MerkleTree(['leaf0', 'leaf1', 'leaf2', 'leaf3']);

    for (let i = 0; i < 4; i++) {
      const proof = tree.getProof(i);
      const leaf = hashLeaf(new TextEncoder().encode(`leaf${i}`));
      expect(MerkleTree.verifyProof(proof, tree.root, leaf, i)).toBe(true);
    }
  });

  it('should handle odd number of leaves', () => {
    const tree = new MerkleTree(['leaf0', 'leaf1', 'leaf2']);
    expect(tree.leafCount).toBe(3);

    // All proofs should be valid
    for (let i = 0; i < 3; i++) {
      const proof = tree.getProof(i);
      const leaf = hashLeaf(new TextEncoder().encode(`leaf${i}`));
      expect(MerkleTree.verifyProof(proof, tree.root, leaf, i)).toBe(true);
    }
  });

  it('should find leaf index', () => {
    const tree = new MerkleTree(['apple', 'banana', 'cherry']);
    expect(tree.findLeafIndex('banana')).toBe(1);
    expect(tree.findLeafIndex('grape')).toBe(-1);
  });

  it('should return array format', () => {
    const tree = new MerkleTree(['leaf0', 'leaf1']);
    const rootArray = tree.rootArray;
    const proofArray = tree.getProofArray(0);

    expect(rootArray.length).toBe(32);
    expect(Array.isArray(rootArray)).toBe(true);
    expect(proofArray.every((p) => p.length === 32)).toBe(true);
  });

  it('should work with injectable hash function', () => {
    // Simple XOR-based hash for testing injectability
    const testHash = (data: Uint8Array): Uint8Array => {
      const result = new Uint8Array(32);
      for (let i = 0; i < data.length; i++) {
        result[i % 32] ^= data[i];
      }
      return result;
    };

    const tree = new MerkleTree(['leaf0', 'leaf1'], testHash);
    expect(tree.leafCount).toBe(2);
    expect(tree.root.length).toBe(32);

    const proof = tree.getProof(0);
    const leaf = hashLeaf(new TextEncoder().encode('leaf0'), testHash);
    expect(MerkleTree.verifyProof(proof, tree.root, leaf, 0, testHash)).toBe(true);
  });
});

describe('hashLeaf and hashNodes', () => {
  it('should produce consistent hashes', () => {
    const data = new TextEncoder().encode('test');
    const hash1 = hashLeaf(data);
    const hash2 = hashLeaf(data);
    expect(hash1).toEqual(hash2);
  });

  it('should produce different hashes for different data', () => {
    const hash1 = hashLeaf(new TextEncoder().encode('test1'));
    const hash2 = hashLeaf(new TextEncoder().encode('test2'));
    expect(hash1).not.toEqual(hash2);
  });

  it('should hash nodes correctly', () => {
    const left = new Uint8Array(32).fill(1);
    const right = new Uint8Array(32).fill(2);
    const combined = hashNodes(left, right);
    expect(combined.length).toBe(32);
  });
});
