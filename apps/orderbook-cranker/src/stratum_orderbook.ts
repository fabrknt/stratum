/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/stratum_orderbook.json`.
 */
export type StratumOrderbook = {
  "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "metadata": {
    "name": "stratumOrderbook",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "State-optimized on-chain order book using Stratum primitives"
  },
  "instructions": [
    {
      "name": "cancelOrder",
      "docs": [
        "Maker cancels their own order: verify proof + unset bit"
      ],
      "discriminator": [
        95,
        129,
        237,
        240,
        8,
        49,
        223,
        132
      ],
      "accounts": [
        {
          "name": "orderBook",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "order_book.authority",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.base_mint",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.quote_mint",
                "account": "orderBook"
              }
            ]
          }
        },
        {
          "name": "epoch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "account",
                "path": "epoch.epoch_index",
                "account": "epoch"
              }
            ]
          }
        },
        {
          "name": "orderChunk",
          "writable": true
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ]
          }
        },
        {
          "name": "makerRefundAccount",
          "writable": true
        },
        {
          "name": "maker",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "order",
          "type": {
            "defined": {
              "name": "orderLeaf"
            }
          }
        },
        {
          "name": "proof",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        },
        {
          "name": "index",
          "type": "u32"
        }
      ]
    },
    {
      "name": "cleanupExpiredOrders",
      "docs": [
        "Anyone can cleanup expired orders for a reward"
      ],
      "discriminator": [
        245,
        6,
        117,
        161,
        43,
        190,
        108,
        131
      ],
      "accounts": [
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "order_book.authority",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.base_mint",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.quote_mint",
                "account": "orderBook"
              }
            ]
          }
        },
        {
          "name": "epoch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "account",
                "path": "epoch.epoch_index",
                "account": "epoch"
              }
            ]
          }
        },
        {
          "name": "orderChunk",
          "writable": true
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ]
          }
        },
        {
          "name": "makerRefundAccount",
          "writable": true
        },
        {
          "name": "cleaner",
          "docs": [
            "Anyone can call cleanup"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "order",
          "type": {
            "defined": {
              "name": "orderLeaf"
            }
          }
        },
        {
          "name": "proof",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        },
        {
          "name": "index",
          "type": "u32"
        }
      ]
    },
    {
      "name": "cleanupSettlement",
      "docs": [
        "Reclaim settlement receipt rent after expiry"
      ],
      "discriminator": [
        178,
        135,
        195,
        150,
        211,
        85,
        96,
        204
      ],
      "accounts": [
        {
          "name": "settlementReceipt",
          "writable": true
        },
        {
          "name": "cleaner",
          "docs": [
            "Anyone can call cleanup"
          ],
          "writable": true,
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "createEpoch",
      "docs": [
        "Create the next epoch for order batching"
      ],
      "discriminator": [
        115,
        111,
        36,
        230,
        59,
        145,
        168,
        27
      ],
      "accounts": [
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "order_book.authority",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.base_mint",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.quote_mint",
                "account": "orderBook"
              }
            ]
          }
        },
        {
          "name": "epoch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.current_epoch",
                "account": "orderBook"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "createOrderBook",
      "docs": [
        "Create a new order book for a trading pair"
      ],
      "discriminator": [
        153,
        114,
        9,
        51,
        100,
        68,
        240,
        197
      ],
      "accounts": [
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              },
              {
                "kind": "account",
                "path": "baseMint"
              },
              {
                "kind": "account",
                "path": "quoteMint"
              }
            ]
          }
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ]
          }
        },
        {
          "name": "baseMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "feeVault"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "tickSize",
          "type": "u64"
        },
        {
          "name": "feeBps",
          "type": "u16"
        },
        {
          "name": "settlementTtlSeconds",
          "type": "i64"
        }
      ]
    },
    {
      "name": "createOrderChunk",
      "docs": [
        "Create an order chunk (bitfield) for tracking active orders in an epoch"
      ],
      "discriminator": [
        120,
        165,
        192,
        19,
        148,
        80,
        229,
        101
      ],
      "accounts": [
        {
          "name": "orderBook",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "order_book.authority",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.base_mint",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.quote_mint",
                "account": "orderBook"
              }
            ]
          }
        },
        {
          "name": "epoch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "account",
                "path": "epoch.epoch_index",
                "account": "epoch"
              }
            ]
          }
        },
        {
          "name": "orderChunk",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  99,
                  104,
                  117,
                  110,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "epoch"
              },
              {
                "kind": "arg",
                "path": "chunkIndex"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "chunkIndex",
          "type": "u32"
        }
      ]
    },
    {
      "name": "finalizeEpoch",
      "docs": [
        "Finalize an epoch — no more orders can be added"
      ],
      "discriminator": [
        159,
        93,
        117,
        217,
        63,
        44,
        249,
        76
      ],
      "accounts": [
        {
          "name": "orderBook",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "order_book.authority",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.base_mint",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.quote_mint",
                "account": "orderBook"
              }
            ]
          }
        },
        {
          "name": "epoch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "account",
                "path": "epoch.epoch_index",
                "account": "epoch"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "settleMatch",
      "docs": [
        "Core matching instruction: verify both proofs, check bitfields,",
        "validate price, transfer tokens, update bitfield, emit event"
      ],
      "discriminator": [
        71,
        124,
        117,
        96,
        191,
        217,
        116,
        24
      ],
      "accounts": [
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "order_book.authority",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.base_mint",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.quote_mint",
                "account": "orderBook"
              }
            ]
          }
        },
        {
          "name": "makerEpoch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "account",
                "path": "maker_epoch.epoch_index",
                "account": "epoch"
              }
            ]
          }
        },
        {
          "name": "takerEpoch",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "account",
                "path": "taker_epoch.epoch_index",
                "account": "epoch"
              }
            ]
          }
        },
        {
          "name": "makerChunk",
          "writable": true
        },
        {
          "name": "takerChunk",
          "writable": true
        },
        {
          "name": "settlementReceipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  101,
                  116,
                  116,
                  108,
                  101,
                  109,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "arg",
                "path": "maker_order.order_id"
              },
              {
                "kind": "arg",
                "path": "taker_order.order_id"
              }
            ]
          }
        },
        {
          "name": "baseVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ]
          }
        },
        {
          "name": "quoteVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  113,
                  117,
                  111,
                  116,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              }
            ]
          }
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "makerBaseAccount",
          "writable": true
        },
        {
          "name": "makerQuoteAccount",
          "writable": true
        },
        {
          "name": "takerBaseAccount",
          "writable": true
        },
        {
          "name": "takerQuoteAccount",
          "writable": true
        },
        {
          "name": "cranker",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "makerOrder",
          "type": {
            "defined": {
              "name": "orderLeaf"
            }
          }
        },
        {
          "name": "makerProof",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        },
        {
          "name": "makerIndex",
          "type": "u32"
        },
        {
          "name": "takerOrder",
          "type": {
            "defined": {
              "name": "orderLeaf"
            }
          }
        },
        {
          "name": "takerProof",
          "type": {
            "vec": {
              "array": [
                "u8",
                32
              ]
            }
          }
        },
        {
          "name": "takerIndex",
          "type": "u32"
        },
        {
          "name": "fillAmount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "submitEpochRoot",
      "docs": [
        "Cranker submits a computed merkle root for an epoch's orders"
      ],
      "discriminator": [
        183,
        167,
        208,
        127,
        73,
        228,
        199,
        103
      ],
      "accounts": [
        {
          "name": "orderBook",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  114,
                  100,
                  101,
                  114,
                  95,
                  98,
                  111,
                  111,
                  107
                ]
              },
              {
                "kind": "account",
                "path": "order_book.authority",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.base_mint",
                "account": "orderBook"
              },
              {
                "kind": "account",
                "path": "order_book.quote_mint",
                "account": "orderBook"
              }
            ]
          }
        },
        {
          "name": "epoch",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  112,
                  111,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "orderBook"
              },
              {
                "kind": "account",
                "path": "epoch.epoch_index",
                "account": "epoch"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "root",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "orderCount",
          "type": "u32"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "epoch",
      "discriminator": [
        93,
        83,
        120,
        89,
        151,
        138,
        152,
        108
      ]
    },
    {
      "name": "orderBook",
      "discriminator": [
        55,
        230,
        125,
        218,
        149,
        39,
        65,
        248
      ]
    },
    {
      "name": "orderChunk",
      "discriminator": [
        166,
        148,
        61,
        102,
        50,
        106,
        210,
        231
      ]
    },
    {
      "name": "settlementReceipt",
      "discriminator": [
        52,
        249,
        252,
        121,
        4,
        232,
        187,
        4
      ]
    }
  ],
  "events": [
    {
      "name": "epochCreated",
      "discriminator": [
        191,
        150,
        240,
        63,
        59,
        212,
        233,
        124
      ]
    },
    {
      "name": "epochFinalized",
      "discriminator": [
        109,
        54,
        231,
        81,
        101,
        249,
        145,
        107
      ]
    },
    {
      "name": "epochRootSubmitted",
      "discriminator": [
        128,
        111,
        67,
        202,
        226,
        252,
        218,
        15
      ]
    },
    {
      "name": "expiredOrderCleaned",
      "discriminator": [
        192,
        85,
        22,
        242,
        235,
        155,
        61,
        201
      ]
    },
    {
      "name": "orderBookCreated",
      "discriminator": [
        94,
        35,
        16,
        200,
        201,
        134,
        157,
        238
      ]
    },
    {
      "name": "orderCancelled",
      "discriminator": [
        108,
        56,
        128,
        68,
        168,
        113,
        168,
        239
      ]
    },
    {
      "name": "orderSettled",
      "discriminator": [
        32,
        21,
        123,
        33,
        68,
        59,
        136,
        131
      ]
    },
    {
      "name": "settlementCleaned",
      "discriminator": [
        22,
        109,
        194,
        12,
        38,
        35,
        148,
        32
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6001,
      "name": "orderBookInactive",
      "msg": "Order book is not active"
    },
    {
      "code": 6002,
      "name": "epochAlreadyFinalized",
      "msg": "Epoch is already finalized"
    },
    {
      "code": 6003,
      "name": "epochNotFinalized",
      "msg": "Epoch is not finalized"
    },
    {
      "code": 6004,
      "name": "invalidMakerProof",
      "msg": "Invalid merkle proof for maker order"
    },
    {
      "code": 6005,
      "name": "invalidTakerProof",
      "msg": "Invalid merkle proof for taker order"
    },
    {
      "code": 6006,
      "name": "orderNotActive",
      "msg": "Order is not active (already filled or cancelled)"
    },
    {
      "code": 6007,
      "name": "priceConstraintViolated",
      "msg": "Price constraint violated: bid price must be >= ask price"
    },
    {
      "code": 6008,
      "name": "fillAmountExceeded",
      "msg": "Fill amount exceeds order remaining amount"
    },
    {
      "code": 6009,
      "name": "zeroFillAmount",
      "msg": "Fill amount must be greater than zero"
    },
    {
      "code": 6010,
      "name": "orderNotExpired",
      "msg": "Order has not expired yet"
    },
    {
      "code": 6011,
      "name": "settlementNotExpired",
      "msg": "Settlement receipt has not expired yet"
    },
    {
      "code": 6012,
      "name": "epochRootAlreadySubmitted",
      "msg": "Epoch root already submitted"
    },
    {
      "code": 6013,
      "name": "orderCountMismatch",
      "msg": "Order count mismatch"
    },
    {
      "code": 6014,
      "name": "invalidOrderSide",
      "msg": "Invalid order side for this operation"
    },
    {
      "code": 6015,
      "name": "notOrderOwner",
      "msg": "Maker is not the order owner"
    },
    {
      "code": 6016,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6017,
      "name": "invalidTickSize",
      "msg": "Invalid tick size"
    },
    {
      "code": 6018,
      "name": "invalidEpochIndex",
      "msg": "Invalid epoch index"
    }
  ],
  "types": [
    {
      "name": "epoch",
      "docs": [
        "An epoch containing a batch of orders committed via merkle root"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderBook",
            "docs": [
              "Parent order book"
            ],
            "type": "pubkey"
          },
          {
            "name": "epochIndex",
            "docs": [
              "Epoch index (sequential)"
            ],
            "type": "u32"
          },
          {
            "name": "merkleRoot",
            "docs": [
              "Merkle root committing to all orders in this epoch"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "orderCount",
            "docs": [
              "Number of orders in this epoch"
            ],
            "type": "u32"
          },
          {
            "name": "isFinalized",
            "docs": [
              "Whether this epoch is finalized (no more orders)"
            ],
            "type": "bool"
          },
          {
            "name": "rootSubmitted",
            "docs": [
              "Whether the merkle root has been submitted"
            ],
            "type": "bool"
          },
          {
            "name": "createdAt",
            "docs": [
              "Creation timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "finalizedAt",
            "docs": [
              "Finalization timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "epochCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderBook",
            "type": "pubkey"
          },
          {
            "name": "epoch",
            "type": "pubkey"
          },
          {
            "name": "epochIndex",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "epochFinalized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "type": "pubkey"
          },
          {
            "name": "epochIndex",
            "type": "u32"
          },
          {
            "name": "orderCount",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "epochRootSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "type": "pubkey"
          },
          {
            "name": "merkleRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "orderCount",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "expiredOrderCleaned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderBook",
            "type": "pubkey"
          },
          {
            "name": "orderId",
            "type": "u64"
          },
          {
            "name": "epochIndex",
            "type": "u32"
          },
          {
            "name": "orderIndex",
            "type": "u32"
          },
          {
            "name": "cleaner",
            "type": "pubkey"
          },
          {
            "name": "reward",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "expiryConfig",
      "docs": [
        "Standard expiry configuration for accounts that should be cleaned up",
        "",
        "Use cases:",
        "- Temporary records that should be removed after some time",
        "- Lease contracts that expire",
        "- Time-limited access tokens",
        "- Cleanup crank rewards"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "createdAt",
            "docs": [
              "When the record was created"
            ],
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "docs": [
              "When the record expires (0 = never expires)"
            ],
            "type": "i64"
          },
          {
            "name": "gracePeriod",
            "docs": [
              "Grace period after expiry before cleanup is allowed (seconds)"
            ],
            "type": "i64"
          },
          {
            "name": "cleanupReward",
            "docs": [
              "Reward for cleanup crank operator (in lamports)"
            ],
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "historySummary",
      "docs": [
        "Compact history summary stored on-chain",
        "",
        "Instead of storing full history, keep aggregates on-chain",
        "and emit detailed events for off-chain indexing",
        "",
        "Use cases:",
        "- Transaction counts and volumes",
        "- Settlement summaries",
        "- Activity tracking without state bloat"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "totalCount",
            "docs": [
              "Total number of events recorded"
            ],
            "type": "u64"
          },
          {
            "name": "totalValue",
            "docs": [
              "Sum of values (e.g., total volume)"
            ],
            "type": "u128"
          },
          {
            "name": "minValue",
            "docs": [
              "Minimum value seen"
            ],
            "type": "u64"
          },
          {
            "name": "maxValue",
            "docs": [
              "Maximum value seen"
            ],
            "type": "u64"
          },
          {
            "name": "lastSlot",
            "docs": [
              "Last event slot"
            ],
            "type": "u64"
          },
          {
            "name": "lastTimestamp",
            "docs": [
              "Last event timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "lastEventHash",
            "docs": [
              "Checksum/hash of last event for verification"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "orderBook",
      "docs": [
        "Order book for a trading pair"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "Authority that manages this order book"
            ],
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "docs": [
              "Base token mint (the asset being traded)"
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "docs": [
              "Quote token mint (the pricing currency)"
            ],
            "type": "pubkey"
          },
          {
            "name": "baseVault",
            "docs": [
              "Base token vault (holds maker deposits for bids/asks)"
            ],
            "type": "pubkey"
          },
          {
            "name": "quoteVault",
            "docs": [
              "Quote token vault"
            ],
            "type": "pubkey"
          },
          {
            "name": "currentEpoch",
            "docs": [
              "Current epoch index (incremented when a new epoch is created)"
            ],
            "type": "u32"
          },
          {
            "name": "totalOrders",
            "docs": [
              "Total orders ever submitted across all epochs"
            ],
            "type": "u64"
          },
          {
            "name": "totalSettlements",
            "docs": [
              "Total settlements completed"
            ],
            "type": "u64"
          },
          {
            "name": "tickSize",
            "docs": [
              "Minimum price increment (price precision)"
            ],
            "type": "u64"
          },
          {
            "name": "feeBps",
            "docs": [
              "Fee in basis points charged on fills"
            ],
            "type": "u16"
          },
          {
            "name": "feeVault",
            "docs": [
              "Fee destination account"
            ],
            "type": "pubkey"
          },
          {
            "name": "history",
            "docs": [
              "Aggregate trade history (from Stratum)"
            ],
            "type": {
              "defined": {
                "name": "historySummary"
              }
            }
          },
          {
            "name": "settlementExpiry",
            "docs": [
              "Expiry config for settlement receipts"
            ],
            "type": {
              "defined": {
                "name": "expiryConfig"
              }
            }
          },
          {
            "name": "isActive",
            "docs": [
              "Whether the order book is active"
            ],
            "type": "bool"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          },
          {
            "name": "baseVaultBump",
            "docs": [
              "Base vault bump"
            ],
            "type": "u8"
          },
          {
            "name": "quoteVaultBump",
            "docs": [
              "Quote vault bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderBookCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderBook",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "baseMint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "tickSize",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "orderCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderBook",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "orderId",
            "type": "u64"
          },
          {
            "name": "epochIndex",
            "type": "u32"
          },
          {
            "name": "orderIndex",
            "type": "u32"
          }
        ]
      }
    },
    {
      "name": "orderChunk",
      "docs": [
        "Bitfield chunk tracking active/filled status of orders within an epoch.",
        "Wraps Stratum's BitfieldChunk concept but owns its own PDA.",
        "bit set = active order, bit unset = filled/cancelled"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "epoch",
            "docs": [
              "Parent epoch"
            ],
            "type": "pubkey"
          },
          {
            "name": "chunkIndex",
            "docs": [
              "Chunk index within this epoch"
            ],
            "type": "u32"
          },
          {
            "name": "bits",
            "docs": [
              "The actual bits — 256 bytes = 2048 order slots"
            ],
            "type": {
              "array": [
                "u8",
                256
              ]
            }
          },
          {
            "name": "activeCount",
            "docs": [
              "Count of active (set) bits"
            ],
            "type": "u16"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "orderLeaf",
      "docs": [
        "Order leaf data — not stored on-chain.",
        "Serialized and hashed to create merkle tree leaves.",
        "Must match the TypeScript SDK's serialization exactly."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "orderId",
            "type": "u64"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "orderSide"
              }
            }
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "epochIndex",
            "type": "u32"
          },
          {
            "name": "orderIndex",
            "type": "u32"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderBook",
            "type": "pubkey"
          },
          {
            "name": "maker",
            "type": "pubkey"
          },
          {
            "name": "taker",
            "type": "pubkey"
          },
          {
            "name": "fillAmount",
            "type": "u64"
          },
          {
            "name": "fillPrice",
            "type": "u64"
          },
          {
            "name": "makerOrderId",
            "type": "u64"
          },
          {
            "name": "takerOrderId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "orderSide",
      "docs": [
        "Order side enum"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "bid"
          },
          {
            "name": "ask"
          }
        ]
      }
    },
    {
      "name": "settlementCleaned",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "settlement",
            "type": "pubkey"
          },
          {
            "name": "cleaner",
            "type": "pubkey"
          },
          {
            "name": "reward",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "settlementReceipt",
      "docs": [
        "Settlement receipt for a completed fill"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "orderBook",
            "docs": [
              "Parent order book"
            ],
            "type": "pubkey"
          },
          {
            "name": "maker",
            "docs": [
              "Maker's public key"
            ],
            "type": "pubkey"
          },
          {
            "name": "taker",
            "docs": [
              "Taker's public key"
            ],
            "type": "pubkey"
          },
          {
            "name": "makerOrderId",
            "docs": [
              "Maker order ID"
            ],
            "type": "u64"
          },
          {
            "name": "takerOrderId",
            "docs": [
              "Taker order ID"
            ],
            "type": "u64"
          },
          {
            "name": "fillAmount",
            "docs": [
              "Fill amount (in base tokens)"
            ],
            "type": "u64"
          },
          {
            "name": "fillPrice",
            "docs": [
              "Fill price"
            ],
            "type": "u64"
          },
          {
            "name": "feePaid",
            "docs": [
              "Fee paid (in quote tokens)"
            ],
            "type": "u64"
          },
          {
            "name": "expiry",
            "docs": [
              "Expiry config for auto-cleanup"
            ],
            "type": {
              "defined": {
                "name": "expiryConfig"
              }
            }
          },
          {
            "name": "settledAt",
            "docs": [
              "Settlement timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump"
            ],
            "type": "u8"
          }
        ]
      }
    }
  ]
};
