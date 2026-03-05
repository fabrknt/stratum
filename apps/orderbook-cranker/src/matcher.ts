import { OrderMatcher as CoreMatcher } from '@stratum/core';
import { Order, MatchResult } from './types';

/**
 * Price-time priority order matcher.
 * Wraps @stratum/core OrderMatcher with Solana-specific Order types.
 */
export class OrderMatcher {
  private core = new CoreMatcher();

  findMatches(bids: Order[], asks: Order[]): MatchResult[] {
    return this.core.findMatches(bids, asks) as MatchResult[];
  }

  getSpread(bids: Order[], asks: Order[]): number | null {
    return this.core.getSpread(bids, asks);
  }

  getMidPrice(bids: Order[], asks: Order[]): number | null {
    return this.core.getMidPrice(bids, asks);
  }

  getDepthAtPrice(orders: Order[], price: number): number {
    return this.core.getDepthAtPrice(orders, price);
  }
}
