import { describe, it, expect } from 'vitest';
import { EvmMerkleTree } from '../merkle';
import { evmHashLeaf, evmHashNode } from '../hash';

describe('EvmMerkleTree', () => {
  it('builds a tree from 2 leaves', () => {
    const tree = new EvmMerkleTree(['order0', 'order1']);

    const leaf0 = evmHashLeaf('order0');
    const leaf1 = evmHashLeaf('order1');
    const expectedRoot = evmHashNode(leaf0, leaf1);

    expect(tree.root).toBe(expectedRoot);
    expect(tree.leafCount).toBe(2);
    expect(tree.depth).toBe(1);
  });

  it('builds a tree from 3 leaves (odd — duplicates last)', () => {
    const tree = new EvmMerkleTree(['a', 'b', 'c']);

    const leaf0 = evmHashLeaf('a');
    const leaf1 = evmHashLeaf('b');
    const leaf2 = evmHashLeaf('c');

    const node01 = evmHashNode(leaf0, leaf1);
    const node22 = evmHashNode(leaf2, leaf2); // odd leaf duplicated
    const expectedRoot = evmHashNode(node01, node22);

    expect(tree.root).toBe(expectedRoot);
    expect(tree.leafCount).toBe(3);
    expect(tree.depth).toBe(2);
  });

  it('builds a tree from 4 leaves', () => {
    const tree = new EvmMerkleTree(['w', 'x', 'y', 'z']);

    const leaf0 = evmHashLeaf('w');
    const leaf1 = evmHashLeaf('x');
    const leaf2 = evmHashLeaf('y');
    const leaf3 = evmHashLeaf('z');

    const node01 = evmHashNode(leaf0, leaf1);
    const node23 = evmHashNode(leaf2, leaf3);
    const expectedRoot = evmHashNode(node01, node23);

    expect(tree.root).toBe(expectedRoot);
  });

  it('generates valid proofs for all leaves', () => {
    const data = ['alpha', 'beta', 'gamma', 'delta'];
    const tree = new EvmMerkleTree(data);

    for (let i = 0; i < data.length; i++) {
      const proof = tree.getProof(i);
      const leaf = tree.getLeaf(i);
      expect(EvmMerkleTree.verify(proof, tree.root, leaf)).toBe(true);
    }
  });

  it('proofs fail for wrong leaf', () => {
    const tree = new EvmMerkleTree(['a', 'b', 'c', 'd']);
    const proof = tree.getProof(0);
    const wrongLeaf = tree.getLeaf(1); // leaf at index 1, not 0
    expect(EvmMerkleTree.verify(proof, tree.root, wrongLeaf)).toBe(false);
  });

  it('proofs fail for wrong root', () => {
    const tree = new EvmMerkleTree(['a', 'b']);
    const proof = tree.getProof(0);
    const leaf = tree.getLeaf(0);
    const wrongRoot = evmHashLeaf('bogus');
    expect(EvmMerkleTree.verify(proof, wrongRoot, leaf)).toBe(false);
  });

  it('works with a single leaf', () => {
    const tree = new EvmMerkleTree(['only']);
    expect(tree.leafCount).toBe(1);
    expect(tree.root).toBe(evmHashLeaf('only'));

    const proof = tree.getProof(0);
    expect(proof).toHaveLength(0);
    expect(EvmMerkleTree.verify(proof, tree.root, tree.getLeaf(0))).toBe(true);
  });

  it('works with Uint8Array input', () => {
    const data = new TextEncoder().encode('binary data');
    const tree = new EvmMerkleTree([data]);
    expect(tree.root).toBe(evmHashLeaf(data));
  });

  it('fromHashes builds correct tree', () => {
    const hashes = [evmHashLeaf('a'), evmHashLeaf('b'), evmHashLeaf('c')];
    const tree = EvmMerkleTree.fromHashes(hashes);

    const node01 = evmHashNode(hashes[0], hashes[1]);
    const node22 = evmHashNode(hashes[2], hashes[2]);
    const expectedRoot = evmHashNode(node01, node22);

    expect(tree.root).toBe(expectedRoot);
  });

  it('findLeafIndex returns correct index', () => {
    const tree = new EvmMerkleTree(['a', 'b', 'c']);
    expect(tree.findLeafIndex('a')).toBe(0);
    expect(tree.findLeafIndex('b')).toBe(1);
    expect(tree.findLeafIndex('c')).toBe(2);
    expect(tree.findLeafIndex('d')).toBe(-1);
  });

  it('getProof throws for out of bounds', () => {
    const tree = new EvmMerkleTree(['a', 'b']);
    expect(() => tree.getProof(-1)).toThrow('out of bounds');
    expect(() => tree.getProof(2)).toThrow('out of bounds');
  });

  it('handles 8 leaves with valid proofs', () => {
    const data = Array.from({ length: 8 }, (_, i) => `leaf_${i}`);
    const tree = new EvmMerkleTree(data);

    expect(tree.depth).toBe(3);

    for (let i = 0; i < 8; i++) {
      const proof = tree.getProof(i);
      expect(proof).toHaveLength(3);
      expect(EvmMerkleTree.verify(proof, tree.root, tree.getLeaf(i))).toBe(true);
    }
  });

  it('matches manual Solidity-compatible computation', () => {
    // This test mirrors the StratumOrderBook.t.sol test_settleMatch setup:
    // Two orders, build tree, verify proofs
    const order0 = 'maker=alice,bid,price=100,amount=10';
    const order1 = 'maker=bob,ask,price=95,amount=10';

    const tree = new EvmMerkleTree([order0, order1]);

    const leaf0 = evmHashLeaf(order0);
    const leaf1 = evmHashLeaf(order1);
    const expectedRoot = evmHashNode(leaf0, leaf1);

    expect(tree.root).toBe(expectedRoot);

    // Proof for leaf 0: sibling is leaf1
    const proof0 = tree.getProof(0);
    expect(proof0).toHaveLength(1);
    expect(proof0[0]).toBe(leaf1);

    // Proof for leaf 1: sibling is leaf0
    const proof1 = tree.getProof(1);
    expect(proof1).toHaveLength(1);
    expect(proof1[0]).toBe(leaf0);

    // Both verify
    expect(EvmMerkleTree.verify(proof0, tree.root, leaf0)).toBe(true);
    expect(EvmMerkleTree.verify(proof1, tree.root, leaf1)).toBe(true);
  });
});
