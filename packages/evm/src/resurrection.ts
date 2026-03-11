import { keccak256, zeroPadValue, toBeHex } from 'ethers';
import { EvmMerkleTree } from './merkle';
import { evmHashLeaf } from './hash';
import type { DAProvider, DACommitment } from '@stratum/core';
import { serializeEntries, deserializeEntries } from '@stratum/core';

/**
 * Pack entryIndex (uint256) with leafData, matching Solidity:
 *   abi.encodePacked(uint256(entryIndex), leafData)
 */
function packIndexedLeaf(entryIndex: number, leafData: Uint8Array): Uint8Array {
  // uint256 = 32 bytes big-endian
  const indexBytes = new Uint8Array(32);
  const hex = zeroPadValue(toBeHex(entryIndex), 32).slice(2); // remove 0x
  for (let i = 0; i < 32; i++) {
    indexBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const result = new Uint8Array(32 + leafData.length);
  result.set(indexBytes);
  result.set(leafData, 32);
  return result;
}

/**
 * Build indexed leaf data for each entry (prepends uint256 index).
 * This matches the Solidity StratumResurrection.restore leaf format.
 */
function buildIndexedEntries(entries: Uint8Array[]): Uint8Array[] {
  return entries.map((entry, i) => packIndexedLeaf(i, entry));
}

/**
 * Off-chain archive metadata matching the Solidity StratumResurrection.Archive struct.
 */
export interface ArchiveMetadata {
  archiveId: string;
  merkleRoot: string;
  entryCount: number;
  dataHash: string;
  entries: Uint8Array[];
}

/**
 * A restore proof ready to submit to the Solidity contract.
 */
export interface RestoreProof {
  archiveId: string;
  entryIndex: number;
  proof: string[];
  leafData: Uint8Array;
}

/**
 * Build an archive from a set of entries.
 * Creates the merkle tree and computes the data hash.
 *
 * @param archiveId The archive identifier (bytes32 hex)
 * @param entries Array of raw entry data
 * @returns Archive metadata with merkle root and data hash
 */
export function buildArchive(archiveId: string, entries: Uint8Array[]): ArchiveMetadata {
  // Build tree with index-prefixed leaves matching Solidity StratumResurrection.restore
  const indexedEntries = buildIndexedEntries(entries);
  const tree = new EvmMerkleTree(indexedEntries);

  // Data hash = keccak256 of all entries concatenated
  const totalLength = entries.reduce((sum, e) => sum + e.length, 0);
  const concatenated = new Uint8Array(totalLength);
  let offset = 0;
  for (const entry of entries) {
    concatenated.set(entry, offset);
    offset += entry.length;
  }
  const dataHash = keccak256(concatenated);

  return {
    archiveId,
    merkleRoot: tree.root,
    entryCount: entries.length,
    dataHash,
    entries,
  };
}

/**
 * Generate a restore proof for a single entry in an archive.
 *
 * @param archive The archive metadata (from buildArchive)
 * @param entryIndex The index of the entry to restore
 * @returns Restore proof ready for on-chain submission
 */
export function generateRestoreProof(archive: ArchiveMetadata, entryIndex: number): RestoreProof {
  if (entryIndex < 0 || entryIndex >= archive.entries.length) {
    throw new Error(`Entry index ${entryIndex} out of bounds (0-${archive.entries.length - 1})`);
  }

  // Rebuild tree with index-prefixed leaves
  const indexedEntries = buildIndexedEntries(archive.entries);
  const tree = new EvmMerkleTree(indexedEntries);
  const proof = tree.getProof(entryIndex);

  return {
    archiveId: archive.archiveId,
    entryIndex,
    proof,
    leafData: archive.entries[entryIndex],
  };
}

/**
 * Generate batch restore proofs for multiple entries.
 *
 * @param archive The archive metadata
 * @param entryIndices Indices of entries to restore
 * @returns Array of restore proofs
 */
export function generateBatchRestoreProofs(
  archive: ArchiveMetadata,
  entryIndices: number[],
): RestoreProof[] {
  const indexedEntries = buildIndexedEntries(archive.entries);
  const tree = new EvmMerkleTree(indexedEntries);

  return entryIndices.map((entryIndex) => {
    if (entryIndex < 0 || entryIndex >= archive.entries.length) {
      throw new Error(`Entry index ${entryIndex} out of bounds`);
    }
    return {
      archiveId: archive.archiveId,
      entryIndex,
      proof: tree.getProof(entryIndex),
      leafData: archive.entries[entryIndex],
    };
  });
}

/**
 * Verify a restore proof off-chain before submitting.
 * Uses the same logic as the Solidity contract.
 *
 * @param proof The restore proof
 * @param merkleRoot The expected merkle root
 * @returns true if the proof is valid
 */
export function verifyRestoreProof(proof: RestoreProof, merkleRoot: string): boolean {
  // Hash with index prefix, matching Solidity: hashLeaf(abi.encodePacked(entryIndex, leafData))
  const indexedLeaf = packIndexedLeaf(proof.entryIndex, proof.leafData);
  const leafHash = evmHashLeaf(indexedLeaf);
  return EvmMerkleTree.verify(proof.proof, merkleRoot, leafHash);
}

/**
 * In-memory archive store with optional DA layer backing.
 * Pass a DAProvider to enable persistent off-chain storage.
 */
export class ArchiveStore {
  private archives = new Map<string, ArchiveMetadata>();
  private daProvider?: DAProvider;
  private daCommitments = new Map<string, DACommitment>();

  constructor(daProvider?: DAProvider) {
    this.daProvider = daProvider;
  }

  /** Store an archive (in-memory only) */
  store(archive: ArchiveMetadata): void {
    this.archives.set(archive.archiveId, archive);
  }

  /** Store an archive and persist to DA layer */
  async storeWithDA(archive: ArchiveMetadata): Promise<DACommitment> {
    if (!this.daProvider) {
      throw new Error('No DA provider configured');
    }

    this.archives.set(archive.archiveId, archive);

    const serialized = serializeEntries(archive.entries);
    const commitment = await this.daProvider.submit(serialized, archive.archiveId);
    this.daCommitments.set(archive.archiveId, commitment);

    return commitment;
  }

  /** Retrieve an archive by ID, falling back to DA if not in memory */
  get(archiveId: string): ArchiveMetadata | undefined {
    return this.archives.get(archiveId);
  }

  /** Retrieve from DA layer if not in local cache */
  async retrieveFromDA(archiveId: string, commitment?: DACommitment): Promise<ArchiveMetadata | null> {
    // Check local first
    const local = this.archives.get(archiveId);
    if (local) return local;

    if (!this.daProvider) return null;

    const cm = commitment ?? this.daCommitments.get(archiveId);
    if (!cm) return null;

    const data = await this.daProvider.retrieve(cm);
    if (!data) return null;

    const entries = deserializeEntries(data);
    const archive = buildArchive(archiveId, entries);

    // Cache locally
    this.archives.set(archiveId, archive);
    this.daCommitments.set(archiveId, cm);

    return archive;
  }

  /** Check if an archive exists */
  has(archiveId: string): boolean {
    return this.archives.has(archiveId);
  }

  /** Remove an archive */
  delete(archiveId: string): boolean {
    this.daCommitments.delete(archiveId);
    return this.archives.delete(archiveId);
  }

  /** List all archive IDs */
  keys(): string[] {
    return [...this.archives.keys()];
  }

  /** Get DA commitment for an archive */
  getDACommitment(archiveId: string): DACommitment | undefined {
    return this.daCommitments.get(archiveId);
  }

  /** Get a restore proof from a stored archive */
  getRestoreProof(archiveId: string, entryIndex: number): RestoreProof {
    const archive = this.archives.get(archiveId);
    if (!archive) {
      throw new Error(`Archive ${archiveId} not found`);
    }
    return generateRestoreProof(archive, entryIndex);
  }
}
