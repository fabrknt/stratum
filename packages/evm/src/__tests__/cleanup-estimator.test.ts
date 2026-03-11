import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { estimateCleanupReward, findProfitableCleanups } from '../cleanup-estimator';
import type { DynamicExpiryConfigView, DynamicEntryView } from '../cleanup-estimator';

// Mock provider with configurable gas price
function mockProvider(gasPriceGwei: number = 30) {
  return {
    getFeeData: vi.fn().mockResolvedValue({
      gasPrice: BigInt(gasPriceGwei) * 1_000_000_000n,
    }),
  } as any;
}

const defaultConfig: DynamicExpiryConfigView = {
  baseRewardBps: 100,       // 1%
  maxRewardBps: 5000,       // 50%
  escalationPeriod: 86400,  // 24 hours
  gasRewardMultiplier: 15000, // 1.5x
};

describe('estimateCleanupReward', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns zero for non-existent entry', async () => {
    const provider = mockProvider();
    const entry: DynamicEntryView = { deposit: 1000n, expiresAt: 0, exists: false };
    const result = await estimateCleanupReward(provider, defaultConfig, entry);
    expect(result.totalReward).toBe(0n);
  });

  it('returns zero for zero deposit', async () => {
    const provider = mockProvider();
    const entry: DynamicEntryView = { deposit: 0n, expiresAt: 0, exists: true };
    const result = await estimateCleanupReward(provider, defaultConfig, entry);
    expect(result.totalReward).toBe(0n);
  });

  it('returns zero when not yet expired', async () => {
    const provider = mockProvider();
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const entry: DynamicEntryView = { deposit: 1_000_000_000n, expiresAt: futureExpiry, exists: true };
    const result = await estimateCleanupReward(provider, defaultConfig, entry);
    expect(result.totalReward).toBe(0n);
  });

  it('computes base reward right after expiry', async () => {
    const now = 1_000_000;
    vi.setSystemTime(now * 1000);
    const provider = mockProvider(0); // zero gas to isolate time component

    const deposit = 10_000_000_000n; // 10 ETH in wei-ish
    const entry: DynamicEntryView = { deposit, expiresAt: now - 1, exists: true };
    const result = await estimateCleanupReward(provider, defaultConfig, entry);

    // Base reward = deposit * 100 / 10000 = 1%
    const expectedBase = deposit / 100n;
    expect(result.timeComponent).toBe(expectedBase);
  });

  it('escalates to max after full escalation period', async () => {
    const now = 1_000_000;
    vi.setSystemTime(now * 1000);
    const provider = mockProvider(0);

    const deposit = 10_000_000_000n;
    // Expired one full escalation period ago
    const entry: DynamicEntryView = {
      deposit,
      expiresAt: now - defaultConfig.escalationPeriod,
      exists: true,
    };
    const result = await estimateCleanupReward(provider, defaultConfig, entry);

    // At full escalation: base + full bonus
    // bonus = deposit * (maxRewardBps - baseRewardBps) / 10000 = deposit * 4900/10000
    const expectedMax = (deposit * 5000n) / 10000n; // base(100) + bonus(4900) = max(5000) bps
    expect(result.timeComponent).toBe(expectedMax);
  });

  it('caps reward at maxRewardBps', async () => {
    const now = 1_000_000;
    vi.setSystemTime(now * 1000);
    // Very high gas price to push gas component above max
    const provider = mockProvider(10000);

    const deposit = 1_000n; // tiny deposit, gas would exceed max
    const entry: DynamicEntryView = { deposit, expiresAt: now - 1, exists: true };
    const result = await estimateCleanupReward(provider, defaultConfig, entry);

    const maxReward = (deposit * BigInt(defaultConfig.maxRewardBps)) / 10000n;
    expect(result.totalReward).toBeLessThanOrEqual(maxReward);
  });

  it('gas component reflects gas price', async () => {
    const now = 1_000_000;
    vi.setSystemTime(now * 1000);
    const gasPriceGwei = 50;
    const provider = mockProvider(gasPriceGwei);

    const deposit = 100_000_000_000_000_000_000n; // large deposit so cap doesn't kick in
    const entry: DynamicEntryView = { deposit, expiresAt: now - 1, exists: true };
    const result = await estimateCleanupReward(provider, defaultConfig, entry);

    // gas = gasPrice * 200000 * multiplier / 10000
    const expectedGas =
      (BigInt(gasPriceGwei) * 1_000_000_000n * 200_000n * BigInt(defaultConfig.gasRewardMultiplier)) / 10000n;
    expect(result.gasComponent).toBe(expectedGas);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('findProfitableCleanups', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('returns empty for no entries', async () => {
    const provider = mockProvider();
    const result = await findProfitableCleanups(provider, defaultConfig, []);
    expect(result).toEqual([]);
  });

  it('filters out unexpired entries', async () => {
    const now = 1_000_000;
    vi.setSystemTime(now * 1000);
    const provider = mockProvider(0);

    const entries = [
      { id: 'not-expired', entry: { deposit: 1_000_000n, expiresAt: now + 3600, exists: true } },
    ];
    const result = await findProfitableCleanups(provider, defaultConfig, entries);
    expect(result).toEqual([]);
  });

  it('filters out non-existent entries', async () => {
    const now = 1_000_000;
    vi.setSystemTime(now * 1000);
    const provider = mockProvider(0);

    const entries = [
      { id: 'gone', entry: { deposit: 1_000_000n, expiresAt: now - 100, exists: false } },
    ];
    const result = await findProfitableCleanups(provider, defaultConfig, entries);
    expect(result).toEqual([]);
  });

  it('returns profitable entries sorted by net profit descending', async () => {
    const now = 1_000_000;
    vi.setSystemTime(now * 1000);
    const provider = mockProvider(0); // zero gas => zero gas cost

    const entries = [
      { id: 'small', entry: { deposit: 1_000_000_000n, expiresAt: now - 3600, exists: true } },
      { id: 'large', entry: { deposit: 10_000_000_000n, expiresAt: now - 3600, exists: true } },
      { id: 'medium', entry: { deposit: 5_000_000_000n, expiresAt: now - 3600, exists: true } },
    ];

    const result = await findProfitableCleanups(provider, defaultConfig, entries);
    expect(result.length).toBe(3);
    // Should be sorted: large, medium, small
    expect(result[0].entryId).toBe('large');
    expect(result[1].entryId).toBe('medium');
    expect(result[2].entryId).toBe('small');
    // All should have positive net profit
    for (const opp of result) {
      expect(opp.netProfit).toBeGreaterThan(0n);
    }
  });

  it('excludes unprofitable entries when gas cost is high', async () => {
    const now = 1_000_000;
    vi.setSystemTime(now * 1000);
    const provider = mockProvider(100); // 100 gwei gas price

    // Tiny deposit — reward won't cover gas
    const entries = [
      { id: 'tiny', entry: { deposit: 1n, expiresAt: now - 1, exists: true } },
    ];
    const result = await findProfitableCleanups(provider, defaultConfig, entries);
    expect(result).toEqual([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
