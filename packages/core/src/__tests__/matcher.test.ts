import { describe, it, expect } from 'vitest';
import { OrderMatcher, Matchable } from '../matcher';

function makeOrder(overrides: Partial<Matchable> & { price: number; amount: number }): Matchable {
  return {
    createdAt: Math.floor(Date.now() / 1000) - 60,
    expiresAt: 0,
    ...overrides,
  };
}

describe('OrderMatcher', () => {
  const matcher = new OrderMatcher();

  it('should match crossing orders', () => {
    const bids = [makeOrder({ price: 100, amount: 10 })];
    const asks = [makeOrder({ price: 95, amount: 10 })];

    const matches = matcher.findMatches(bids, asks);
    expect(matches.length).toBe(1);
    expect(matches[0].fillAmount).toBe(10);
  });

  it('should not match non-crossing orders', () => {
    const bids = [makeOrder({ price: 90, amount: 10 })];
    const asks = [makeOrder({ price: 95, amount: 10 })];

    const matches = matcher.findMatches(bids, asks);
    expect(matches.length).toBe(0);
  });

  it('should fill at maker price', () => {
    const now = Math.floor(Date.now() / 1000);
    const bids = [makeOrder({ price: 100, amount: 10, createdAt: now - 120 })]; // maker (earlier)
    const asks = [makeOrder({ price: 95, amount: 10, createdAt: now - 60 })];   // taker

    const matches = matcher.findMatches(bids, asks);
    expect(matches[0].fillPrice).toBe(100); // maker's price
  });

  it('should handle partial fills', () => {
    const bids = [makeOrder({ price: 100, amount: 5 })];
    const asks = [makeOrder({ price: 95, amount: 10 })];

    const matches = matcher.findMatches(bids, asks);
    expect(matches[0].fillAmount).toBe(5);
  });

  it('should match multiple orders', () => {
    const bids = [
      makeOrder({ price: 100, amount: 10 }),
      makeOrder({ price: 99, amount: 5 }),
    ];
    const asks = [
      makeOrder({ price: 95, amount: 8 }),
      makeOrder({ price: 98, amount: 8 }),
    ];

    const matches = matcher.findMatches(bids, asks);
    expect(matches.length).toBeGreaterThan(0);
    // Total fill should not exceed min(total bid, total ask)
    const totalFill = matches.reduce((sum, m) => sum + m.fillAmount, 0);
    expect(totalFill).toBeLessThanOrEqual(15);
  });

  it('should return spread', () => {
    const bids = [makeOrder({ price: 100, amount: 10 })];
    const asks = [makeOrder({ price: 95, amount: 10 })];

    expect(matcher.getSpread(bids, asks)).toBe(5);
    expect(matcher.getSpread([], asks)).toBe(null);
  });

  it('should return mid price', () => {
    const bids = [makeOrder({ price: 100, amount: 10 })];
    const asks = [makeOrder({ price: 96, amount: 10 })];

    expect(matcher.getMidPrice(bids, asks)).toBe(98);
  });

  it('should return depth at price', () => {
    const orders = [
      makeOrder({ price: 100, amount: 5 }),
      makeOrder({ price: 100, amount: 3 }),
      makeOrder({ price: 99, amount: 10 }),
    ];

    expect(matcher.getDepthAtPrice(orders, 100)).toBe(8);
    expect(matcher.getDepthAtPrice(orders, 99)).toBe(10);
    expect(matcher.getDepthAtPrice(orders, 101)).toBe(0);
  });
});
