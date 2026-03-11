import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { StratumOrderbook } from "../target/types/stratum_orderbook";
import { expect } from "chai";

describe("stratum-orderbook", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .stratumOrderbook as Program<StratumOrderbook>;
  const authority = provider.wallet;

  // Dummy mints/vaults for order book creation
  const baseMint = Keypair.generate();
  const quoteMint = Keypair.generate();
  const feeVault = Keypair.generate();

  let orderBookPda: PublicKey;
  let orderBookBump: number;
  let baseVaultPda: PublicKey;
  let quoteVaultPda: PublicKey;

  // Cranker keypairs
  const crankerA = Keypair.generate();
  const crankerB = Keypair.generate();
  const challenger = Keypair.generate();

  before(async () => {
    // Derive PDAs
    [orderBookPda, orderBookBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("order_book"),
        authority.publicKey.toBuffer(),
        baseMint.publicKey.toBuffer(),
        quoteMint.publicKey.toBuffer(),
      ],
      program.programId
    );

    [baseVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("base_vault"), orderBookPda.toBuffer()],
      program.programId
    );

    [quoteVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("quote_vault"), orderBookPda.toBuffer()],
      program.programId
    );

    // Airdrop to test crankers and challenger
    for (const kp of [crankerA, crankerB, challenger]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        10 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  // =========================================================================
  // Order Book + Epoch lifecycle
  // =========================================================================

  describe("Order Book Creation", () => {
    it("creates an order book", async () => {
      const tx = await program.methods
        .createOrderBook(new anchor.BN(100), 30, new anchor.BN(86400))
        .accounts({
          orderBook: orderBookPda,
          baseVault: baseVaultPda,
          quoteVault: quoteVaultPda,
          baseMint: baseMint.publicKey,
          quoteMint: quoteMint.publicKey,
          feeVault: feeVault.publicKey,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const ob = await program.account.orderBook.fetch(orderBookPda);
      expect(ob.authority.toString()).to.equal(
        authority.publicKey.toString()
      );
      expect(ob.tickSize.toNumber()).to.equal(100);
      expect(ob.feeBps).to.equal(30);
      expect(ob.isActive).to.equal(true);
      expect(ob.currentEpoch).to.equal(0);
    });
  });

  describe("Epoch Lifecycle", () => {
    let epochPda: PublicKey;

    it("creates an epoch", async () => {
      const epochIndex = 0;
      const epochIndexBuf = Buffer.alloc(4);
      epochIndexBuf.writeUInt32LE(epochIndex);

      [epochPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("epoch"), orderBookPda.toBuffer(), epochIndexBuf],
        program.programId
      );

      await program.methods
        .createEpoch()
        .accounts({
          orderBook: orderBookPda,
          epoch: epochPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const epoch = await program.account.epoch.fetch(epochPda);
      expect(epoch.orderBook.toString()).to.equal(orderBookPda.toString());
      expect(epoch.epochIndex).to.equal(0);
      expect(epoch.isFinalized).to.equal(false);
      expect(epoch.rootSubmitted).to.equal(false);
      // New fields should be zero-initialized
      expect(epoch.submittedBy.toString()).to.equal(
        PublicKey.default.toString()
      );
      expect(epoch.challengeDeadline.toNumber()).to.equal(0);
    });

    it("submits an epoch root", async () => {
      const root = Buffer.alloc(32).fill(0xab);

      await program.methods
        .submitEpochRoot(Array.from(root) as number[], 10)
        .accounts({
          orderBook: orderBookPda,
          epoch: epochPda,
          authority: authority.publicKey,
        } as any)
        .rpc();

      const epoch = await program.account.epoch.fetch(epochPda);
      expect(epoch.rootSubmitted).to.equal(true);
      expect(epoch.orderCount).to.equal(10);
      expect(Buffer.from(epoch.merkleRoot).toString("hex")).to.equal(
        root.toString("hex")
      );
    });

    it("finalizes an epoch", async () => {
      await program.methods
        .finalizeEpoch()
        .accounts({
          orderBook: orderBookPda,
          epoch: epochPda,
          authority: authority.publicKey,
        } as any)
        .rpc();

      const epoch = await program.account.epoch.fetch(epochPda);
      expect(epoch.isFinalized).to.equal(true);
      expect(epoch.finalizedAt.toNumber()).to.be.greaterThan(0);
    });

    it("rejects double root submission", async () => {
      // Create epoch 1
      const epochIndex = 1;
      const epochIndexBuf = Buffer.alloc(4);
      epochIndexBuf.writeUInt32LE(epochIndex);

      const [epoch1Pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("epoch"), orderBookPda.toBuffer(), epochIndexBuf],
        program.programId
      );

      await program.methods
        .createEpoch()
        .accounts({
          orderBook: orderBookPda,
          epoch: epoch1Pda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const root = Buffer.alloc(32).fill(0xcc);
      await program.methods
        .submitEpochRoot(Array.from(root) as number[], 5)
        .accounts({
          orderBook: orderBookPda,
          epoch: epoch1Pda,
          authority: authority.publicKey,
        } as any)
        .rpc();

      // Try submitting again
      try {
        await program.methods
          .submitEpochRoot(Array.from(root) as number[], 5)
          .accounts({
            orderBook: orderBookPda,
            epoch: epoch1Pda,
            authority: authority.publicKey,
          } as any)
          .rpc();
        expect.fail("Expected EpochRootAlreadySubmitted error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code || e.message).to.include(
          "EpochRootAlreadySubmitted"
        );
      }
    });
  });

  // =========================================================================
  // Cranker Registry + Staking
  // =========================================================================

  describe("Cranker Registry", () => {
    let registryPda: PublicKey;
    let stakeAPda: PublicKey;
    let stakeBPda: PublicKey;

    before(() => {
      [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cranker_registry"), orderBookPda.toBuffer()],
        program.programId
      );

      [stakeAPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("cranker_stake"),
          registryPda.toBuffer(),
          crankerA.publicKey.toBuffer(),
        ],
        program.programId
      );

      [stakeBPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("cranker_stake"),
          registryPda.toBuffer(),
          crankerB.publicKey.toBuffer(),
        ],
        program.programId
      );
    });

    it("initializes cranker registry", async () => {
      const minStake = new anchor.BN(LAMPORTS_PER_SOL); // 1 SOL
      const slashBps = 5000; // 50%
      const challengePeriod = new anchor.BN(3600); // 1 hour
      const rotationInterval = new anchor.BN(60); // 60 seconds

      await program.methods
        .initializeCrankerRegistry(
          minStake,
          slashBps,
          challengePeriod,
          rotationInterval
        )
        .accounts({
          orderBook: orderBookPda,
          crankerRegistry: registryPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const registry = await program.account.crankerRegistry.fetch(
        registryPda
      );
      expect(registry.orderBook.toString()).to.equal(
        orderBookPda.toString()
      );
      expect(registry.minStake.toNumber()).to.equal(LAMPORTS_PER_SOL);
      expect(registry.slashBps).to.equal(5000);
      expect(registry.challengePeriod.toNumber()).to.equal(3600);
      expect(registry.crankerCount).to.equal(0);
      expect(registry.rotationInterval.toNumber()).to.equal(60);
    });

    it("registers cranker A", async () => {
      const stakeAmount = new anchor.BN(LAMPORTS_PER_SOL);

      await program.methods
        .registerCranker(stakeAmount)
        .accounts({
          crankerRegistry: registryPda,
          crankerStake: stakeAPda,
          cranker: crankerA.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([crankerA])
        .rpc();

      const stake = await program.account.crankerStake.fetch(stakeAPda);
      expect(stake.cranker.toString()).to.equal(
        crankerA.publicKey.toString()
      );
      expect(stake.stakeAmount.toNumber()).to.equal(LAMPORTS_PER_SOL);
      expect(stake.index).to.equal(0);
      expect(stake.isActive).to.equal(true);
      expect(stake.slashedAmount.toNumber()).to.equal(0);

      const registry = await program.account.crankerRegistry.fetch(
        registryPda
      );
      expect(registry.crankerCount).to.equal(1);
    });

    it("registers cranker B", async () => {
      const stakeAmount = new anchor.BN(2 * LAMPORTS_PER_SOL);

      await program.methods
        .registerCranker(stakeAmount)
        .accounts({
          crankerRegistry: registryPda,
          crankerStake: stakeBPda,
          cranker: crankerB.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([crankerB])
        .rpc();

      const registry = await program.account.crankerRegistry.fetch(
        registryPda
      );
      expect(registry.crankerCount).to.equal(2);

      const stake = await program.account.crankerStake.fetch(stakeBPda);
      expect(stake.index).to.equal(1);
    });

    it("rejects registration below minimum stake", async () => {
      const lowStaker = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        lowStaker.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const [lowStakePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("cranker_stake"),
          registryPda.toBuffer(),
          lowStaker.publicKey.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .registerCranker(new anchor.BN(1000)) // way below 1 SOL min
          .accounts({
            crankerRegistry: registryPda,
            crankerStake: lowStakePda,
            cranker: lowStaker.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([lowStaker])
          .rpc();
        expect.fail("Expected error for low stake");
      } catch (e: any) {
        expect(e.error?.errorCode?.code || e.message).to.include(
          "StakeTooLow"
        );
      }
    });

    it("unregisters cranker B (starts cooldown)", async () => {
      await program.methods
        .unregisterCranker()
        .accounts({
          crankerRegistry: registryPda,
          crankerStake: stakeBPda,
          cranker: crankerB.publicKey,
        } as any)
        .signers([crankerB])
        .rpc();

      const stake = await program.account.crankerStake.fetch(stakeBPda);
      expect(stake.isActive).to.equal(false);
      expect(stake.unstakeRequestedAt.toNumber()).to.be.greaterThan(0);

      const registry = await program.account.crankerRegistry.fetch(
        registryPda
      );
      expect(registry.crankerCount).to.equal(1);
    });

    it("rejects early stake withdrawal (before cooldown)", async () => {
      try {
        await program.methods
          .withdrawStake()
          .accounts({
            crankerRegistry: registryPda,
            crankerStake: stakeBPda,
            cranker: crankerB.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([crankerB])
          .rpc();
        expect.fail("Expected SettlementNotExpired error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code || e.message).to.include(
          "CooldownNotElapsed"
        );
      }
    });
  });

  // =========================================================================
  // Decentralized Root Submission
  // =========================================================================

  describe("Decentralized Epoch Root Submission", () => {
    let registryPda: PublicKey;
    let stakeAPda: PublicKey;
    let epochPda: PublicKey;
    const epochIndex = 2;

    before(async () => {
      [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cranker_registry"), orderBookPda.toBuffer()],
        program.programId
      );

      [stakeAPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("cranker_stake"),
          registryPda.toBuffer(),
          crankerA.publicKey.toBuffer(),
        ],
        program.programId
      );

      // Create epoch 2
      const epochIndexBuf = Buffer.alloc(4);
      epochIndexBuf.writeUInt32LE(epochIndex);

      [epochPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("epoch"), orderBookPda.toBuffer(), epochIndexBuf],
        program.programId
      );

      await program.methods
        .createEpoch()
        .accounts({
          orderBook: orderBookPda,
          epoch: epochPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
    });

    it("submits root as staked cranker", async () => {
      const root = Buffer.alloc(32).fill(0xdd);

      await program.methods
        .submitEpochRootDecentralized(Array.from(root) as number[], 20)
        .accounts({
          orderBook: orderBookPda,
          epoch: epochPda,
          crankerRegistry: registryPda,
          crankerStake: stakeAPda,
          cranker: crankerA.publicKey,
        } as any)
        .signers([crankerA])
        .rpc();

      const epoch = await program.account.epoch.fetch(epochPda);
      expect(epoch.rootSubmitted).to.equal(true);
      expect(epoch.orderCount).to.equal(20);
      expect(epoch.submittedBy.toString()).to.equal(
        crankerA.publicKey.toString()
      );
      expect(epoch.challengeDeadline.toNumber()).to.be.greaterThan(0);
    });

    it("rejects double submission from staked cranker", async () => {
      const root2 = Buffer.alloc(32).fill(0xee);

      try {
        await program.methods
          .submitEpochRootDecentralized(
            Array.from(root2) as number[],
            25
          )
          .accounts({
            orderBook: orderBookPda,
            epoch: epochPda,
            crankerRegistry: registryPda,
            crankerStake: stakeAPda,
            cranker: crankerA.publicKey,
          } as any)
          .signers([crankerA])
          .rpc();
        expect.fail("Expected EpochRootAlreadySubmitted error");
      } catch (e: any) {
        expect(e.error?.errorCode?.code || e.message).to.include(
          "EpochRootAlreadySubmitted"
        );
      }
    });
  });

  // =========================================================================
  // Challenge Submission
  // =========================================================================

  describe("Challenge System", () => {
    let registryPda: PublicKey;
    let epochPda: PublicKey;
    let challengePda: PublicKey;
    const epochIndex = 2; // same epoch we submitted root for above

    before(async () => {
      [registryPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("cranker_registry"), orderBookPda.toBuffer()],
        program.programId
      );

      const epochIndexBuf = Buffer.alloc(4);
      epochIndexBuf.writeUInt32LE(epochIndex);

      [epochPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("epoch"), orderBookPda.toBuffer(), epochIndexBuf],
        program.programId
      );

      [challengePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("challenge"),
          epochPda.toBuffer(),
          challenger.publicKey.toBuffer(),
        ],
        program.programId
      );
    });

    it("submits a challenge against epoch root", async () => {
      const proposedRoot = Buffer.alloc(32).fill(0xff);

      await program.methods
        .submitChallenge(Array.from(proposedRoot) as number[], 20)
        .accounts({
          orderBook: orderBookPda,
          epoch: epochPda,
          crankerRegistry: registryPda,
          challenge: challengePda,
          challenger: challenger.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .signers([challenger])
        .rpc();

      const challenge = await program.account.challenge.fetch(challengePda);
      expect(challenge.epoch.toString()).to.equal(epochPda.toString());
      expect(challenge.challenger.toString()).to.equal(
        challenger.publicKey.toString()
      );
      expect(challenge.challengedCranker.toString()).to.equal(
        crankerA.publicKey.toString()
      );
      expect(Buffer.from(challenge.proposedRoot).toString("hex")).to.equal(
        proposedRoot.toString("hex")
      );
      expect(challenge.proposedOrderCount).to.equal(20);
      // Anchor enum check
      expect(Object.keys(challenge.status)[0]).to.equal("pending");
      expect(challenge.bond.toNumber()).to.equal(100_000_000); // 0.1 SOL
    });

    it("rejects challenge with same root as submitted", async () => {
      // Fetch current root
      const epoch = await program.account.epoch.fetch(epochPda);
      const sameRoot = Array.from(epoch.merkleRoot) as number[];

      const otherChallenger = Keypair.generate();
      const sig = await provider.connection.requestAirdrop(
        otherChallenger.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);

      const [otherChallengePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("challenge"),
          epochPda.toBuffer(),
          otherChallenger.publicKey.toBuffer(),
        ],
        program.programId
      );

      try {
        await program.methods
          .submitChallenge(sameRoot, 20)
          .accounts({
            orderBook: orderBookPda,
            epoch: epochPda,
            crankerRegistry: registryPda,
            challenge: otherChallengePda,
            challenger: otherChallenger.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([otherChallenger])
          .rpc();
        expect.fail("Expected error for same root");
      } catch (e: any) {
        expect(e.error?.errorCode?.code || e.message).to.include(
          "ChallengeRootSameAsSubmitted"
        );
      }
    });

    it("resolves a challenge (rejected — wrong challenger root)", async () => {
      // Provide order data that hashes to the original root (0xdd...), not the proposed root (0xff...)
      // Since hash_leaf(order_data) won't match proposed_root 0xff..., challenge will be rejected
      const orderData = Buffer.alloc(64).fill(0x01);

      await program.methods
        .resolveChallenge(orderData)
        .accounts({
          challenge: challengePda,
          epoch: epochPda,
          crankerRegistry: registryPda,
          challenger: challenger.publicKey,
          resolver: authority.publicKey,
        } as any)
        .rpc();

      const challenge = await program.account.challenge.fetch(challengePda);
      expect(Object.keys(challenge.status)[0]).to.equal("rejected");
      expect(challenge.resolvedAt.toNumber()).to.be.greaterThan(0);
    });
  });

  // =========================================================================
  // Epoch Migration
  // =========================================================================

  describe("Epoch Migration", () => {
    it("migrate_epoch is idempotent on already-migrated epochs", async () => {
      // Epoch 0 was created with new code, so it already has the new fields
      const epochIndex = 0;
      const epochIndexBuf = Buffer.alloc(4);
      epochIndexBuf.writeUInt32LE(epochIndex);

      const [epochPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("epoch"), orderBookPda.toBuffer(), epochIndexBuf],
        program.programId
      );

      await program.methods
        .migrateEpoch()
        .accounts({
          orderBook: orderBookPda,
          epoch: epochPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      // Verify fields unchanged
      const epoch = await program.account.epoch.fetch(epochPda);
      expect(epoch.submittedBy.toString()).to.equal(
        PublicKey.default.toString()
      );
      expect(epoch.challengeDeadline.toNumber()).to.equal(0);
    });

    it("rejects migrate_epoch from non-authority", async () => {
      const epochIndex = 0;
      const epochIndexBuf = Buffer.alloc(4);
      epochIndexBuf.writeUInt32LE(epochIndex);

      const [epochPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("epoch"), orderBookPda.toBuffer(), epochIndexBuf],
        program.programId
      );

      try {
        await program.methods
          .migrateEpoch()
          .accounts({
            orderBook: orderBookPda,
            epoch: epochPda,
            authority: crankerA.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .signers([crankerA])
          .rpc();
        expect.fail("Expected Unauthorized error");
      } catch (e: any) {
        // Either constraint error or Unauthorized
        expect(e.toString()).to.match(/Unauthorized|ConstraintSeeds|0x7d1|2006/);
      }
    });
  });

  // =========================================================================
  // Order Chunk
  // =========================================================================

  describe("Order Chunk", () => {
    it("creates an order chunk for epoch 0", async () => {
      const epochIndex = 0;
      const epochIndexBuf = Buffer.alloc(4);
      epochIndexBuf.writeUInt32LE(epochIndex);

      const [epochPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("epoch"), orderBookPda.toBuffer(), epochIndexBuf],
        program.programId
      );

      const chunkIndex = 0;
      const chunkIndexBuf = Buffer.alloc(4);
      chunkIndexBuf.writeUInt32LE(chunkIndex);

      const [chunkPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("order_chunk"), epochPda.toBuffer(), chunkIndexBuf],
        program.programId
      );

      await program.methods
        .createOrderChunk(chunkIndex)
        .accounts({
          orderBook: orderBookPda,
          epoch: epochPda,
          orderChunk: chunkPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();

      const chunk = await program.account.orderChunk.fetch(chunkPda);
      expect(chunk.epoch.toString()).to.equal(epochPda.toString());
      expect(chunk.chunkIndex).to.equal(0);
      expect(chunk.activeCount).to.equal(0);
    });
  });
});
