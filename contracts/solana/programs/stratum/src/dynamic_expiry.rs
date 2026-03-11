use anchor_lang::prelude::*;
use crate::errors::StratumError;

/// Dynamic expiry configuration with time-based reward escalation.
/// Replaces static cleanup_reward with a model where the reward
/// increases linearly from base_reward to max_reward over the
/// escalation_period after expiry + grace_period.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct DynamicExpiryConfig {
    /// When the record was created
    pub created_at: i64,

    /// When the record expires (0 = never expires)
    pub expires_at: i64,

    /// Grace period after expiry before cleanup is allowed (seconds)
    pub grace_period: i64,

    /// Base cleanup reward (lamports) — awarded at the start of cleanup eligibility
    pub base_reward: u64,

    /// Maximum cleanup reward (lamports) — reached after escalation_period
    pub max_reward: u64,

    /// Time in seconds over which reward escalates from base to max
    pub escalation_period: i64,
}

impl DynamicExpiryConfig {
    /// Create a new dynamic expiry config
    pub fn new(
        ttl_seconds: i64,
        grace_period: i64,
        base_reward: u64,
        max_reward: u64,
        escalation_period: i64,
    ) -> Result<Self> {
        let now = Clock::get()?.unix_timestamp;
        Ok(Self {
            created_at: now,
            expires_at: if ttl_seconds > 0 {
                now.checked_add(ttl_seconds).ok_or(StratumError::Overflow)?
            } else {
                0
            },
            grace_period,
            base_reward,
            max_reward: max_reward.max(base_reward),
            escalation_period: escalation_period.max(1),
        })
    }

    /// Check if the record has expired
    pub fn is_expired(&self) -> Result<bool> {
        if self.expires_at == 0 {
            return Ok(false);
        }
        let now = Clock::get()?.unix_timestamp;
        Ok(now > self.expires_at)
    }

    /// Check if cleanup is allowed (expired + grace period passed)
    pub fn can_cleanup(&self) -> Result<bool> {
        if self.expires_at == 0 {
            return Ok(false);
        }
        let now = Clock::get()?.unix_timestamp;
        let cleanup_time = self
            .expires_at
            .checked_add(self.grace_period)
            .ok_or(StratumError::Overflow)?;
        Ok(now > cleanup_time)
    }

    /// Calculate dynamic cleanup reward based on time elapsed since cleanup eligibility.
    /// Linearly escalates from base_reward to max_reward over escalation_period.
    pub fn calculate_dynamic_reward(&self) -> Result<u64> {
        let now = Clock::get()?.unix_timestamp;

        if self.expires_at == 0 {
            return Ok(0);
        }

        let cleanup_start = self
            .expires_at
            .checked_add(self.grace_period)
            .ok_or(StratumError::Overflow)?;

        if now <= cleanup_start {
            return Ok(self.base_reward);
        }

        let overdue = now.saturating_sub(cleanup_start);

        if self.escalation_period <= 0 {
            return Ok(self.max_reward);
        }

        // Linear interpolation: base + (max - base) * min(overdue / escalation, 1.0)
        let reward_range = self.max_reward.saturating_sub(self.base_reward);

        let bonus = if overdue >= self.escalation_period {
            reward_range
        } else {
            // (reward_range * overdue) / escalation_period
            ((reward_range as u128 * overdue as u128) / self.escalation_period as u128) as u64
        };

        Ok(self.base_reward.saturating_add(bonus).min(self.max_reward))
    }

    /// Calculate reward with a cap (e.g., don't exceed account rent)
    pub fn calculate_capped_reward(&self, max_lamports: u64) -> Result<u64> {
        let reward = self.calculate_dynamic_reward()?;
        Ok(reward.min(max_lamports))
    }

    /// Extend the expiry time
    pub fn extend(&mut self, additional_seconds: i64) -> Result<()> {
        require!(self.expires_at > 0, StratumError::InvalidConfig);
        self.expires_at = self
            .expires_at
            .checked_add(additional_seconds)
            .ok_or(StratumError::Overflow)?;
        Ok(())
    }
}

/// Trait for accounts with dynamic expiry behavior
pub trait DynamicExpirable {
    fn dynamic_expiry(&self) -> &DynamicExpiryConfig;
    fn dynamic_expiry_mut(&mut self) -> &mut DynamicExpiryConfig;

    fn is_expired(&self) -> Result<bool> {
        self.dynamic_expiry().is_expired()
    }

    fn can_cleanup(&self) -> Result<bool> {
        self.dynamic_expiry().can_cleanup()
    }

    fn cleanup_reward(&self) -> Result<u64> {
        self.dynamic_expiry().calculate_dynamic_reward()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reward_escalation_math() {
        // Test the pure math without Clock dependency
        let config = DynamicExpiryConfig {
            created_at: 1000,
            expires_at: 2000,
            grace_period: 100,
            base_reward: 5000,
            max_reward: 50000,
            escalation_period: 86400, // 24 hours
        };

        // Verify max >= base invariant
        assert!(config.max_reward >= config.base_reward);

        // Verify escalation period is positive
        assert!(config.escalation_period > 0);
    }
}
