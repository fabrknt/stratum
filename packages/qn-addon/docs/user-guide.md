# Stratum Data Optimization -- QuickNode Marketplace Add-on

## Overview

Stratum provides high-performance data optimization utilities for blockchain applications. It exposes two core modules through a REST API:

- **Merkle Tree Operations** -- Build trees from leaf data, generate inclusion proofs, verify proofs, and hash individual leaves. Useful for constructing on-chain proofs, allowlists, and tamper-evident data structures.
- **Bitfield Management** -- Create compact bitfields, set and check individual bits, and retrieve statistics. Useful for tracking large sets of boolean states (claim status, feature flags, vote records) with minimal storage overhead.

Stratum is chain-agnostic and currently listed for **Solana** and **Ethereum** on the QuickNode Marketplace.

---

## Getting Started

### Installation

1. Navigate to the [QuickNode Marketplace](https://marketplace.quicknode.com/).
2. Search for **Fabrknt Data Optimization**.
3. Click **Add** and select a plan.
4. Attach the add-on to an existing endpoint or create a new one.

### Plans

| Plan    | Price | Rate Limit         | Features |
|---------|-------|--------------------|----------|
| Starter | Free  | 100 requests/min   | All Merkle tree and bitfield endpoints |
| Pro     | TBD   | Higher rate limits  | All Starter features, plus on-chain Merkle root publishing and bitfield anchoring (coming soon) |

### Base URL

All API requests go through your QuickNode add-on proxy. The base URL follows this pattern:

```
https://<your-quicknode-endpoint>.quiknode.pro/<token>
```

QuickNode injects the required authentication header automatically when you call the add-on through the proxy.

---

## Authentication

Every API request to a `/v1/*` endpoint must include the `x-quicknode-id` header. QuickNode sets this header automatically when requests are routed through the add-on proxy. If you are testing directly against the add-on, you must supply it yourself.

```
x-quicknode-id: <your-quicknode-id>
```

Requests without this header receive a `401` response:

```json
{ "error": "Missing x-quicknode-id header" }
```

Requests with an unrecognized or inactive instance ID receive a `404` response:

```json
{ "error": "Instance not found or inactive" }
```

---

## API Reference

All endpoints accept and return JSON. Request bodies must use `Content-Type: application/json`. The maximum request body size is 10 MB.

### Merkle Tree Endpoints

#### POST /v1/merkle/build

Build a Merkle tree from an array of hex-encoded leaves and return the root hash.

**Request Body**

| Field    | Type       | Required | Description |
|----------|------------|----------|-------------|
| `leaves` | `string[]` | Yes      | Non-empty array of hex strings (with or without `0x` prefix) |

**Example**

```bash
curl -X POST https://<endpoint>/v1/merkle/build \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "leaves": [
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    ]
  }'
```

**Response**

```json
{
  "root": "0x9a3f...c7e1",
  "rootBase64": "mj8...x+E=",
  "leafCount": 3,
  "depth": 2
}
```

| Field        | Type     | Description |
|--------------|----------|-------------|
| `root`       | `string` | Hex-encoded Merkle root (with `0x` prefix) |
| `rootBase64` | `string` | Base64-encoded Merkle root |
| `leafCount`  | `number` | Number of leaves in the tree |
| `depth`      | `number` | Depth of the tree |

---

#### POST /v1/merkle/proof

Generate an inclusion proof for a specific leaf by index.

**Request Body**

| Field    | Type       | Required | Description |
|----------|------------|----------|-------------|
| `leaves` | `string[]` | Yes      | Non-empty array of hex strings (same set used to build the tree) |
| `index`  | `number`   | Yes      | Zero-based index of the leaf to prove |

**Example**

```bash
curl -X POST https://<endpoint>/v1/merkle/proof \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "leaves": [
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    ],
    "index": 0
  }'
```

**Response**

```json
{
  "proof": [
    "EjRWeJCrze8SNFZ4kKvN7xI0VniQq83vEjRWeJCr ze8=",
    "3q2+796tvvfer76v3q2+796tvvfer76v3q2+796tvvferb4="
  ]
}
```

| Field   | Type       | Description |
|---------|------------|-------------|
| `proof` | `string[]` | Array of base64-encoded sibling hashes forming the proof path |

---

#### POST /v1/merkle/verify

Verify that a leaf is included in a Merkle tree given a proof and root.

**Request Body**

| Field   | Type       | Required | Description |
|---------|------------|----------|-------------|
| `proof` | `string[]` | Yes      | Array of base64-encoded proof nodes (from `/v1/merkle/proof`) |
| `root`  | `string`   | Yes      | Base64-encoded Merkle root |
| `leaf`  | `string`   | Yes      | Base64-encoded leaf hash |
| `index` | `number`   | Yes      | Zero-based index of the leaf (non-negative) |

**Example**

```bash
curl -X POST https://<endpoint>/v1/merkle/verify \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "proof": ["EjRWeJCrze8SNFZ4kKvN7w==", "3q2+796tvvferb4="],
    "root": "mj8Ax+E=",
    "leaf": "q83vEjRWeJCrze8SNFZ4kA==",
    "index": 0
  }'
```

**Response**

```json
{
  "valid": true
}
```

| Field   | Type      | Description |
|---------|-----------|-------------|
| `valid` | `boolean` | `true` if the proof is valid for the given root and leaf |

---

#### POST /v1/merkle/hash

Hash arbitrary data using the same hashing function used internally by the Merkle tree. Useful for preparing leaf data before building a tree.

**Request Body**

| Field  | Type     | Required | Description |
|--------|----------|----------|-------------|
| `data` | `string` | Yes      | Base64-encoded data to hash |

**Example**

```bash
curl -X POST https://<endpoint>/v1/merkle/hash \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "data": "SGVsbG8gV29ybGQ="
  }'
```

**Response**

```json
{
  "hash": "0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  "hashBase64": "f4OxZX/x/FO5LcGBSKHWXfwtSx+j1ncyh t3dIAEm2QaQ=="
}
```

| Field        | Type     | Description |
|--------------|----------|-------------|
| `hash`       | `string` | Hex-encoded hash (with `0x` prefix) |
| `hashBase64` | `string` | Base64-encoded hash |

---

### Bitfield Endpoints

#### POST /v1/bitfield/create

Create a new, empty bitfield with the specified capacity.

**Request Body**

| Field      | Type     | Required | Description |
|------------|----------|----------|-------------|
| `capacity` | `number` | Yes      | Positive integer specifying the number of bits |

**Example**

```bash
curl -X POST https://<endpoint>/v1/bitfield/create \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "capacity": 256
  }'
```

**Response**

```json
{
  "bytes": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  "capacity": 256,
  "setCount": 0
}
```

| Field      | Type     | Description |
|------------|----------|-------------|
| `bytes`    | `string` | Base64-encoded bitfield data |
| `capacity` | `number` | Total number of bits |
| `setCount` | `number` | Number of bits currently set (always 0 for a new bitfield) |

---

#### POST /v1/bitfield/set

Set a bit at a specific index in a bitfield. Returns the updated bitfield and whether the bit was newly set.

**Request Body**

| Field   | Type     | Required | Description |
|---------|----------|----------|-------------|
| `bytes` | `string` | Yes      | Base64-encoded bitfield data |
| `index` | `number` | Yes      | Non-negative integer index of the bit to set |

**Example**

```bash
curl -X POST https://<endpoint>/v1/bitfield/set \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "bytes": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "index": 42
  }'
```

**Response**

```json
{
  "bytes": "AAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAA=",
  "wasNewlySet": true
}
```

| Field         | Type      | Description |
|---------------|-----------|-------------|
| `bytes`       | `string`  | Updated base64-encoded bitfield |
| `wasNewlySet` | `boolean` | `true` if the bit was previously unset; `false` if it was already set |

---

#### POST /v1/bitfield/check

Check whether a specific bit is set in a bitfield.

**Request Body**

| Field   | Type     | Required | Description |
|---------|----------|----------|-------------|
| `bytes` | `string` | Yes      | Base64-encoded bitfield data |
| `index` | `number` | Yes      | Non-negative integer index of the bit to check |

**Example**

```bash
curl -X POST https://<endpoint>/v1/bitfield/check \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "bytes": "AAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAA=",
    "index": 42
  }'
```

**Response**

```json
{
  "isSet": true
}
```

| Field   | Type      | Description |
|---------|-----------|-------------|
| `isSet` | `boolean` | `true` if the bit at the given index is set |

---

#### POST /v1/bitfield/stats

Retrieve statistics about a bitfield, including fill rate and capacity.

**Request Body**

| Field   | Type     | Required | Description |
|---------|----------|----------|-------------|
| `bytes` | `string` | Yes      | Base64-encoded bitfield data |

**Example**

```bash
curl -X POST https://<endpoint>/v1/bitfield/stats \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "bytes": "AAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAA="
  }'
```

**Response**

```json
{
  "setCount": 1,
  "capacity": 256,
  "fillRateBps": 39,
  "isFull": false,
  "isEmpty": false
}
```

| Field         | Type      | Description |
|---------------|-----------|-------------|
| `setCount`    | `number`  | Number of bits currently set |
| `capacity`    | `number`  | Total number of bits in the bitfield |
| `fillRateBps` | `number`  | Fill rate in basis points (1/10000). A value of 5000 means 50% full |
| `isFull`      | `boolean` | `true` if every bit is set |
| `isEmpty`     | `boolean` | `true` if no bits are set |

---

## Error Handling

All error responses follow a consistent JSON format:

```json
{
  "error": "Description of the error",
  "requestId": "optional-request-id"
}
```

### Common Error Codes

| Status Code | Meaning                | Typical Cause |
|-------------|------------------------|---------------|
| `400`       | Bad Request            | Missing or invalid fields in the request body. The `error` message describes what is wrong (e.g., `"leaves must be a non-empty array of hex strings"`, `"capacity must be a positive integer"`). |
| `401`       | Unauthorized           | Missing `x-quicknode-id` header. |
| `404`       | Not Found              | The `x-quicknode-id` does not match an active instance. |
| `429`       | Too Many Requests      | Rate limit exceeded. The Starter plan allows 100 requests per minute. Retry after the window resets. Standard `RateLimit-*` headers are included in the response. |
| `500`       | Internal Server Error  | An unexpected error on the server side. The response body contains a generic message; details are logged server-side. |

### Rate Limit Headers

Responses include standard rate limit headers:

- `RateLimit-Limit` -- Maximum requests allowed in the current window.
- `RateLimit-Remaining` -- Requests remaining in the current window.
- `RateLimit-Reset` -- Seconds until the rate limit window resets.

---

## Use Cases

### On-Chain Proofs (Allowlists and Airdrops)

Build a Merkle tree from a list of eligible addresses, publish the root on-chain, and let users submit their own inclusion proofs for verification.

```bash
# 1. Hash each address to create leaves
curl -X POST https://<endpoint>/v1/merkle/hash \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{"data": "base64-encoded-address-1"}'

# 2. Build the tree from all leaf hashes
curl -X POST https://<endpoint>/v1/merkle/build \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{"leaves": ["0xleaf1...", "0xleaf2...", "0xleaf3..."]}'

# 3. Store the returned root on-chain

# 4. When a user needs to claim, generate their proof
curl -X POST https://<endpoint>/v1/merkle/proof \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{"leaves": ["0xleaf1...", "0xleaf2...", "0xleaf3..."], "index": 1}'

# 5. The smart contract verifies the proof against the stored root
```

### State Tracking (Claim Status and Feature Flags)

Use a bitfield to track which items in a set have been claimed, activated, or processed. The bitfield is compact enough to store or pass on-chain.

```bash
# 1. Create a bitfield for 1000 claimable items
curl -X POST https://<endpoint>/v1/bitfield/create \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{"capacity": 1000}'

# 2. Mark item 42 as claimed
curl -X POST https://<endpoint>/v1/bitfield/set \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{"bytes": "<base64-from-step-1>", "index": 42}'

# 3. Check whether item 42 has been claimed
curl -X POST https://<endpoint>/v1/bitfield/check \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{"bytes": "<base64-from-step-2>", "index": 42}'

# 4. Monitor overall claim progress
curl -X POST https://<endpoint>/v1/bitfield/stats \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{"bytes": "<base64-from-step-2>"}'
```

### Audit Trails

Combine Merkle trees with periodic snapshots to create a verifiable audit trail. At each checkpoint, build a Merkle tree from the set of transaction hashes or event logs, then store the root. Any individual record can later be verified against its checkpoint root without reproducing the entire dataset.

```bash
# Build a tree from a batch of transaction hashes
curl -X POST https://<endpoint>/v1/merkle/build \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "leaves": [
      "0xtxhash1...",
      "0xtxhash2...",
      "0xtxhash3..."
    ]
  }'

# Later, verify a specific transaction was in the batch
curl -X POST https://<endpoint>/v1/merkle/verify \
  -H "Content-Type: application/json" \
  -H "x-quicknode-id: YOUR_QN_ID" \
  -d '{
    "proof": ["<proof-node-1>", "<proof-node-2>"],
    "root": "<stored-root-base64>",
    "leaf": "<tx-leaf-base64>",
    "index": 1
  }'
```

---

## Support

For issues with the add-on, contact **Fabrknt** through the QuickNode Marketplace support channel or visit [https://stratum.dev](https://stratum.dev).
