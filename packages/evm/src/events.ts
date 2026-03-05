import { keccak256, solidityPacked } from 'ethers';
import type { RecordAddedEvent } from './client';

/**
 * Off-chain HistorySummary matching the Solidity StratumEvents.HistorySummary struct.
 * Reconstructed from RecordAdded events.
 */
export interface HistorySummary {
  count: bigint;
  sum: bigint;
  min: bigint;
  max: bigint;
  lastHash: string;
}

/**
 * Create an empty HistorySummary.
 */
export function emptyHistorySummary(): HistorySummary {
  return {
    count: 0n,
    sum: 0n,
    min: 0n,
    max: 0n,
    lastHash: '0x' + '00'.repeat(32),
  };
}

/**
 * Apply a single record to a HistorySummary.
 * Mirrors the Solidity StratumEvents.addRecord logic exactly.
 */
export function applyRecord(
  summary: HistorySummary,
  value: bigint,
  data: string,
): HistorySummary {
  const newCount = summary.count + 1n;
  const newSum = summary.sum + value;

  let newMin = summary.min;
  let newMax = summary.max;
  if (newCount === 1n) {
    newMin = value;
    newMax = value;
  } else {
    if (value < newMin) newMin = value;
    if (value > newMax) newMax = value;
  }

  // Hash chain: keccak256(abi.encodePacked(prevHash, value, data))
  const newHash = keccak256(
    solidityPacked(['bytes32', 'uint128', 'bytes'], [summary.lastHash, value, data]),
  );

  return {
    count: newCount,
    sum: newSum,
    min: newMin,
    max: newMax,
    lastHash: newHash,
  };
}

/**
 * Rebuild a HistorySummary from a sequence of RecordAdded events.
 * Events must be in chronological order.
 */
export function rebuildSummary(events: RecordAddedEvent[]): HistorySummary {
  let summary = emptyHistorySummary();
  for (const event of events) {
    summary = applyRecord(summary, event.value, event.data);
  }
  return summary;
}

/**
 * Verify a hash chain by replaying values and data.
 * Matches Solidity StratumEvents.verifyHashChain.
 *
 * @param expectedHash The expected final hash
 * @param values Array of uint128 values in order
 * @param datas Array of data payloads (hex bytes) in order
 * @param startHash Starting hash (0x00...00 for genesis)
 * @returns true if the replayed hash matches expectedHash
 */
export function verifyHashChain(
  expectedHash: string,
  values: bigint[],
  datas: string[],
  startHash: string = '0x' + '00'.repeat(32),
): boolean {
  if (values.length !== datas.length) {
    throw new Error('values and datas must have the same length');
  }

  let computedHash = startHash;
  for (let i = 0; i < values.length; i++) {
    computedHash = keccak256(
      solidityPacked(['bytes32', 'uint128', 'bytes'], [computedHash, values[i], datas[i]]),
    );
  }

  return computedHash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Validate that a sequence of RecordAdded events forms a valid hash chain.
 * Each event's newHash must match the computed hash from the previous event.
 */
export function validateEventChain(events: RecordAddedEvent[]): boolean {
  let prevHash = '0x' + '00'.repeat(32);

  for (const event of events) {
    const expectedHash = keccak256(
      solidityPacked(['bytes32', 'uint128', 'bytes'], [prevHash, event.value, event.data]),
    );

    if (expectedHash.toLowerCase() !== event.newHash.toLowerCase()) {
      return false;
    }

    prevHash = event.newHash;
  }

  return true;
}
