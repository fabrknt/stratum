import { describe, it, expect, beforeEach } from 'vitest';
import { Keypair, PublicKey } from '@solana/web3.js';
import { OrderStore } from '../order-store';
import { OrderMatcher } from '../matcher';
import { OrderSide } from '../types';
import type { Order, MatchResult, EpochState } from '../types';

/**
 * E2E-style tests for the cranker's off-chain components.
 * Tests the full lifecycle: order submission → tree building → matching → settlement proof generation.
 * Does not require a running validator — tests the cranker's local logic.
 */

describe('OrderStore', () => {
  let store: OrderStore;
  const maker1 = Keypair.generate().publicKey;
  const maker2 = Keypair.generate().publicKey;

  beforeEach(() => {
    store = new OrderStore(4); // small capacity for testing rotation
  });

  it('adds orders and assigns sequential IDs', () => {
    const o1 = store.addOrder(maker1, OrderSide.Bid, 100, 10);
    const o2 = store.addOrder(maker2, OrderSide.Ask, 105, 5);

    expect(o1.orderId).toBe(1);
    expect(o2.orderId).toBe(2);
    expect(o1.epochIndex).toBe(0);
    expect(o1.orderIndex).toBe(0);
    expect(o2.orderIndex).toBe(1);
  });

  it('maintains sorted bid book (descending by price)', () => {
    store.addOrder(maker1, OrderSide.Bid, 100, 10);
    store.addOrder(maker2, OrderSide.Bid, 110, 5);
    store.addOrder(maker1, OrderSide.Bid, 105, 8);

    const bids = store.getBids();
    expect(bids[0].price).toBe(110);
    expect(bids[1].price).toBe(105);
    expect(bids[2].price).toBe(100);
  });

  it('maintains sorted ask book (ascending by price)', () => {
    store.addOrder(maker1, OrderSide.Ask, 105, 10);
    store.addOrder(maker2, OrderSide.Ask, 100, 5);
    store.addOrder(maker1, OrderSide.Ask, 110, 8);

    const asks = store.getAsks();
    expect(asks[0].price).toBe(100);
    expect(asks[1].price).toBe(105);
    expect(asks[2].price).toBe(110);
  });

  it('rotates epoch when capacity exceeded', () => {
    store.addOrder(maker1, OrderSide.Bid, 100, 10);
    store.addOrder(maker1, OrderSide.Bid, 101, 10);
    store.addOrder(maker1, OrderSide.Bid, 102, 10);
    store.addOrder(maker1, OrderSide.Bid, 103, 10);

    // 5th order triggers rotation
    const o5 = store.addOrder(maker1, OrderSide.Bid, 104, 10);
    expect(o5.epochIndex).toBe(1);
    expect(store.activeEpochIndex).toBe(1);

    // Previous epoch should be finalized
    const epoch0 = store.getEpoch(0);
    expect(epoch0!.isFinalized).toBe(true);
  });

  it('builds merkle tree from epoch orders', () => {
    store.addOrder(maker1, OrderSide.Bid, 100, 10);
    store.addOrder(maker2, OrderSide.Ask, 105, 5);

    const tree = store.buildMerkleTree(0);
    expect(tree).not.toBeNull();
    expect(tree!.root.length).toBe(32);

    // Root should be stored in epoch state
    const epoch = store.getEpoch(0);
    expect(epoch!.merkleRoot).not.toBeNull();
  });

  it('generates valid merkle proofs', () => {
    store.addOrder(maker1, OrderSide.Bid, 100, 10);
    store.addOrder(maker2, OrderSide.Ask, 105, 5);
    store.addOrder(maker1, OrderSide.Bid, 110, 8);
    store.addOrder(maker2, OrderSide.Ask, 95, 3);

    store.buildMerkleTree(0);

    const proof0 = store.getMerkleProof(0, 0);
    expect(proof0).not.toBeNull();
    expect(proof0!.proof.length).toBeGreaterThan(0);
    expect(proof0!.root.length).toBe(32);

    const proof3 = store.getMerkleProof(0, 3);
    expect(proof3).not.toBeNull();
    // Roots should match
    expect(proof0!.root.equals(proof3!.root)).toBe(true);
  });

  it('returns null proof for non-existent epoch', () => {
    expect(store.getMerkleProof(99, 0)).toBeNull();
  });

  it('removes orders from books', () => {
    const o1 = store.addOrder(maker1, OrderSide.Bid, 100, 10);
    store.addOrder(maker2, OrderSide.Bid, 105, 5);

    expect(store.getBids().length).toBe(2);
    store.removeOrder(o1.orderId);
    expect(store.getBids().length).toBe(1);
    expect(store.getBids()[0].price).toBe(105);
  });

  it('serializes order to correct binary format', () => {
    const order: Order = {
      maker: maker1,
      orderId: 1,
      side: OrderSide.Bid,
      price: 1000,
      amount: 500,
      epochIndex: 0,
      orderIndex: 0,
      createdAt: 1700000000,
      expiresAt: 1700003600,
    };

    const buf = store.serializeOrder(order);

    // Expected size: 32 + 8 + 1 + 8 + 8 + 4 + 4 + 8 + 8 = 81 bytes
    expect(buf.length).toBe(81);

    // Verify maker pubkey at offset 0
    expect(buf.slice(0, 32).equals(maker1.toBuffer())).toBe(true);

    // Verify order_id at offset 32 (u64 LE)
    expect(buf.readBigUInt64LE(32)).toBe(1n);

    // Verify side at offset 40 (0 = Bid)
    expect(buf[40]).toBe(0);

    // Verify price at offset 41 (u64 LE)
    expect(buf.readBigUInt64LE(41)).toBe(1000n);
  });

  it('tracks total orders across epochs', () => {
    store.addOrder(maker1, OrderSide.Bid, 100, 10);
    store.addOrder(maker1, OrderSide.Bid, 101, 10);
    store.addOrder(maker1, OrderSide.Bid, 102, 10);
    store.addOrder(maker1, OrderSide.Bid, 103, 10);
    store.addOrder(maker1, OrderSide.Bid, 104, 10); // triggers rotation

    expect(store.totalOrders).toBe(5);
  });
});

describe('OrderMatcher', () => {
  const matcher = new OrderMatcher();
  const maker1 = Keypair.generate().publicKey;
  const maker2 = Keypair.generate().publicKey;

  function makeOrder(
    side: OrderSide,
    price: number,
    amount: number,
    orderId: number = 1,
  ): Order {
    return {
      maker: side === OrderSide.Bid ? maker1 : maker2,
      orderId,
      side,
      price,
      amount,
      epochIndex: 0,
      orderIndex: 0,
      createdAt: Date.now(),
      expiresAt: 0,
    };
  }

  it('matches crossing orders', () => {
    const bids = [makeOrder(OrderSide.Bid, 105, 10, 1)];
    const asks = [makeOrder(OrderSide.Ask, 100, 10, 2)];

    const matches = matcher.findMatches(bids, asks);
    expect(matches.length).toBe(1);
    expect(matches[0].fillAmount).toBe(10);
    expect(matches[0].fillPrice).toBe(105); // maker (bid) price
  });

  it('returns no matches when bid < ask', () => {
    const bids = [makeOrder(OrderSide.Bid, 95, 10, 1)];
    const asks = [makeOrder(OrderSide.Ask, 100, 10, 2)];

    const matches = matcher.findMatches(bids, asks);
    expect(matches.length).toBe(0);
  });

  it('partial fills use smaller amount', () => {
    const bids = [makeOrder(OrderSide.Bid, 105, 15, 1)];
    const asks = [makeOrder(OrderSide.Ask, 100, 10, 2)];

    const matches = matcher.findMatches(bids, asks);
    expect(matches.length).toBe(1);
    expect(matches[0].fillAmount).toBe(10);
  });

  it('matches multiple orders when liquidity allows', () => {
    const bids = [
      makeOrder(OrderSide.Bid, 110, 5, 1),
      makeOrder(OrderSide.Bid, 105, 10, 2),
    ];
    const asks = [
      makeOrder(OrderSide.Ask, 100, 8, 3),
      makeOrder(OrderSide.Ask, 103, 12, 4),
    ];

    const matches = matcher.findMatches(bids, asks);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('calculates spread correctly', () => {
    const bids = [makeOrder(OrderSide.Bid, 100, 10, 1)];
    const asks = [makeOrder(OrderSide.Ask, 105, 10, 2)];

    const spread = matcher.getSpread(bids, asks);
    // spread = best bid - best ask = 100 - 105 = -5 (normal market)
    expect(spread).toBe(-5);
  });

  it('returns null spread for empty books', () => {
    expect(matcher.getSpread([], [])).toBeNull();
  });

  it('calculates mid price', () => {
    const bids = [makeOrder(OrderSide.Bid, 100, 10, 1)];
    const asks = [makeOrder(OrderSide.Ask, 110, 10, 2)];

    const mid = matcher.getMidPrice(bids, asks);
    expect(mid).toBe(105);
  });

  it('calculates depth at price', () => {
    const orders = [
      makeOrder(OrderSide.Bid, 100, 10, 1),
      makeOrder(OrderSide.Bid, 100, 5, 2),
      makeOrder(OrderSide.Bid, 95, 20, 3),
    ];

    expect(matcher.getDepthAtPrice(orders, 100)).toBe(15);
    expect(matcher.getDepthAtPrice(orders, 95)).toBe(20);
    expect(matcher.getDepthAtPrice(orders, 110)).toBe(0);
  });
});

describe('Full Cranker Lifecycle', () => {
  it('order → tree → match → proof pipeline', () => {
    const store = new OrderStore(100);
    const matcher = new OrderMatcher();

    const maker1 = Keypair.generate().publicKey;
    const maker2 = Keypair.generate().publicKey;

    // 1. Submit orders
    const bid = store.addOrder(maker1, OrderSide.Bid, 105, 10);
    const ask = store.addOrder(maker2, OrderSide.Ask, 100, 8);
    store.addOrder(maker1, OrderSide.Bid, 98, 5);
    store.addOrder(maker2, OrderSide.Ask, 110, 3);

    // 2. Build merkle tree
    const tree = store.buildMerkleTree(0);
    expect(tree).not.toBeNull();
    expect(tree!.root.length).toBe(32);

    // 3. Generate proofs for matched orders
    const bidProof = store.getMerkleProof(0, bid.orderIndex);
    const askProof = store.getMerkleProof(0, ask.orderIndex);
    expect(bidProof).not.toBeNull();
    expect(askProof).not.toBeNull();
    expect(bidProof!.root.equals(askProof!.root)).toBe(true);

    // 4. Match orders
    const matches = matcher.findMatches(store.getBids(), store.getAsks());
    expect(matches.length).toBeGreaterThan(0);

    const match = matches[0];
    expect(match.fillAmount).toBe(8); // limited by ask amount
    expect(match.makerOrder.price).toBe(105);
    expect(match.takerOrder.price).toBe(100);

    // 5. Verify tree root is deterministic
    const tree2 = store.buildMerkleTree(0);
    expect(Buffer.from(tree2!.root).equals(Buffer.from(tree!.root))).toBe(true);
  });

  it('multi-epoch pipeline', () => {
    const store = new OrderStore(2); // 2 orders per epoch

    const maker1 = Keypair.generate().publicKey;
    const maker2 = Keypair.generate().publicKey;

    // Epoch 0: 2 orders
    store.addOrder(maker1, OrderSide.Bid, 100, 10);
    store.addOrder(maker2, OrderSide.Ask, 95, 5);

    // Epoch 1: triggered by 3rd order
    store.addOrder(maker1, OrderSide.Bid, 110, 20);
    expect(store.activeEpochIndex).toBe(1);

    // Build trees for both epochs
    const tree0 = store.buildMerkleTree(0);
    const tree1 = store.buildMerkleTree(1);
    expect(tree0).not.toBeNull();
    expect(tree1).not.toBeNull();

    // Roots should be different
    expect(Buffer.from(tree0!.root).equals(Buffer.from(tree1!.root))).toBe(false);

    // Proofs should work for epoch 0
    const proof = store.getMerkleProof(0, 0);
    expect(proof).not.toBeNull();
  });

  it('match-and-remove lifecycle', () => {
    const store = new OrderStore(100);
    const matcher = new OrderMatcher();

    const maker1 = Keypair.generate().publicKey;
    const maker2 = Keypair.generate().publicKey;

    store.addOrder(maker1, OrderSide.Bid, 100, 10);
    store.addOrder(maker2, OrderSide.Ask, 95, 10);
    store.addOrder(maker1, OrderSide.Bid, 90, 5);

    const matches = matcher.findMatches(store.getBids(), store.getAsks());
    expect(matches.length).toBe(1);

    // Remove fully filled orders
    const match = matches[0];
    store.removeOrder(match.makerOrder.orderId);
    store.removeOrder(match.takerOrder.orderId);

    expect(store.getBids().length).toBe(1);
    expect(store.getAsks().length).toBe(0);

    // No more matches
    const matches2 = matcher.findMatches(store.getBids(), store.getAsks());
    expect(matches2.length).toBe(0);
  });
});
