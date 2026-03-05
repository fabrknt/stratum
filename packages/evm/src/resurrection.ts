import { keccak256 } from 'ethers';
import { EvmMerkleTree } from './merkle';
import { evmHashLeaf } from './hash';

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
  const tree = new EvmMerkleTree(entries);

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

  const tree = new EvmMerkleTree(archive.entries);
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
  const tree = new EvmMerkleTree(archive.entries);

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
  const leafHash = evmHashLeaf(proof.leafData);
  return EvmMerkleTree.verify(proof.proof, merkleRoot, leafHash);
}

/**
 * Simple in-memory archive store.
 * For production, implement persistent storage (IPFS, S3, database, etc.)
 */
export class ArchiveStore {
  private archives = new Map<string, ArchiveMetadata>();

  /** Store an archive */
  store(archive: ArchiveMetadata): void {
    this.archives.set(archive.archiveId, archive);
  }

  /** Retrieve an archive by ID */
  get(archiveId: string): ArchiveMetadata | undefined {
    return this.archives.get(archiveId);
  }

  /** Check if an archive exists */
  has(archiveId: string): boolean {
    return this.archives.has(archiveId);
  }

  /** Remove an archive */
  delete(archiveId: string): boolean {
    return this.archives.delete(archiveId);
  }

  /** List all archive IDs */
  keys(): string[] {
    return [...this.archives.keys()];
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
