import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import type { Wallet } from '@coral-xyz/anchor';
import { MerkleTree } from '@stratum/core';
import { solanaHash } from '@stratum/solana';
import type { OrderStore } from './order-store';
import type { StratumOrderbook } from './stratum_orderbook';

/**
 * Monitors epoch root submissions and challenges invalid ones.
 * Each cranker runs a ChallengeMonitor to detect fraudulent root submissions
 * by independently reconstructing the Merkle tree from known orders.
 */
export class ChallengeMonitor {
  private program: Program<StratumOrderbook>;
  private orderStore: OrderStore;
  private wallet: Wallet;
  private orderBookAddress: PublicKey;
  private isRunning: boolean = false;
  private checkIntervalMs: number;

  constructor(
    program: Program<StratumOrderbook>,
    orderStore: OrderStore,
    wallet: Wallet,
    orderBookAddress: PublicKey,
    checkIntervalMs: number = 5000,
  ) {
    this.program = program;
    this.orderStore = orderStore;
    this.wallet = wallet;
    this.orderBookAddress = orderBookAddress;
    this.checkIntervalMs = checkIntervalMs;
  }

  /** Start monitoring for invalid root submissions */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log('Challenge monitor started');

    while (this.isRunning) {
      try {
        await this.checkRecentEpochs();
      } catch (err) {
        console.error('Challenge monitor error:', err);
      }
      await this.sleep(this.checkIntervalMs);
    }
  }

  /** Stop the monitor */
  stop(): void {
    this.isRunning = false;
    console.log('Challenge monitor stopped');
  }

  /**
   * Verify an epoch's submitted root against locally known orders.
   * Returns true if the root is valid, false if it should be challenged.
   */
  async verifyEpochRoot(
    epochIndex: number,
    submittedRoot: Buffer,
  ): Promise<boolean> {
    const epoch = this.orderStore.getEpoch(epochIndex);
    if (!epoch || epoch.orders.length === 0) {
      // Don't have order data — can't verify
      return true;
    }

    const tree = this.orderStore.buildMerkleTree(epochIndex);
    if (!tree) return true;

    const localRoot = Buffer.from(tree.root);
    return localRoot.equals(submittedRoot);
  }

  /**
   * Submit a challenge against an invalid epoch root.
   */
  async submitChallenge(
    epochIndex: number,
    correctRoot: Buffer,
    orderCount: number,
  ): Promise<string> {
    const epochIndexBuf = Buffer.alloc(4);
    epochIndexBuf.writeUInt32LE(epochIndex);

    const [epochPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('epoch'), this.orderBookAddress.toBuffer(), epochIndexBuf],
      this.program.programId,
    );

    const [registryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('cranker_registry'), this.orderBookAddress.toBuffer()],
      this.program.programId,
    );

    const [challengePda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('challenge'),
        epochPda.toBuffer(),
        this.wallet.publicKey.toBuffer(),
      ],
      this.program.programId,
    );

    const rootArray = Array.from(correctRoot) as number[];

    const tx = await this.program.methods
      .submitChallenge(rootArray, orderCount)
      .accounts({
        orderBook: this.orderBookAddress,
        epoch: epochPda,
        crankerRegistry: registryPda,
        challenge: challengePda,
        challenger: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    console.log(
      `Challenge submitted for epoch ${epochIndex}: tx=${tx}`,
    );
    return tx;
  }

  private async checkRecentEpochs(): Promise<void> {
    // Check the most recent finalized epochs that we have local data for
    const activeEpochIndex = this.orderStore.activeEpochIndex;

    for (let i = Math.max(0, activeEpochIndex - 5); i <= activeEpochIndex; i++) {
      const localEpoch = this.orderStore.getEpoch(i);
      if (!localEpoch || localEpoch.orders.length === 0) continue;

      try {
        const onChainEpoch = await this.fetchOnChainEpoch(i);
        if (!onChainEpoch || !onChainEpoch.rootSubmitted) continue;
        if (onChainEpoch.isFinalized) continue; // Already finalized, too late

        const submittedRoot = Buffer.from(onChainEpoch.merkleRoot);
        const valid = await this.verifyEpochRoot(i, submittedRoot);

        if (!valid) {
          console.warn(`Invalid root detected for epoch ${i}! Submitting challenge...`);
          const tree = this.orderStore.buildMerkleTree(i);
          if (tree) {
            await this.submitChallenge(
              i,
              Buffer.from(tree.root),
              localEpoch.orders.length,
            );
          }
        }
      } catch (err) {
        // Epoch might not exist on-chain yet
      }
    }
  }

  private async fetchOnChainEpoch(epochIndex: number): Promise<{
    merkleRoot: number[];
    orderCount: number;
    isFinalized: boolean;
    rootSubmitted: boolean;
  } | null> {
    const epochIndexBuf = Buffer.alloc(4);
    epochIndexBuf.writeUInt32LE(epochIndex);

    const [epochPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('epoch'), this.orderBookAddress.toBuffer(), epochIndexBuf],
      this.program.programId,
    );

    try {
      const account = await this.program.account.epoch.fetch(epochPda);
      return {
        merkleRoot: Array.from(account.merkleRoot),
        orderCount: account.orderCount,
        isFinalized: account.isFinalized,
        rootSubmitted: account.rootSubmitted,
      };
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
