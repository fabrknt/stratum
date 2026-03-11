import { describe, it, expect } from 'vitest';
import { encodeGroth16Proof, decodeGroth16Proof, generateBatchSettlementProof } from '../zk';
import { ZKProofSystem } from '@stratum/core';

describe('encodeGroth16Proof / decodeGroth16Proof', () => {
  it('roundtrips a proof with known values', () => {
    // Create proof bytes: 8 x 32-byte uint256 values
    const proofBytes = new Uint8Array(256);
    // Set a[0] = 1
    proofBytes[31] = 1;
    // Set a[1] = 2
    proofBytes[63] = 2;
    // Set b[0][0] = 3
    proofBytes[95] = 3;
    // Set b[0][1] = 4
    proofBytes[127] = 4;
    // Set b[1][0] = 5
    proofBytes[159] = 5;
    // Set b[1][1] = 6
    proofBytes[191] = 6;
    // Set c[0] = 7
    proofBytes[223] = 7;
    // Set c[1] = 8
    proofBytes[255] = 8;

    const original = {
      proofBytes,
      publicInputs: [new Uint8Array(32)],
      system: ZKProofSystem.Groth16,
    };

    const encoded = encodeGroth16Proof(original);
    expect(typeof encoded).toBe('string');

    const decoded = decodeGroth16Proof(encoded);
    expect(decoded.system).toBe(ZKProofSystem.Groth16);
    expect(decoded.proofBytes.length).toBe(256);

    // Verify roundtrip preserves values
    for (let i = 0; i < 256; i++) {
      expect(decoded.proofBytes[i]).toBe(proofBytes[i]);
    }
  });

  it('roundtrips with large uint256 values', () => {
    const proofBytes = new Uint8Array(256);
    // Fill with a pattern
    for (let i = 0; i < 256; i++) {
      proofBytes[i] = i % 256;
    }

    const original = {
      proofBytes,
      publicInputs: [],
      system: ZKProofSystem.Groth16,
    };

    const encoded = encodeGroth16Proof(original);
    const decoded = decodeGroth16Proof(encoded);

    for (let i = 0; i < 256; i++) {
      expect(decoded.proofBytes[i]).toBe(proofBytes[i]);
    }
  });

  it('throws for non-Groth16 proof', () => {
    const proof = {
      proofBytes: new Uint8Array(256),
      publicInputs: [],
      system: ZKProofSystem.PlonK,
    };

    expect(() => encodeGroth16Proof(proof)).toThrow('Expected Groth16');
  });

  it('throws for short proof bytes', () => {
    const proof = {
      proofBytes: new Uint8Array(128), // too short
      publicInputs: [],
      system: ZKProofSystem.Groth16,
    };

    expect(() => encodeGroth16Proof(proof)).toThrow('Proof bytes too short');
  });
});

describe('generateBatchSettlementProof', () => {
  it('generates proof with correct public inputs', async () => {
    const batch = {
      oldRoot: '0x' + 'aa'.repeat(32),
      newRoot: '0x' + 'bb'.repeat(32),
      settlementCount: 2,
      settlements: [
        {
          makerLeafHash: '0x' + '11'.repeat(32),
          takerLeafHash: '0x' + '22'.repeat(32),
          fillAmount: 1000n,
          fillPrice: 50n,
        },
        {
          makerLeafHash: '0x' + '33'.repeat(32),
          takerLeafHash: '0x' + '44'.repeat(32),
          fillAmount: 2000n,
          fillPrice: 75n,
        },
      ],
    };

    const proof = await generateBatchSettlementProof(batch);

    expect(proof.system).toBe(ZKProofSystem.Groth16);
    expect(proof.publicInputs.length).toBe(4); // oldRoot, newRoot, count, commitment
    expect(proof.proofBytes.length).toBe(256);

    // Verify oldRoot public input
    expect(proof.publicInputs[0]).toEqual(new Uint8Array(32).fill(0xaa));
    // Verify newRoot public input
    expect(proof.publicInputs[1]).toEqual(new Uint8Array(32).fill(0xbb));

    // Count is big-endian at offset 28 (uint256 with value 2)
    const countView = new DataView(proof.publicInputs[2].buffer);
    expect(countView.getUint32(28, false)).toBe(2);
  });

  it('produces deterministic commitment for same inputs', async () => {
    const batch = {
      oldRoot: '0x' + '00'.repeat(32),
      newRoot: '0x' + 'ff'.repeat(32),
      settlementCount: 1,
      settlements: [
        {
          makerLeafHash: '0x' + 'ab'.repeat(32),
          takerLeafHash: '0x' + 'cd'.repeat(32),
          fillAmount: 100n,
          fillPrice: 10n,
        },
      ],
    };

    const proof1 = await generateBatchSettlementProof(batch);
    const proof2 = await generateBatchSettlementProof(batch);

    // Commitment (4th public input) should be identical
    expect(proof1.publicInputs[3]).toEqual(proof2.publicInputs[3]);
  });
});
