import { AbiCoder, keccak256 } from 'ethers';
import type { ZKProof } from '@stratum/core';
import { ZKProofSystem } from '@stratum/core';

/** Batch settlement data for ZK proof generation */
export interface BatchSettlement {
  oldRoot: string;
  newRoot: string;
  settlementCount: number;
  settlements: {
    makerLeafHash: string;
    takerLeafHash: string;
    fillAmount: bigint;
    fillPrice: bigint;
  }[];
}

/**
 * Encode a Groth16 proof into ABI format for on-chain verification.
 * Expects proofBytes to contain: a[2], b[2][2], c[2] as 256-bit integers (8 x 32 bytes).
 */
export function encodeGroth16Proof(proof: ZKProof): string {
  if (proof.system !== ZKProofSystem.Groth16) {
    throw new Error(`Expected Groth16 proof, got ${proof.system}`);
  }

  if (proof.proofBytes.length < 256) {
    throw new Error(`Proof bytes too short: expected 256, got ${proof.proofBytes.length}`);
  }

  const readUint256 = (offset: number): bigint => {
    let value = 0n;
    for (let i = 0; i < 32; i++) {
      value = (value << 8n) | BigInt(proof.proofBytes[offset + i]);
    }
    return value;
  };

  const a: [bigint, bigint] = [readUint256(0), readUint256(32)];
  const b: [[bigint, bigint], [bigint, bigint]] = [
    [readUint256(64), readUint256(96)],
    [readUint256(128), readUint256(160)],
  ];
  const c: [bigint, bigint] = [readUint256(192), readUint256(224)];

  const coder = AbiCoder.defaultAbiCoder();
  return coder.encode(
    ['uint256[2]', 'uint256[2][2]', 'uint256[2]'],
    [a, b, c],
  );
}

/**
 * Decode ABI-encoded Groth16 proof back into ZKProof.
 */
export function decodeGroth16Proof(encoded: string): ZKProof {
  const coder = AbiCoder.defaultAbiCoder();
  const [a, b, c] = coder.decode(
    ['uint256[2]', 'uint256[2][2]', 'uint256[2]'],
    encoded,
  );

  const proofBytes = new Uint8Array(256);
  const writeUint256 = (value: bigint, offset: number) => {
    for (let i = 31; i >= 0; i--) {
      proofBytes[offset + i] = Number(value & 0xffn);
      value >>= 8n;
    }
  };

  writeUint256(a[0], 0);
  writeUint256(a[1], 32);
  writeUint256(b[0][0], 64);
  writeUint256(b[0][1], 96);
  writeUint256(b[1][0], 128);
  writeUint256(b[1][1], 160);
  writeUint256(c[0], 192);
  writeUint256(c[1], 224);

  return {
    proofBytes,
    publicInputs: [],
    system: ZKProofSystem.Groth16,
  };
}

/**
 * Generate a batch settlement proof.
 * Computes commitment hash of all settlements for on-chain verification.
 */
export async function generateBatchSettlementProof(
  batch: BatchSettlement,
): Promise<ZKProof> {
  // Compute settlement commitment: keccak256 of concatenated settlement data
  let commitmentData = batch.oldRoot + batch.newRoot.slice(2);
  for (const s of batch.settlements) {
    commitmentData += s.makerLeafHash.slice(2);
    commitmentData += s.takerLeafHash.slice(2);
  }
  const commitment = keccak256(commitmentData);

  // Encode public inputs
  const oldRootBytes = hexToBytes(batch.oldRoot);
  const newRootBytes = hexToBytes(batch.newRoot);
  const countBytes = new Uint8Array(32);
  new DataView(countBytes.buffer).setUint32(28, batch.settlementCount, false);
  const commitmentBytes = hexToBytes(commitment);

  // Mock proof bytes (256 bytes of zeros — real ZK backend would fill this)
  const proofBytes = new Uint8Array(256);

  return {
    proofBytes,
    publicInputs: [oldRootBytes, newRootBytes, countBytes, commitmentBytes],
    system: ZKProofSystem.Groth16,
  };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
