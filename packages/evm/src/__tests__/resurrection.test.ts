import { describe, it, expect } from 'vitest';
import { keccak256 } from 'ethers';
import {
  buildArchive,
  generateRestoreProof,
  generateBatchRestoreProofs,
  verifyRestoreProof,
  ArchiveStore,
} from '../resurrection';
import { evmHashLeaf } from '../hash';
import { EvmMerkleTree } from '../merkle';

const enc = (s: string) => new TextEncoder().encode(s);

describe('buildArchive', () => {
  it('creates archive with correct merkle root', () => {
    const entries = [enc('entry0'), enc('entry1'), enc('entry2')];
    const archiveId = '0x' + '01'.repeat(32);

    const archive = buildArchive(archiveId, entries);

    const tree = new EvmMerkleTree(entries);
    expect(archive.merkleRoot).toBe(tree.root);
    expect(archive.entryCount).toBe(3);
    expect(archive.archiveId).toBe(archiveId);
    expect(archive.entries).toBe(entries);
  });

  it('computes data hash from concatenated entries', () => {
    const entries = [enc('a'), enc('b')];
    const archive = buildArchive('0x' + '00'.repeat(32), entries);

    const concatenated = new Uint8Array(2);
    concatenated[0] = 'a'.charCodeAt(0);
    concatenated[1] = 'b'.charCodeAt(0);
    const expectedHash = keccak256(concatenated);

    expect(archive.dataHash).toBe(expectedHash);
  });
});

describe('generateRestoreProof', () => {
  it('generates valid proof for each entry', () => {
    const entries = [enc('entry0'), enc('entry1'), enc('entry2'), enc('entry3')];
    const archive = buildArchive('0x' + 'ab'.repeat(32), entries);

    for (let i = 0; i < entries.length; i++) {
      const proof = generateRestoreProof(archive, i);

      expect(proof.archiveId).toBe(archive.archiveId);
      expect(proof.entryIndex).toBe(i);
      expect(proof.leafData).toBe(entries[i]);
      expect(verifyRestoreProof(proof, archive.merkleRoot)).toBe(true);
    }
  });

  it('throws for out of bounds index', () => {
    const entries = [enc('only')];
    const archive = buildArchive('0x' + '00'.repeat(32), entries);

    expect(() => generateRestoreProof(archive, 1)).toThrow('out of bounds');
    expect(() => generateRestoreProof(archive, -1)).toThrow('out of bounds');
  });
});

describe('generateBatchRestoreProofs', () => {
  it('generates proofs for multiple entries', () => {
    const entries = [enc('a'), enc('b'), enc('c'), enc('d')];
    const archive = buildArchive('0x' + 'cd'.repeat(32), entries);

    const proofs = generateBatchRestoreProofs(archive, [0, 2, 3]);

    expect(proofs).toHaveLength(3);
    expect(proofs[0].entryIndex).toBe(0);
    expect(proofs[1].entryIndex).toBe(2);
    expect(proofs[2].entryIndex).toBe(3);

    for (const proof of proofs) {
      expect(verifyRestoreProof(proof, archive.merkleRoot)).toBe(true);
    }
  });
});

describe('verifyRestoreProof', () => {
  it('accepts valid proof', () => {
    const entries = [enc('x'), enc('y')];
    const archive = buildArchive('0x' + '00'.repeat(32), entries);
    const proof = generateRestoreProof(archive, 0);

    expect(verifyRestoreProof(proof, archive.merkleRoot)).toBe(true);
  });

  it('rejects proof with wrong root', () => {
    const entries = [enc('x'), enc('y')];
    const archive = buildArchive('0x' + '00'.repeat(32), entries);
    const proof = generateRestoreProof(archive, 0);

    const wrongRoot = evmHashLeaf('wrong');
    expect(verifyRestoreProof(proof, wrongRoot)).toBe(false);
  });

  it('rejects proof with tampered leaf data', () => {
    const entries = [enc('x'), enc('y')];
    const archive = buildArchive('0x' + '00'.repeat(32), entries);
    const proof = generateRestoreProof(archive, 0);

    // Tamper with leaf data
    const tampered = { ...proof, leafData: enc('tampered') };
    expect(verifyRestoreProof(tampered, archive.merkleRoot)).toBe(false);
  });
});

describe('ArchiveStore', () => {
  it('stores and retrieves archives', () => {
    const store = new ArchiveStore();
    const entries = [enc('hello'), enc('world')];
    const archive = buildArchive('0x' + 'aa'.repeat(32), entries);

    store.store(archive);

    expect(store.has(archive.archiveId)).toBe(true);
    expect(store.get(archive.archiveId)).toBe(archive);
  });

  it('lists archive keys', () => {
    const store = new ArchiveStore();
    const id1 = '0x' + 'aa'.repeat(32);
    const id2 = '0x' + 'bb'.repeat(32);

    store.store(buildArchive(id1, [enc('a')]));
    store.store(buildArchive(id2, [enc('b')]));

    const keys = store.keys();
    expect(keys).toContain(id1);
    expect(keys).toContain(id2);
    expect(keys).toHaveLength(2);
  });

  it('deletes archives', () => {
    const store = new ArchiveStore();
    const id = '0x' + 'cc'.repeat(32);
    store.store(buildArchive(id, [enc('x')]));

    expect(store.delete(id)).toBe(true);
    expect(store.has(id)).toBe(false);
    expect(store.delete(id)).toBe(false);
  });

  it('generates restore proofs from stored archives', () => {
    const store = new ArchiveStore();
    const entries = [enc('a'), enc('b'), enc('c')];
    const id = '0x' + 'dd'.repeat(32);
    const archive = buildArchive(id, entries);
    store.store(archive);

    const proof = store.getRestoreProof(id, 1);
    expect(proof.entryIndex).toBe(1);
    expect(verifyRestoreProof(proof, archive.merkleRoot)).toBe(true);
  });

  it('throws when getting proof for unknown archive', () => {
    const store = new ArchiveStore();
    expect(() => store.getRestoreProof('0x' + '00'.repeat(32), 0)).toThrow('not found');
  });
});
