import { PublicKey, SystemProgram } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import type { Wallet } from '@coral-xyz/anchor';
import type { StratumOrderbook } from './stratum_orderbook';

export interface RegistryConfig {
  minStake: number;
  slashBps: number;
  challengePeriod: number;
  rotationInterval: number;
}

export interface CrankerRegistryState {
  orderBook: PublicKey;
  minStake: number;
  slashBps: number;
  challengePeriod: number;
  crankerCount: number;
  currentCrankerIndex: number;
  rotationInterval: number;
  lastRotationAt: number;
}

export interface CrankerStakeState {
  registry: PublicKey;
  cranker: PublicKey;
  stakeAmount: number;
  index: number;
  isActive: boolean;
  slashedAmount: number;
  joinedAt: number;
  unstakeRequestedAt: number;
}

/**
 * Client for cranker staking operations.
 * Handles registration, unstaking, and rotation queries.
 */
export class CrankerStaking {
  private program: Program<StratumOrderbook>;
  private orderBookAddress: PublicKey;
  private wallet: Wallet;

  constructor(
    program: Program<StratumOrderbook>,
    orderBookAddress: PublicKey,
    wallet: Wallet,
  ) {
    this.program = program;
    this.orderBookAddress = orderBookAddress;
    this.wallet = wallet;
  }

  /** Derive the cranker registry PDA */
  deriveRegistryPda(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('cranker_registry'), this.orderBookAddress.toBuffer()],
      this.program.programId,
    );
  }

  /** Derive a cranker stake PDA */
  deriveStakePda(cranker?: PublicKey): [PublicKey, number] {
    const [registryPda] = this.deriveRegistryPda();
    const crankerKey = cranker ?? this.wallet.publicKey;
    return PublicKey.findProgramAddressSync(
      [Buffer.from('cranker_stake'), registryPda.toBuffer(), crankerKey.toBuffer()],
      this.program.programId,
    );
  }

  /** Initialize cranker registry for an order book */
  async initializeRegistry(config: RegistryConfig): Promise<string> {
    const [registryPda] = this.deriveRegistryPda();

    const tx = await this.program.methods
      .initializeCrankerRegistry(
        new BN(config.minStake),
        config.slashBps,
        new BN(config.challengePeriod),
        new BN(config.rotationInterval),
      )
      .accounts({
        orderBook: this.orderBookAddress,
        crankerRegistry: registryPda,
        authority: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    return tx;
  }

  /** Register as a cranker by staking SOL */
  async registerCranker(stakeAmount: number): Promise<string> {
    const [registryPda] = this.deriveRegistryPda();
    const [stakePda] = this.deriveStakePda();

    const tx = await this.program.methods
      .registerCranker(new BN(stakeAmount))
      .accounts({
        crankerRegistry: registryPda,
        crankerStake: stakePda,
        cranker: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    return tx;
  }

  /** Start unstaking cooldown */
  async unregisterCranker(): Promise<string> {
    const [registryPda] = this.deriveRegistryPda();
    const [stakePda] = this.deriveStakePda();

    const tx = await this.program.methods
      .unregisterCranker()
      .accounts({
        crankerRegistry: registryPda,
        crankerStake: stakePda,
        cranker: this.wallet.publicKey,
      } as any)
      .rpc();

    return tx;
  }

  /** Withdraw stake after cooldown completes */
  async withdrawStake(): Promise<string> {
    const [registryPda] = this.deriveRegistryPda();
    const [stakePda] = this.deriveStakePda();

    const tx = await this.program.methods
      .withdrawStake()
      .accounts({
        crankerRegistry: registryPda,
        crankerStake: stakePda,
        cranker: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    return tx;
  }

  /** Check if it's this cranker's turn to submit */
  async isMyTurn(): Promise<boolean> {
    try {
      const registry = await this.getRegistryState();
      const stake = await this.getMyStake();
      if (!stake || !stake.isActive) return false;

      const now = Math.floor(Date.now() / 1000);
      const elapsed = now - registry.lastRotationAt;
      const rotations = Math.floor(elapsed / Math.max(registry.rotationInterval, 1));
      const activeIndex =
        (registry.currentCrankerIndex + rotations) % registry.crankerCount;

      if (activeIndex === stake.index) return true;

      // Check fallback window
      const timeInRotation = elapsed % Math.max(registry.rotationInterval, 1);
      return timeInRotation > (registry.rotationInterval * 3) / 4;
    } catch {
      // Registry doesn't exist — single cranker mode
      return true;
    }
  }

  /** Fetch registry state */
  async getRegistryState(): Promise<CrankerRegistryState> {
    const [registryPda] = this.deriveRegistryPda();
    const account = await (this.program.account as any).crankerRegistry.fetch(registryPda);

    return {
      orderBook: account.orderBook,
      minStake: account.minStake.toNumber(),
      slashBps: account.slashBps,
      challengePeriod: account.challengePeriod.toNumber(),
      crankerCount: account.crankerCount,
      currentCrankerIndex: account.currentCrankerIndex,
      rotationInterval: account.rotationInterval.toNumber(),
      lastRotationAt: account.lastRotationAt.toNumber(),
    };
  }

  /** Fetch this cranker's stake state */
  async getMyStake(): Promise<CrankerStakeState | null> {
    const [stakePda] = this.deriveStakePda();
    try {
      const account = await (this.program.account as any).crankerStake.fetch(stakePda);
      return {
        registry: account.registry,
        cranker: account.cranker,
        stakeAmount: account.stakeAmount.toNumber(),
        index: account.index,
        isActive: account.isActive,
        slashedAmount: account.slashedAmount.toNumber(),
        joinedAt: account.joinedAt.toNumber(),
        unstakeRequestedAt: account.unstakeRequestedAt.toNumber(),
      };
    } catch {
      return null;
    }
  }
}
