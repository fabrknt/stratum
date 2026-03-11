import type { Provider } from 'ethers';

/** View of on-chain DynamicExpiryConfig for off-chain estimation */
export interface DynamicExpiryConfigView {
  baseRewardBps: number;
  maxRewardBps: number;
  escalationPeriod: number;
  gasRewardMultiplier: number;
}

/** View of on-chain DynamicEntry for off-chain estimation */
export interface DynamicEntryView {
  deposit: bigint;
  expiresAt: number;
  exists: boolean;
}

/** A profitable cleanup opportunity */
export interface CleanupOpportunity {
  entryId: string;
  estimatedReward: bigint;
  estimatedGasCost: bigint;
  netProfit: bigint;
  overdueSeconds: number;
  deposit: bigint;
}

/**
 * Estimate dynamic cleanup reward off-chain.
 * Mirrors the Solidity StratumDynamicExpiry.calculateDynamicReward logic.
 */
export async function estimateCleanupReward(
  provider: Provider,
  config: DynamicExpiryConfigView,
  entry: DynamicEntryView,
): Promise<{ totalReward: bigint; gasComponent: bigint; timeComponent: bigint }> {
  if (!entry.exists || entry.deposit === 0n) {
    return { totalReward: 0n, gasComponent: 0n, timeComponent: 0n };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= entry.expiresAt) {
    return { totalReward: 0n, gasComponent: 0n, timeComponent: 0n };
  }

  const deposit = entry.deposit;

  // 1. Base reward
  const baseReward = (deposit * BigInt(config.baseRewardBps)) / 10000n;

  // 2. Time escalation
  const overdueSeconds = now - entry.expiresAt;
  let escalation = 0n;
  if (config.escalationPeriod > 0) {
    const factor = overdueSeconds >= config.escalationPeriod
      ? 10000n
      : (BigInt(overdueSeconds) * 10000n) / BigInt(config.escalationPeriod);
    const bonusBps = BigInt(config.maxRewardBps - config.baseRewardBps) * factor / 10000n;
    escalation = (deposit * bonusBps) / 10000n;
  }
  const timeComponent = baseReward + escalation;

  // 3. Gas cost coverage
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 0n;
  const estimatedGas = 200_000n;
  const gasCost = gasPrice * estimatedGas;
  const gasComponent = (gasCost * BigInt(config.gasRewardMultiplier)) / 10000n;

  // Total = max(time, gas), capped at maxRewardBps
  let totalReward = timeComponent > gasComponent ? timeComponent : gasComponent;
  const maxReward = (deposit * BigInt(config.maxRewardBps)) / 10000n;
  if (totalReward > maxReward) {
    totalReward = maxReward;
  }

  return { totalReward, gasComponent, timeComponent };
}

/**
 * Scan entries and find profitable cleanup opportunities.
 * Returns entries sorted by net profit (highest first).
 */
export async function findProfitableCleanups(
  provider: Provider,
  config: DynamicExpiryConfigView,
  entries: { id: string; entry: DynamicEntryView }[],
): Promise<CleanupOpportunity[]> {
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? 0n;
  const estimatedGas = 200_000n;
  const estimatedGasCost = gasPrice * estimatedGas;

  const now = Math.floor(Date.now() / 1000);
  const opportunities: CleanupOpportunity[] = [];

  for (const { id, entry } of entries) {
    if (!entry.exists || now <= entry.expiresAt) continue;

    const { totalReward } = await estimateCleanupReward(provider, config, entry);

    const netProfit = totalReward - estimatedGasCost;
    if (netProfit > 0n) {
      opportunities.push({
        entryId: id,
        estimatedReward: totalReward,
        estimatedGasCost,
        netProfit,
        overdueSeconds: now - entry.expiresAt,
        deposit: entry.deposit,
      });
    }
  }

  // Sort by net profit descending
  opportunities.sort((a, b) => {
    if (b.netProfit > a.netProfit) return 1;
    if (b.netProfit < a.netProfit) return -1;
    return 0;
  });

  return opportunities;
}
