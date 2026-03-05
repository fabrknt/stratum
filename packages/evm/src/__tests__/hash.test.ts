import { describe, it, expect } from 'vitest';
import { keccak256, concat, getBytes } from 'ethers';
import { evmHashLeaf, evmHashNode, evmHash } from '../hash';

describe('evmHashLeaf', () => {
  it('matches Solidity: keccak256(0x00 || keccak256(data))', () => {
    const data = new TextEncoder().encode('hello');
    const result = evmHashLeaf(data);

    // Manually compute what Solidity does:
    // keccak256(abi.encodePacked(uint8(0x00), keccak256("hello")))
    const innerHash = keccak256(data);
    const expected = keccak256(concat([new Uint8Array([0x00]), innerHash]));

    expect(result).toBe(expected);
  });

  it('accepts string input', () => {
    const fromBytes = evmHashLeaf(new TextEncoder().encode('test'));
    const fromString = evmHashLeaf('test');
    expect(fromString).toBe(fromBytes);
  });

  it('produces different hashes for different data', () => {
    const hash1 = evmHashLeaf('data1');
    const hash2 = evmHashLeaf('data2');
    expect(hash1).not.toBe(hash2);
  });

  it('is deterministic', () => {
    const hash1 = evmHashLeaf('same');
    const hash2 = evmHashLeaf('same');
    expect(hash1).toBe(hash2);
  });

  it('differs from raw keccak256 (domain separated)', () => {
    const data = new TextEncoder().encode('hello');
    const rawHash = keccak256(data);
    const leafHash = evmHashLeaf(data);
    expect(leafHash).not.toBe(rawHash);
  });
});

describe('evmHashNode', () => {
  it('is commutative (sorted pairs)', () => {
    const a = evmHashLeaf('left');
    const b = evmHashLeaf('right');

    const ab = evmHashNode(a, b);
    const ba = evmHashNode(b, a);

    expect(ab).toBe(ba);
  });

  it('matches Solidity: keccak256(0x01 || min(a,b) || max(a,b))', () => {
    const a = evmHashLeaf('first');
    const b = evmHashLeaf('second');

    const result = evmHashNode(a, b);

    // Manually compute
    const [first, second] = a <= b ? [a, b] : [b, a];
    const expected = keccak256(concat([new Uint8Array([0x01]), first, second]));

    expect(result).toBe(expected);
  });

  it('produces different results for different inputs', () => {
    const a = evmHashLeaf('a');
    const b = evmHashLeaf('b');
    const c = evmHashLeaf('c');

    expect(evmHashNode(a, b)).not.toBe(evmHashNode(a, c));
  });

  it('domain separates from leaf hash', () => {
    // node(a, b) should differ from leaf(a || b) even if the data is similar
    const a = evmHashLeaf('x');
    const b = evmHashLeaf('y');

    const nodeHash = evmHashNode(a, b);
    // The node hash uses 0x01 prefix, leaf uses 0x00 — they're different
    const leafHash = evmHashLeaf(new Uint8Array(64)); // arbitrary data
    expect(nodeHash).not.toBe(leafHash);
  });
});

describe('evmHash (raw HashFunction)', () => {
  it('returns Uint8Array', () => {
    const data = new TextEncoder().encode('hello');
    const result = evmHash(data);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(32);
  });

  it('matches ethers keccak256', () => {
    const data = new TextEncoder().encode('hello');
    const result = evmHash(data);
    const expected = getBytes(keccak256(data));
    expect(result).toEqual(expected);
  });
});
