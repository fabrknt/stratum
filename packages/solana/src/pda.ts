import { PublicKey } from '@solana/web3.js';

/**
 * Derive PDA for bitfield registry
 */
export function deriveBitfieldRegistryPDA(
  authority: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bitfield_registry'), authority.toBuffer()],
    programId
  );
}

/**
 * Derive PDA for bitfield chunk
 */
export function deriveBitfieldChunkPDA(
  registry: PublicKey,
  chunkIndex: number,
  programId: PublicKey
): [PublicKey, number] {
  const chunkIndexBuf = Buffer.alloc(4);
  chunkIndexBuf.writeUInt32LE(chunkIndex);

  return PublicKey.findProgramAddressSync(
    [Buffer.from('bitfield_chunk'), registry.toBuffer(), chunkIndexBuf],
    programId
  );
}
