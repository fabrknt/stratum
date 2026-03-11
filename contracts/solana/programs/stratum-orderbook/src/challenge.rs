use anchor_lang::prelude::*;

/// Status of a challenge against a submitted epoch root
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ChallengeStatus {
    /// Challenge is pending resolution
    Pending,
    /// Challenge accepted — cranker was wrong, stake slashed
    Accepted,
    /// Challenge rejected — challenger was wrong, bond forfeited
    Rejected,
}

/// A challenge against a submitted epoch root
#[account]
pub struct Challenge {
    /// The epoch being challenged
    pub epoch: Pubkey,
    /// Who submitted the challenge
    pub challenger: Pubkey,
    /// The cranker who submitted the disputed root
    pub challenged_cranker: Pubkey,
    /// The alternative root proposed by challenger
    pub proposed_root: [u8; 32],
    /// Number of orders used to compute proposed root
    pub proposed_order_count: u32,
    /// Challenge status
    pub status: ChallengeStatus,
    /// When the challenge was created
    pub created_at: i64,
    /// When the challenge was resolved (0 if pending)
    pub resolved_at: i64,
    /// Challenge bond in lamports (returned if accepted, forfeited if rejected)
    pub bond: u64,
    /// PDA bump
    pub bump: u8,
}

impl Challenge {
    pub const SPACE: usize = 8 + // discriminator
        32 + // epoch
        32 + // challenger
        32 + // challenged_cranker
        32 + // proposed_root
        4 +  // proposed_order_count
        1 +  // status (enum)
        8 +  // created_at
        8 +  // resolved_at
        8 +  // bond
        1;   // bump

    pub const SEED_PREFIX: &'static [u8] = b"challenge";

    /// Minimum bond required to submit a challenge (0.1 SOL)
    pub const MIN_BOND: u64 = 100_000_000;
}
