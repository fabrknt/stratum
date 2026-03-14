import type { HashFunction } from '@fabrknt/stratum-core';

/**
 * Solana hash function — FNV-1a variant expanded to 256 bits.
 * Matches the on-chain Rust implementation in programs/stratum.
 */
function rotateLeft32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

export const solanaHash: HashFunction = (data: Uint8Array): Uint8Array => {
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  for (let i = 0; i < data.length; i++) {
    const idx = i % 8;
    state[idx] = Math.imul(state[idx], 0x01000193) + data[i];
    state[(idx + 1) % 8] ^= rotateLeft32(state[idx], 5);
  }

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
};
