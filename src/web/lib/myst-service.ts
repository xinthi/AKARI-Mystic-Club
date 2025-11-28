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
 * Referral rates:
 * - Level 1 (direct): 10% of downline MYST spent
 * - Level 2 (indirect): 2% of downline MYST spent
 */

import { PrismaClient, User } from '@prisma/client';

// ============================================
// CONFIGURATION
// ============================================

export const MYST_CONFIG = {
  // Conversion rate: 100 Stars = 1 MYST
  STARS_PER_MYST: 100,
  
  // USD value: 1 MYST = 2 USD (for reward calculations)
  MYST_USD_PRICE: 2,
  
  // Referral reward rates
  REFERRAL_LEVEL_1_RATE: 0.10, // 10%
  REFERRAL_LEVEL_2_RATE: 0.02, // 2%
  
  // Prediction market fee rate
  DEFAULT_FEE_RATE: 0.08, // 8%
  
  // Weekly reward burn multiplier (10% extra burn required)
  BURN_MULTIPLIER: 1.1,
  
  // Minimum MYST to burn for rewards
  MIN_BURN_AMOUNT: 1,
} as const;

// ============================================
// TRANSACTION TYPES
// ============================================

export type MystTransactionType = 
  | 'stars_conversion'    // Stars -> MYST
  | 'bet'                 // Betting on prediction
  | 'win'                 // Winning from prediction
  | 'referral_reward'     // Reward from referral
  | 'burn_for_reward'     // Burned for weekly TON reward
  | 'admin_grant'         // Admin-granted MYST
  | 'campaign_fee'        // Campaign entry fee
  | 'boost';              // Boost purchase

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
    // Table might not exist yet, or other DB error
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
// SPENDING FUNCTIONS
// ============================================

/**
 * Spend MYST and process referral rewards.
 * 
 * This is the core function that should be called whenever a user spends MYST.
 * It handles:
 * 1. Deducting MYST from user's balance
 * 2. Calculating and crediting referral rewards (L1 and L2)
 * 3. Recording the referral event
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
  });

  return {
    spent: amount,
    referralLevel1Reward,
    referralLevel2Reward,
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
// WEEKLY REWARD FUNCTIONS
// ============================================

/**
 * Calculate required MYST burn for a USD reward.
 * Formula: (rewardUsd / MYST_USD_PRICE) * BURN_MULTIPLIER
 */
export function calculateRequiredBurn(rewardUsd: number): number {
  const baseMyst = rewardUsd / MYST_CONFIG.MYST_USD_PRICE;
  return baseMyst * MYST_CONFIG.BURN_MULTIPLIER;
}

/**
 * Process reward claim with MYST burn.
 * 
 * Rules:
 * - User must burn min(balance, requiredMyst)
 * - If balance < requiredMyst, user burns everything and still gets reward
 * - At least MIN_BURN_AMOUNT MYST must be burned if user has any balance
 */
export async function claimRewardWithBurn(
  prisma: PrismaClient,
  userId: string,
  rewardId: string,
  tonWallet?: string
): Promise<{
  success: boolean;
  burnedAmount: number;
  error?: string;
}> {
  // Get the reward
  const reward = await prisma.leaderboardReward.findUnique({
    where: { id: rewardId },
  });

  if (!reward) {
    return { success: false, burnedAmount: 0, error: 'Reward not found' };
  }

  if (reward.userId !== userId) {
    return { success: false, burnedAmount: 0, error: 'Unauthorized' };
  }

  if (reward.status === 'paid') {
    return { success: false, burnedAmount: 0, error: 'Reward already paid' };
  }

  // Get current balance
  const balance = await getMystBalance(prisma, userId);

  // Recompute required MYST (to prevent tampering)
  const requiredMyst = calculateRequiredBurn(reward.rewardUsd);

  // Calculate burn amount
  const burnAmount = Math.min(balance, requiredMyst);

  if (burnAmount < MYST_CONFIG.MIN_BURN_AMOUNT && balance > 0) {
    return {
      success: false,
      burnedAmount: 0,
      error: `Minimum burn amount is ${MYST_CONFIG.MIN_BURN_AMOUNT} MYST`,
    };
  }

  if (burnAmount <= 0 && balance <= 0) {
    return {
      success: false,
      burnedAmount: 0,
      error: 'You have no MYST to burn for this reward',
    };
  }

  // Execute burn and update reward atomically
  await prisma.$transaction(async (tx) => {
    // 1. Create burn transaction
    await tx.mystTransaction.create({
      data: {
        userId,
        type: 'burn_for_reward',
        amount: -burnAmount,
        meta: {
          rewardId,
          weekId: reward.weekId,
          category: reward.category,
          requiredMyst,
        },
      },
    });

    // 2. Update reward status
    await tx.leaderboardReward.update({
      where: { id: rewardId },
      data: {
        burnedMyst: { increment: burnAmount },
        status: 'ready_for_payout',
        tonWallet: tonWallet || reward.tonWallet,
      },
    });

    // 3. Update user's TON wallet if provided
    if (tonWallet) {
      await tx.user.update({
        where: { id: userId },
        data: { tonWallet },
      });
    }
  });

  return {
    success: true,
    burnedAmount: burnAmount,
  };
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

