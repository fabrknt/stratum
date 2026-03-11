use anchor_lang::prelude::*;

/// Registry managing staked cranker nodes for decentralized root submission
#[account]
pub struct CrankerRegistry {
    /// Parent order book
    pub order_book: Pubkey,
    /// Minimum stake required to register as cranker (lamports)
    pub min_stake: u64,
    /// Slash percentage in basis points (e.g. 5000 = 50%)
    pub slash_bps: u16,
    /// Challenge period in seconds after root submission
    pub challenge_period: i64,
    /// Number of registered active crankers
    pub cranker_count: u32,
    /// Current cranker index in rotation
    pub current_cranker_index: u32,
    /// Seconds per cranker turn
    pub rotation_interval: i64,
    /// Last rotation timestamp
    pub last_rotation_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl CrankerRegistry {
    pub const SPACE: usize = 8 + // discriminator
        32 + // order_book
        8 +  // min_stake
        2 +  // slash_bps
        8 +  // challenge_period
        4 +  // cranker_count
        4 +  // current_cranker_index
        8 +  // rotation_interval
        8 +  // last_rotation_at
        1;   // bump

    pub const SEED_PREFIX: &'static [u8] = b"cranker_registry";

    /// Determine which cranker index should submit based on elapsed time
    pub fn active_cranker_index(&self, now: i64) -> u32 {
        if self.cranker_count == 0 {
            return 0;
        }
        let elapsed = now.saturating_sub(self.last_rotation_at);
        let rotations = elapsed / self.rotation_interval.max(1);
        ((self.current_cranker_index as i64 + rotations) as u32) % self.cranker_count
    }

    /// Check if it's a given cranker's turn
    pub fn is_crankers_turn(&self, cranker_index: u32, now: i64) -> bool {
        if self.cranker_count == 0 {
            return false;
        }
        self.active_cranker_index(now) == cranker_index
    }

    /// Check if the fallback window is active (next cranker can submit
    /// if the designated cranker is unresponsive)
    pub fn is_fallback_window(&self, now: i64) -> bool {
        let elapsed = now.saturating_sub(self.last_rotation_at);
        let interval = self.rotation_interval.max(1);
        let time_in_rotation = elapsed % interval;
        // Fallback: last 25% of rotation interval
        time_in_rotation > (interval * 3 / 4)
    }

    /// Calculate slash amount for a cranker's stake
    pub fn calculate_slash(&self, stake_amount: u64) -> u64 {
        ((stake_amount as u128 * self.slash_bps as u128) / 10000) as u64
    }
}

/// Individual cranker's staking record
#[account]
pub struct CrankerStake {
    /// Parent registry
    pub registry: Pubkey,
    /// Cranker's public key
    pub cranker: Pubkey,
    /// Amount staked (lamports)
    pub stake_amount: u64,
    /// Position in rotation order
    pub index: u32,
    /// Whether this cranker is active
    pub is_active: bool,
    /// Total amount slashed from this cranker
    pub slashed_amount: u64,
    /// When this cranker registered
    pub joined_at: i64,
    /// Unstake cooldown start (0 = not in cooldown)
    pub unstake_requested_at: i64,
    /// PDA bump
    pub bump: u8,
}

impl CrankerStake {
    pub const SPACE: usize = 8 + // discriminator
        32 + // registry
        32 + // cranker
        8 +  // stake_amount
        4 +  // index
        1 +  // is_active
        8 +  // slashed_amount
        8 +  // joined_at
        8 +  // unstake_requested_at
        1;   // bump

    pub const SEED_PREFIX: &'static [u8] = b"cranker_stake";

    /// Cooldown period before stake can be withdrawn (7 days)
    pub const UNSTAKE_COOLDOWN: i64 = 604800;

    /// Check if stake is in cooldown
    pub fn is_in_cooldown(&self) -> bool {
        self.unstake_requested_at > 0
    }

    /// Check if cooldown is complete and stake can be withdrawn
    pub fn can_withdraw(&self, now: i64) -> bool {
        self.unstake_requested_at > 0
            && now >= self.unstake_requested_at + Self::UNSTAKE_COOLDOWN
    }
}
