/**
 * MYST Token Service
 * 
 * Core economic logic for the AKARI Mystic Club token system.
 * 
 * Key concepts:
 * - 1 MYST = 100 Stars (internal accounting)
 * - 100 Stars ~ 2 USD, so 1 MYST ~ 2 USD
 * - Stars -> MYST is allowed (one-way in v1)
 * - MYST -> Stars is NOT allowed
 * 
 * Fee Distribution (on every MYST spend):
 * - 75% Platform fee (retained)
 * - 5% Wheel Pool (for Wheel of Fortune prizes)
 * - 20% Burned (removed from circulation)
 * 
 * Time-Limited Promos (until 2026-01-01):
 * - Onboarding bonus: 5 MYST for new users
 * - Referral milestone: 10 MYST when user refers 5 people
 * These promos are time-gated to prevent inflation beyond the period
 * where Stars revenue is guaranteed.
 * 
 * Referral rates (from spend, not from promos):
 * - Level 1 (direct): 10% of downline MYST spent
 * - Level 2 (indirect): 2% of downline MYST spent
 */

import { PrismaClient, User } from '@prisma/client';

// ============================================
// CONFIGURATION
// ============================================

/**
 * Time limit for promotional MYST minting (onboarding + referral milestone).
 * After this date, no new promotional MYST will be minted to prevent inflation.
 */
export const MYST_TIME_LIMIT = new Date('2026-01-01T00:00:00Z');

export const MYST_CONFIG = {
  // Conversion rate: 100 Stars = 1 MYST
  STARS_PER_MYST: 100,
  
  // USD value: 1 MYST = 2 USD (for reward calculations)
  MYST_USD_PRICE: 2,
  
  // Referral reward rates (from spend)
  REFERRAL_LEVEL_1_RATE: 0.10, // 10%
  REFERRAL_LEVEL_2_RATE: 0.02, // 2%
  
  // Prediction market fee rate
  DEFAULT_FEE_RATE: 0.08, // 8%
  
  // Fee distribution on MYST spend
  PLATFORM_FEE_RATE: 0.75, // 75% to platform
  WHEEL_POOL_RATE: 0.05,   // 5% to wheel pool
  BURN_RATE: 0.20,         // 20% burned
  
  // Minimum bet amount in MYST
  MINIMUM_BET: 2,
  
  // Promotional amounts (time-limited until MYST_TIME_LIMIT)
  ONBOARDING_BONUS_AMOUNT: 5,
  REFERRAL_MILESTONE_AMOUNT: 10,
  REFERRAL_MILESTONE_THRESHOLD: 5, // Number of referrals needed
  
  // Wheel of Fortune prizes
  WHEEL_PRIZES: [0, 0.1, 0.2, 0.5, 1, 3, 5, 10],
} as const;

// ============================================
// TRANSACTION TYPES
// ============================================

export type MystTransactionType = 
  | 'stars_conversion'    // Stars -> MYST
  | 'bet'                 // Betting on prediction
  | 'win'                 // Winning from prediction
  | 'referral_reward'     // Reward from referral spend
  | 'admin_grant'         // Admin-granted MYST
  | 'campaign_fee'        // Campaign entry fee
  | 'boost'               // Boost purchase
  | 'onboarding_bonus'    // New user bonus (time-limited)
  | 'referral_milestone'  // 5-referral bonus (time-limited)
  | 'wheel_win';          // Wheel of Fortune win

// ============================================
// BALANCE FUNCTIONS
// ============================================

/**
 * Get user's current MYST balance from transaction ledger.
 * Balance = SUM(amount) for all transactions.
 * 
 * Returns 0 if the table doesn't exist or query fails.
 */
export async function getMystBalance(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  if (!userId) return 0;
  
  try {
    const result = await prisma.mystTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  } catch (e: any) {
    console.warn('[MystService] getMystBalance failed:', e.message);
    return 0;
  }
}

/**
 * Get user's MYST balance by Telegram ID.
 */
export async function getMystBalanceByTelegramId(
  prisma: PrismaClient,
  telegramId: string
): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { telegramId },
    select: { id: true },
  });
  if (!user) return 0;
  return getMystBalance(prisma, user.id);
}

// ============================================
// ONBOARDING BONUS (Time-Limited)
// ============================================

/**
 * Grant onboarding MYST bonus to new users.
 * - 5 MYST bonus for new users
 * - Only available until 2026-01-01
 * - One-time per user (tracked via onboarding_bonus transaction type)
 */
export async function grantOnboardingMystIfEligible(
  prisma: PrismaClient,
  userId: string
): Promise<{ granted: boolean; reason: string; amount?: number }> {
  if (!userId) {
    return { granted: false, reason: 'no-user' };
  }

  const now = new Date();
  if (now >= MYST_TIME_LIMIT) {
    console.log('[MystService] Onboarding bonus cutoff reached (2026-01-01)');
    return { granted: false, reason: 'after-cutoff' };
  }

  try {
    // Check if user already has an onboarding bonus transaction
    const existing = await prisma.mystTransaction.findFirst({
      where: {
        userId,
        type: 'onboarding_bonus',
      },
    });

    if (existing) {
      console.log(`[MystService] User ${userId} already received onboarding bonus`);
      return { granted: false, reason: 'already-granted' };
    }

    // Grant the bonus
    await creditMyst(
      prisma,
      userId,
      MYST_CONFIG.ONBOARDING_BONUS_AMOUNT,
      'onboarding_bonus',
      { source: 'onboarding', grantedAt: now.toISOString() }
    );

    console.log(`[MystService] Granted ${MYST_CONFIG.ONBOARDING_BONUS_AMOUNT} MYST onboarding bonus to user ${userId}`);
    return { granted: true, reason: 'granted', amount: MYST_CONFIG.ONBOARDING_BONUS_AMOUNT };
  } catch (e: any) {
    console.error('[MystService] grantOnboardingMystIfEligible failed:', e.message);
    return { granted: false, reason: 'error' };
  }
}

// ============================================
// REFERRAL MILESTONE (Time-Limited)
// ============================================

/**
 * Check and grant referral milestone bonus when user reaches 5 referrals.
 * - 10 MYST bonus when user has referred 5 unique users
 * - Only available until 2026-01-01
 * - One-time per user
 */
export async function checkAndGrantReferralMilestone(
  prisma: PrismaClient,
  userId: string
): Promise<{ granted: boolean; reason: string; amount?: number }> {
  if (!userId) {
    return { granted: false, reason: 'no-user' };
  }

  const now = new Date();
  
  // Time gate: no new referral milestone MYST after cutoff
  if (now >= MYST_TIME_LIMIT) {
    return { granted: false, reason: 'milestone_expired' };
  }

  try {
    // Check if user already received the milestone
    const existingMilestone = await prisma.mystTransaction.findFirst({
      where: {
        userId,
        type: 'referral_milestone',
      },
    });

    if (existingMilestone) {
      return { granted: false, reason: 'already-granted' };
    }

    // Count referrals
    const referralCount = await prisma.user.count({
      where: { referrerId: userId },
    });

    if (referralCount < MYST_CONFIG.REFERRAL_MILESTONE_THRESHOLD) {
      return { granted: false, reason: 'not-enough-referrals' };
    }

    // Grant the milestone bonus
    await creditMyst(
      prisma,
      userId,
      MYST_CONFIG.REFERRAL_MILESTONE_AMOUNT,
      'referral_milestone',
      { 
        source: 'referral_milestone',
        referralCount,
        grantedAt: now.toISOString(),
      }
    );

    console.log(`[MystService] Granted ${MYST_CONFIG.REFERRAL_MILESTONE_AMOUNT} MYST referral milestone to user ${userId} (${referralCount} referrals)`);
    return { granted: true, reason: 'granted', amount: MYST_CONFIG.REFERRAL_MILESTONE_AMOUNT };
  } catch (e: any) {
    console.error('[MystService] checkAndGrantReferralMilestone failed:', e.message);
    return { granted: false, reason: 'error' };
  }
}

// ============================================
// CREDIT FUNCTIONS
// ============================================

/**
 * Credit MYST to a user's account.
 * Creates a transaction record.
 * 
 * @param type - Transaction type (e.g., 'admin_grant', 'win')
 * @param meta - Optional metadata
 */
export async function creditMyst(
  prisma: PrismaClient,
  userId: string,
  amount: number,
  type: string,
  meta?: Record<string, any>
): Promise<{ credited: number; newBalance: number }> {
  if (!userId) {
    throw new Error('userId is required');
  }
  if (amount <= 0) {
    throw new Error('Credit amount must be positive');
  }

  try {
    await prisma.mystTransaction.create({
      data: {
        userId,
        type,
        amount,
        ...(meta ? { meta } : {}),
      },
    });

    const newBalance = await getMystBalance(prisma, userId);
    console.log(`[MystService] Credited ${amount} MYST to user ${userId}. New balance: ${newBalance}`);
    
    return { credited: amount, newBalance };
  } catch (e: any) {
    console.error('[MystService] creditMyst failed:', e.message);
    throw e;
  }
}

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert Stars to MYST.
 * Rate: 100 Stars = 1 MYST
 * 
 * @param stars - Number of Stars to convert
 * @returns MYST amount received
 */
export function starsToMyst(stars: number): number {
  return stars / MYST_CONFIG.STARS_PER_MYST;
}

/**
 * Process Stars -> MYST conversion for a user.
 * Creates a transaction record and returns the new balance.
 */
export async function convertStarsToMyst(
  prisma: PrismaClient,
  userId: string,
  starsAmount: number
): Promise<{ mystReceived: number; newBalance: number }> {
  if (starsAmount <= 0) {
    throw new Error('Stars amount must be positive');
  }

  const mystReceived = starsToMyst(starsAmount);

  await prisma.mystTransaction.create({
    data: {
      userId,
      type: 'stars_conversion',
      amount: mystReceived,
      meta: { starsConverted: starsAmount },
    },
  });

  const newBalance = await getMystBalance(prisma, userId);
  return { mystReceived, newBalance };
}

// ============================================
// WHEEL POOL FUNCTIONS
// ============================================

/**
 * Get or create the wheel pool.
 */
export async function getWheelPool(prisma: PrismaClient): Promise<{ id: string; balance: number }> {
  try {
    let pool = await prisma.wheelPool.findUnique({
      where: { id: 'main_pool' },
    });

    if (!pool) {
      pool = await prisma.wheelPool.create({
        data: { id: 'main_pool', balance: 0 },
      });
    }

    return { id: pool.id, balance: pool.balance };
  } catch (e: any) {
    console.warn('[MystService] getWheelPool failed:', e.message);
    return { id: 'main_pool', balance: 0 };
  }
}

/**
 * Add MYST to the wheel pool.
 */
export async function addToWheelPool(
  prisma: PrismaClient,
  amount: number
): Promise<void> {
  if (amount <= 0) return;

  try {
    await prisma.wheelPool.upsert({
      where: { id: 'main_pool' },
      update: { balance: { increment: amount } },
      create: { id: 'main_pool', balance: amount },
    });
  } catch (e: any) {
    console.error('[MystService] addToWheelPool failed:', e.message);
  }
}

/**
 * Deduct from wheel pool (for payouts).
 */
export async function deductFromWheelPool(
  prisma: PrismaClient,
  amount: number
): Promise<boolean> {
  if (amount <= 0) return true;

  try {
    const pool = await getWheelPool(prisma);
    if (pool.balance < amount) {
      return false;
    }

    await prisma.wheelPool.update({
      where: { id: 'main_pool' },
      data: { balance: { decrement: amount } },
    });

    return true;
  } catch (e: any) {
    console.error('[MystService] deductFromWheelPool failed:', e.message);
    return false;
  }
}

// ============================================
// SPENDING FUNCTIONS
// ============================================

/**
 * Spend MYST and process referral rewards + fee distribution.
 * 
 * Fee Distribution:
 * - 75% Platform fee (retained as negative balance in ecosystem)
 * - 5% Wheel Pool (added to wheel fund)
 * - 20% Burned (removed from circulation)
 * 
 * Referral Rewards (from the platform's portion):
 * - Level 1 (direct): 10% of spend
 * - Level 2 (indirect): 2% of spend
 * 
 * @param spendType - Type of spend (bet, campaign_fee, boost)
 * @param referenceId - Optional reference (predictionId, campaignId, etc.)
 */
export async function spendMyst(
  prisma: PrismaClient,
  userId: string,
  amount: number,
  spendType: 'bet' | 'campaign_fee' | 'boost',
  referenceId?: string
): Promise<{
  spent: number;
  referralLevel1Reward: number;
  referralLevel2Reward: number;
  wheelPoolContribution: number;
}> {
  if (amount <= 0) {
    throw new Error('Spend amount must be positive');
  }

  // Check balance
  const balance = await getMystBalance(prisma, userId);
  if (balance < amount) {
    throw new Error(`Insufficient MYST balance. Have: ${balance}, Need: ${amount}`);
  }

  // Get user with referrer info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      referrer: {
        include: {
          referrer: true, // Level 2 referrer
        },
      },
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Calculate fee distribution
  const wheelPoolContribution = amount * MYST_CONFIG.WHEEL_POOL_RATE;
  // Platform keeps 75%, 20% is burned (just not credited anywhere)

  // Calculate referral rewards
  let referralLevel1Reward = 0;
  let referralLevel2Reward = 0;
  let referrerLevel1Id: string | null = null;
  let referrerLevel2Id: string | null = null;

  if (user.referrer) {
    referrerLevel1Id = user.referrer.id;
    referralLevel1Reward = amount * MYST_CONFIG.REFERRAL_LEVEL_1_RATE;

    if (user.referrer.referrer) {
      referrerLevel2Id = user.referrer.referrer.id;
      referralLevel2Reward = amount * MYST_CONFIG.REFERRAL_LEVEL_2_RATE;
    }
  }

  // Execute all transactions atomically
  await prisma.$transaction(async (tx) => {
    // 1. Debit the spender
    await tx.mystTransaction.create({
      data: {
        userId,
        type: spendType,
        amount: -amount,
        meta: { referenceId, spendType },
      },
    });

    // 2. Credit Level 1 referrer
    if (referrerLevel1Id && referralLevel1Reward > 0) {
      await tx.mystTransaction.create({
        data: {
          userId: referrerLevel1Id,
          type: 'referral_reward',
          amount: referralLevel1Reward,
          meta: {
            fromUserId: userId,
            level: 1,
            originalSpend: amount,
            spendType,
            referenceId,
          },
        },
      });
    }

    // 3. Credit Level 2 referrer
    if (referrerLevel2Id && referralLevel2Reward > 0) {
      await tx.mystTransaction.create({
        data: {
          userId: referrerLevel2Id,
          type: 'referral_reward',
          amount: referralLevel2Reward,
          meta: {
            fromUserId: userId,
            level: 2,
            originalSpend: amount,
            spendType,
            referenceId,
          },
        },
      });
    }

    // 4. Record the referral event
    await tx.referralEvent.create({
      data: {
        userId,
        referrerLevel1Id,
        rewardLevel1: referralLevel1Reward,
        referrerLevel2Id,
        rewardLevel2: referralLevel2Reward,
        mystSpent: amount,
        spendType,
        referenceId,
      },
    });

    // 5. Add to wheel pool
    if (wheelPoolContribution > 0) {
      await tx.wheelPool.upsert({
        where: { id: 'main_pool' },
        update: { balance: { increment: wheelPoolContribution } },
        create: { id: 'main_pool', balance: wheelPoolContribution },
      });
    }
  });

  return {
    spent: amount,
    referralLevel1Reward,
    referralLevel2Reward,
    wheelPoolContribution,
  };
}

// ============================================
// PREDICTION MARKET FUNCTIONS
// ============================================

/**
 * Calculate payout for winning bets in a prediction market.
 * 
 * Formula:
 * - POOL = Y + N (total MYST on both sides)
 * - FEE = POOL * feeRate
 * - WIN_POOL = POOL - FEE
 * - payout_per_MYST = WIN_POOL / winning_side_total
 * - user_payout = user_stake * payout_per_MYST
 */
export function calculatePredictionPayout(
  userStake: number,
  winningSideTotal: number,
  losingSideTotal: number,
  feeRate: number = MYST_CONFIG.DEFAULT_FEE_RATE
): { payout: number; fee: number } {
  const totalPool = winningSideTotal + losingSideTotal;
  const fee = totalPool * feeRate;
  const winPool = totalPool - fee;
  
  if (winningSideTotal <= 0) {
    return { payout: 0, fee };
  }
  
  const payoutPerMyst = winPool / winningSideTotal;
  const payout = userStake * payoutPerMyst;
  
  return { payout, fee };
}

/**
 * Credit winning payout to a user.
 */
export async function creditWinningPayout(
  prisma: PrismaClient,
  userId: string,
  payout: number,
  predictionId: string
): Promise<void> {
  if (payout <= 0) return;

  await prisma.mystTransaction.create({
    data: {
      userId,
      type: 'win',
      amount: payout,
      meta: { predictionId },
    },
  });
}

// ============================================
// REFERRAL CODE FUNCTIONS
// ============================================

/**
 * Generate a unique referral code for a user.
 */
export function generateReferralCode(telegramId: string): string {
  const base = telegramId.slice(-6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AKARI_${base}_${random}`;
}

/**
 * Apply a referral code to a new user.
 * Also checks for referral milestone after applying.
 */
export async function applyReferralCode(
  prisma: PrismaClient,
  userId: string,
  referralCode: string
): Promise<{ success: boolean; referrerUsername?: string; error?: string }> {
  // Find referrer by code
  const referrer = await prisma.user.findUnique({
    where: { referralCode },
    select: { id: true, username: true },
  });

  if (!referrer) {
    return { success: false, error: 'Invalid referral code' };
  }

  if (referrer.id === userId) {
    return { success: false, error: 'Cannot refer yourself' };
  }

  // Check if user already has a referrer
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referrerId: true },
  });

  if (user?.referrerId) {
    return { success: false, error: 'Already have a referrer' };
  }

  // Apply referral
  await prisma.user.update({
    where: { id: userId },
    data: { referrerId: referrer.id },
  });

  // Check and grant referral milestone if applicable
  await checkAndGrantReferralMilestone(prisma, referrer.id);

  return {
    success: true,
    referrerUsername: referrer.username || undefined,
  };
}

// ============================================
// LEADERBOARD FUNCTIONS
// ============================================

/**
 * Get top spenders for a time period.
 */
export async function getTopSpenders(
  prisma: PrismaClient,
  startTime: Date,
  endTime: Date,
  limit: number = 10
): Promise<Array<{ userId: string; totalSpent: number }>> {
  const result = await prisma.mystTransaction.groupBy({
    by: ['userId'],
    where: {
      type: { in: ['bet', 'campaign_fee', 'boost'] },
      amount: { lt: 0 }, // Only debits (negative amounts)
      createdAt: {
        gte: startTime,
        lte: endTime,
      },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'asc' } }, // Most negative = most spent
    take: limit,
  });

  return result.map((r) => ({
    userId: r.userId,
    totalSpent: Math.abs(r._sum.amount ?? 0),
  }));
}

/**
 * Get top referrers for a time period.
 */
export async function getTopReferrers(
  prisma: PrismaClient,
  startTime: Date,
  endTime: Date,
  limit: number = 10
): Promise<Array<{ userId: string; totalRewards: number }>> {
  const result = await prisma.mystTransaction.groupBy({
    by: ['userId'],
    where: {
      type: 'referral_reward',
      amount: { gt: 0 },
      createdAt: {
        gte: startTime,
        lte: endTime,
      },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: limit,
  });

  return result.map((r) => ({
    userId: r.userId,
    totalRewards: r._sum.amount ?? 0,
  }));
}

/**
 * Get user's total MYST spent in a time period.
 */
export async function getUserSpentInPeriod(
  prisma: PrismaClient,
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<number> {
  const result = await prisma.mystTransaction.aggregate({
    where: {
      userId,
      type: { in: ['bet', 'campaign_fee', 'boost'] },
      amount: { lt: 0 },
      createdAt: {
        gte: startTime,
        lte: endTime,
      },
    },
    _sum: { amount: true },
  });

  return Math.abs(result._sum.amount ?? 0);
}

/**
 * Get user's total referral earnings in a time period.
 */
export async function getUserReferralEarningsInPeriod(
  prisma: PrismaClient,
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<number> {
  const result = await prisma.mystTransaction.aggregate({
    where: {
      userId,
      type: 'referral_reward',
      amount: { gt: 0 },
      createdAt: {
        gte: startTime,
        lte: endTime,
      },
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? 0;
}
