# @fabrknt/stratum-core

Chain-agnostic state primitives -- merkle trees, bitfields, order matching, ZK circuits, and data availability providers.

Not every DeFi protocol needs TradFi compliance -- but if yours does, you shouldn't have to rebuild from scratch. Fabrknt plugs into your existing protocol with composable SDKs and APIs. No permissioned forks, no separate deployments.

## Install

```bash
npm install @fabrknt/stratum-core
```

## Quick Start

```typescript
import { MerkleTree, Bitfield, OrderMatcher } from '@fabrknt/stratum-core';

// Build a merkle tree from leaves
const leaves = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
const tree = new MerkleTree(leaves);
const proof = tree.getProof(0);
const valid = tree.verify(proof, leaves[0], tree.root);

// Track claims with a bitfield (2048 bits per chunk)
const bits = new Bitfield(10000);
bits.set(42);
bits.check(42); // true

// Match orders by price-time priority
const matcher = new OrderMatcher();
```

## Features

- Merkle trees with pluggable hash functions (SHA-256, keccak256, Poseidon)
- Bitfield tracking -- 2,048 flags per 256-byte chunk, suitable for on-chain claim tracking
- Order matching engine with price-time priority
- ZK circuits -- merkle inclusion, batch merkle, and state transition proofs
- Witness builders for ZK proof generation (`buildMerkleWitness`, `buildBatchWitness`, `buildStateTransitionWitness`)
- Data availability providers -- Celestia, Avail, EigenDA, and in-memory
- Persistent archive store with serialization utilities
- Compatible with Solana (Anchor) and EVM (Solidity/Foundry) on-chain contracts

## API Summary

### Merkle

| Export | Description |
|--------|-------------|
| `MerkleTree` | Merkle tree with proof generation and verification |
| `hashLeaf` | Hash a single leaf with a given hash function |
| `hashNodes` | Hash two sibling nodes |
| `buildMerkleRoot` | Build a root from structured order leaves |
| `verifyMerkleProof` | Verify a structured proof against a root |
| `resolveHashFunction` | Resolve `'poseidon'`, `'sha256'`, or `'keccak256'` by name |

### Bitfield

| Export | Description |
|--------|-------------|
| `Bitfield` | Bit tracking with multi-chunk support |
| `splitIndex` | Decompose global index into chunk + local index |
| `chunksNeeded` | Calculate chunks required for a given capacity |

### Order Matching

| Export | Description |
|--------|-------------|
| `OrderMatcher` | Price-time priority matching engine |
| `OrderLeaf`, `OrderSide` | Order types and enums |

### ZK Circuits

| Export | Description |
|--------|-------------|
| `MerkleInclusionCircuit` | Single merkle inclusion proof circuit |
| `BatchMerkleCircuit` | Batch merkle proof circuit |
| `StateTransitionCircuit` | State transition proof circuit |
| `SnarkJSBackend` | snarkjs-based ZK backend |
| `buildMerkleWitness` | Generate witness for merkle inclusion |

### Data Availability

| Export | Description |
|--------|-------------|
| `createDAProvider` | Factory for DA providers from config |
| `CelestiaProvider`, `AvailProvider`, `EigenDAProvider` | Chain-specific DA providers |
| `PersistentArchiveStore` | Archive storage with DA integration |
| `loadDAConfigFromEnv` | Load DA configuration from environment variables |

## Documentation

Full documentation, on-chain contract examples, gas benchmarks, and QuickNode add-on details are available in the [main repository README](https://github.com/fabrknt/stratum#readme).

## License

MIT
