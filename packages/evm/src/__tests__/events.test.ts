import { describe, it, expect } from 'vitest';
import { keccak256, solidityPacked } from 'ethers';
import {
  emptyHistorySummary,
  applyRecord,
  rebuildSummary,
  verifyHashChain,
  validateEventChain,
} from '../events';
import type { RecordAddedEvent } from '../client';

const ZERO_HASH = '0x' + '00'.repeat(32);

describe('emptyHistorySummary', () => {
  it('returns zeroed summary', () => {
    const summary = emptyHistorySummary();
    expect(summary.count).toBe(0n);
    expect(summary.sum).toBe(0n);
    expect(summary.min).toBe(0n);
    expect(summary.max).toBe(0n);
    expect(summary.lastHash).toBe(ZERO_HASH);
  });
});

describe('applyRecord', () => {
  it('sets min/max on first record', () => {
    const summary = applyRecord(emptyHistorySummary(), 100n, '0x');
    expect(summary.count).toBe(1n);
    expect(summary.sum).toBe(100n);
    expect(summary.min).toBe(100n);
    expect(summary.max).toBe(100n);
  });

  it('updates min/max on subsequent records', () => {
    let summary = applyRecord(emptyHistorySummary(), 100n, '0x');
    summary = applyRecord(summary, 50n, '0x');
    summary = applyRecord(summary, 200n, '0x');

    expect(summary.count).toBe(3n);
    expect(summary.sum).toBe(350n);
    expect(summary.min).toBe(50n);
    expect(summary.max).toBe(200n);
  });

  it('computes hash chain correctly', () => {
    const value = 42n;
    const data = '0xdeadbeef';

    const summary = applyRecord(emptyHistorySummary(), value, data);

    // Manual computation: keccak256(abi.encodePacked(bytes32(0), uint128(42), bytes(0xdeadbeef)))
    const expectedHash = keccak256(
      solidityPacked(['bytes32', 'uint128', 'bytes'], [ZERO_HASH, value, data]),
    );

    expect(summary.lastHash).toBe(expectedHash);
  });

  it('chains hashes across records', () => {
    let summary = emptyHistorySummary();
    const v1 = 10n;
    const d1 = '0xaa';
    const v2 = 20n;
    const d2 = '0xbb';

    summary = applyRecord(summary, v1, d1);
    const hash1 = summary.lastHash;

    summary = applyRecord(summary, v2, d2);

    // Second hash should chain from first
    const expectedHash2 = keccak256(
      solidityPacked(['bytes32', 'uint128', 'bytes'], [hash1, v2, d2]),
    );

    expect(summary.lastHash).toBe(expectedHash2);
  });
});

describe('rebuildSummary', () => {
  it('reconstructs from events', () => {
    const events: RecordAddedEvent[] = [
      { summaryId: ZERO_HASH, value: 100n, data: '0xaa', newHash: '', count: 1n },
      { summaryId: ZERO_HASH, value: 50n, data: '0xbb', newHash: '', count: 2n },
      { summaryId: ZERO_HASH, value: 200n, data: '0xcc', newHash: '', count: 3n },
    ];

    const summary = rebuildSummary(events);

    expect(summary.count).toBe(3n);
    expect(summary.sum).toBe(350n);
    expect(summary.min).toBe(50n);
    expect(summary.max).toBe(200n);
  });

  it('matches manual step-by-step computation', () => {
    let manual = emptyHistorySummary();
    manual = applyRecord(manual, 10n, '0x01');
    manual = applyRecord(manual, 20n, '0x02');

    const events: RecordAddedEvent[] = [
      { summaryId: ZERO_HASH, value: 10n, data: '0x01', newHash: '', count: 1n },
      { summaryId: ZERO_HASH, value: 20n, data: '0x02', newHash: '', count: 2n },
    ];

    const rebuilt = rebuildSummary(events);

    expect(rebuilt.count).toBe(manual.count);
    expect(rebuilt.sum).toBe(manual.sum);
    expect(rebuilt.lastHash).toBe(manual.lastHash);
  });
});

describe('verifyHashChain', () => {
  it('verifies a valid chain', () => {
    const values = [10n, 20n, 30n];
    const datas = ['0xaa', '0xbb', '0xcc'];

    // Compute expected final hash
    let hash = ZERO_HASH;
    for (let i = 0; i < values.length; i++) {
      hash = keccak256(
        solidityPacked(['bytes32', 'uint128', 'bytes'], [hash, values[i], datas[i]]),
      );
    }

    expect(verifyHashChain(hash, values, datas)).toBe(true);
  });

  it('rejects tampered values', () => {
    const values = [10n, 20n];
    const datas = ['0xaa', '0xbb'];

    let hash = ZERO_HASH;
    for (let i = 0; i < values.length; i++) {
      hash = keccak256(
        solidityPacked(['bytes32', 'uint128', 'bytes'], [hash, values[i], datas[i]]),
      );
    }

    // Tamper
    const tamperedValues = [10n, 999n];
    expect(verifyHashChain(hash, tamperedValues, datas)).toBe(false);
  });

  it('rejects wrong expected hash', () => {
    const values = [10n];
    const datas = ['0x'];
    const wrongHash = '0x' + 'ff'.repeat(32);

    expect(verifyHashChain(wrongHash, values, datas)).toBe(false);
  });

  it('throws on length mismatch', () => {
    expect(() => verifyHashChain(ZERO_HASH, [1n, 2n], ['0x'])).toThrow(
      'values and datas must have the same length',
    );
  });

  it('handles custom start hash', () => {
    const startHash = keccak256('0x1234');
    const values = [10n];
    const datas = ['0xaa'];

    const expectedHash = keccak256(
      solidityPacked(['bytes32', 'uint128', 'bytes'], [startHash, values[0], datas[0]]),
    );

    expect(verifyHashChain(expectedHash, values, datas, startHash)).toBe(true);
  });
});

describe('validateEventChain', () => {
  it('validates a correct event chain', () => {
    let hash = ZERO_HASH;
    const events: RecordAddedEvent[] = [];

    for (let i = 0; i < 3; i++) {
      const value = BigInt((i + 1) * 10);
      const data = '0x' + (i + 1).toString(16).padStart(2, '0');
      hash = keccak256(solidityPacked(['bytes32', 'uint128', 'bytes'], [hash, value, data]));
      events.push({
        summaryId: ZERO_HASH,
        value,
        data,
        newHash: hash,
        count: BigInt(i + 1),
      });
    }

    expect(validateEventChain(events)).toBe(true);
  });

  it('rejects a chain with a tampered hash', () => {
    let hash = ZERO_HASH;
    const value = 100n;
    const data = '0xaa';
    hash = keccak256(solidityPacked(['bytes32', 'uint128', 'bytes'], [hash, value, data]));

    const events: RecordAddedEvent[] = [
      {
        summaryId: ZERO_HASH,
        value,
        data,
        newHash: '0x' + 'ff'.repeat(32), // tampered
        count: 1n,
      },
    ];

    expect(validateEventChain(events)).toBe(false);
  });

  it('validates empty chain', () => {
    expect(validateEventChain([])).toBe(true);
  });
});
