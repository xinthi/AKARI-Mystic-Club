/**
 * MYST Token Service
 * 
 * Core economic logic for the AKARI Mystic Club token system.
 * 
 * Economic Constants:
 * - 1 USD = 50 MYST (MYST_PER_USD)
 * - 1 MYST = 0.02 USD (USD_PER_MYST)
 * - TON price: fetched live from Binance via getTonPriceUsd()
 * 
 * MYST Emission Sources (ONLY these):
 * 1. TON deposits (external watcher credits MYST)
 * 2. Admin grants via /admin/myst
 * 3. Onboarding bonus: 5 MYST once per user (until 2026-01-01)
 * 4. Referral milestone: 10 MYST when 5 referrals reached (until 2026-01-01)
 * 
 * Spending Splits (when user spends S MYST):
 * - 15% → Leaderboard pool
 * - 10% → Referral pool (funds L1/L2 rewards)
 * - 5%  → Wheel pool
 * - 70% → Platform treasury
 * 
 * Referral Rewards (from 10% referral pool):
 * - Level 1 (direct referrer): 8% of spend
 * - Level 2 (indirect referrer): 2% of spend
 */

import { PrismaClient } from '@prisma/client';
import { getTonPriceUsd } from './ton-price';

// ============================================
// ECONOMIC CONSTANTS
// ============================================

/** 1 USD = 50 MYST (fixed rate) */
export const MYST_PER_USD = 50;

/** 1 MYST = 0.02 USD (fixed rate) */
export const USD_PER_MYST = 1 / MYST_PER_USD;

/**
 * Get MYST per TON using live TON price.
 * Since 1 USD = 50 MYST, if TON = $5.00 then 1 TON = 250 MYST.
 */
export async function getMystPerTon(): Promise<number> {
  const tonPriceUsd = await getTonPriceUsd();
  return MYST_PER_USD * tonPriceUsd;
}

// Re-export getTonPriceUsd for convenience
export { getTonPriceUsd };

/**
 * Time limit for promotional MYST minting (onboarding + referral milestone).
 * After this date, no new promotional MYST will be minted.
 */
export const MYST_TIME_LIMIT = new Date('2026-01-01T00:00:00Z');

export const MYST_CONFIG = {
  // USD/MYST conversions
  MYST_PER_USD,
  USD_PER_MYST,
  
  // Prediction market fee rate
  DEFAULT_FEE_RATE: 0.08, // 8%
  
  // Minimum bet amount in MYST
  MINIMUM_BET: 2,
  
  // Spending splits (must sum to 1.0)
  SPLIT_LEADERBOARD: 0.15,  // 15% to leaderboard pool
  SPLIT_REFERRAL: 0.10,     // 10% to referral pool
  SPLIT_WHEEL: 0.05,        // 5% to wheel pool
  SPLIT_TREASURY: 0.70,     // 70% to platform treasury
  
  // Referral reward rates (from the 10% referral pool)
  REFERRAL_LEVEL_1_RATE: 0.08, // 8% of spend to L1
  REFERRAL_LEVEL_2_RATE: 0.02, // 2% of spend to L2
  
  // Promotional amounts (time-limited until MYST_TIME_LIMIT)
  ONBOARDING_BONUS_AMOUNT: 5,
  REFERRAL_MILESTONE_AMOUNT: 10,
  REFERRAL_MILESTONE_THRESHOLD: 5,
  
  // Withdrawal settings
  WITHDRAWAL_FEE_RATE: 0.02,  // 2% fee
  WITHDRAWAL_MIN_USD: 50,     // Minimum $50 net withdrawal
  
  // Wheel of Fortune settings
  WHEEL_SPINS_PER_DAY: 2,
} as const;

// ============================================
// WHEEL PRIZES CONFIGURATION
// ============================================

export interface WheelPrize {
  type: 'myst' | 'axp';
  label: string;
  myst: number;
  axp: number;
  weight: number;
}

// More aXP prizes (5), fewer MYST prizes (3) to control token distribution
export const WHEEL_PRIZES: WheelPrize[] = [
  { type: 'axp',  label: 'aXP +5',    myst: 0,    axp: 5,  weight: 22 },   // Common
  { type: 'myst', label: '0.1 MYST',  myst: 0.1,  axp: 0,  weight: 15 },   // MYST
  { type: 'axp',  label: 'aXP +10',   myst: 0,    axp: 10, weight: 18 },   // Uncommon
  { type: 'myst', label: '0.5 MYST',  myst: 0.5,  axp: 0,  weight: 10 },   // MYST
  { type: 'axp',  label: 'aXP +15',   myst: 0,    axp: 15, weight: 14 },   // Uncommon
  { type: 'axp',  label: 'aXP +20',   myst: 0,    axp: 20, weight: 10 },   // Rare
  { type: 'axp',  label: 'aXP +25',   myst: 0,    axp: 25, weight: 6 },    // Rare
  { type: 'myst', label: '1 MYST',    myst: 1,    axp: 0,  weight: 5 },    // MYST Jackpot
];

// ============================================
// POOL IDS
// ============================================

export const POOL_IDS = {
  LEADERBOARD: 'leaderboard',
  REFERRAL: 'referral',
  WHEEL: 'wheel',
  TREASURY: 'treasury',
} as const;

// ============================================
// TRANSACTION TYPES
// ============================================

export type MystTransactionType = 
  // Credits
  | 'ton_deposit'           // TON → MYST conversion
  | 'admin_grant'           // Admin-granted MYST
  | 'onboarding_bonus'      // New user bonus (time-limited)
  | 'referral_milestone'    // 5-referral bonus (time-limited)
  | 'wheel_prize'           // Wheel of Fortune win
  | 'prediction_win'        // Winning from prediction
  | 'referral_reward_l1'    // Referral reward level 1
  | 'referral_reward_l2'    // Referral reward level 2
  // Debits (spending)
  | 'spend_bet'             // Betting on prediction
  | 'spend_boost'           // Boost purchase
  | 'spend_campaign'        // Campaign entry fee
  // Pool allocations (internal)
  | 'pool_leaderboard'      // Split to leaderboard pool
  | 'pool_referral'         // Split to referral pool
  | 'pool_wheel'            // Split to wheel pool
  | 'pool_treasury'         // Split to treasury
  // Withdrawals
  | 'withdraw_request'      // User withdrawal request
  | 'withdraw_fee'          // Fee retained on withdrawal
  | 'withdraw_burn';        // Amount burned on withdrawal

// ============================================
// BALANCE FUNCTIONS
// ============================================

/**
 * Get user's current MYST balance from transaction ledger.
 * Balance = SUM(amount) for all transactions.
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
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.warn('[MystService] getMystBalance failed:', message);
    return 0;
  }
}

/**
 * Get a pool's balance from PoolBalance table.
 */
export async function getPoolBalance(
  prisma: PrismaClient,
  poolId: string
): Promise<number> {
  try {
    const pool = await prisma.poolBalance.findUnique({
      where: { id: poolId },
    });
    return pool?.balance ?? 0;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.warn(`[MystService] getPoolBalance(${poolId}) failed:`, message);
    return 0;
  }
}

/**
 * Update a pool's balance (add or subtract).
 */
export async function updatePoolBalance(
  prisma: PrismaClient,
  poolId: string,
  delta: number
): Promise<void> {
  try {
    await prisma.poolBalance.upsert({
      where: { id: poolId },
      update: { balance: { increment: delta } },
      create: { id: poolId, balance: Math.max(0, delta) },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[MystService] updatePoolBalance(${poolId}) failed:`, message);
  }
}

// ============================================
// ONBOARDING BONUS (Time-Limited)
// ============================================

/**
 * Grant onboarding MYST bonus to new users.
 * - 5 MYST bonus for new users
 * - Only available until 2026-01-01
 * - One-time per user
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
    return { granted: false, reason: 'after-cutoff' };
  }

  try {
    const existing = await prisma.mystTransaction.findFirst({
      where: { userId, type: 'onboarding_bonus' },
    });

    if (existing) {
      return { granted: false, reason: 'already-granted' };
    }

    await creditMyst(
      prisma,
      userId,
      MYST_CONFIG.ONBOARDING_BONUS_AMOUNT,
      'onboarding_bonus',
      { source: 'onboarding', grantedAt: now.toISOString() }
    );

    console.log(`[MystService] Granted ${MYST_CONFIG.ONBOARDING_BONUS_AMOUNT} MYST onboarding bonus to user ${userId}`);
    return { granted: true, reason: 'granted', amount: MYST_CONFIG.ONBOARDING_BONUS_AMOUNT };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[MystService] grantOnboardingMystIfEligible failed:', message);
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
  if (now >= MYST_TIME_LIMIT) {
    return { granted: false, reason: 'milestone_expired' };
  }

  try {
    const existingMilestone = await prisma.mystTransaction.findFirst({
      where: { userId, type: 'referral_milestone' },
    });

    if (existingMilestone) {
      return { granted: false, reason: 'already-granted' };
    }

    const referralCount = await prisma.user.count({
      where: { referrerId: userId },
    });

    if (referralCount < MYST_CONFIG.REFERRAL_MILESTONE_THRESHOLD) {
      return { granted: false, reason: 'not-enough-referrals' };
    }

    await creditMyst(
      prisma,
      userId,
      MYST_CONFIG.REFERRAL_MILESTONE_AMOUNT,
      'referral_milestone',
      { source: 'referral_milestone', referralCount, grantedAt: now.toISOString() }
    );

    console.log(`[MystService] Granted ${MYST_CONFIG.REFERRAL_MILESTONE_AMOUNT} MYST referral milestone to user ${userId}`);
    return { granted: true, reason: 'granted', amount: MYST_CONFIG.REFERRAL_MILESTONE_AMOUNT };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[MystService] checkAndGrantReferralMilestone failed:', message);
    return { granted: false, reason: 'error' };
  }
}

// ============================================
// CREDIT FUNCTIONS
// ============================================

/**
 * Credit MYST to a user's account.
 */
export async function creditMyst(
  prisma: PrismaClient,
  userId: string,
  amount: number,
  type: string,
  meta?: Record<string, unknown>
): Promise<{ credited: number; newBalance: number }> {
  if (!userId) throw new Error('userId is required');
  if (amount <= 0) throw new Error('Credit amount must be positive');

  // Cast meta to unknown to satisfy Prisma's InputJsonValue type
  const metaValue = meta ? JSON.parse(JSON.stringify(meta)) : undefined;

  await prisma.mystTransaction.create({
    data: {
      userId,
      type,
      amount,
      meta: metaValue,
    },
  });

  const newBalance = await getMystBalance(prisma, userId);
  return { credited: amount, newBalance };
}

// ============================================
// SPENDING FUNCTIONS WITH POOL SPLITS
// ============================================

export type SpendType = 'spend_bet' | 'spend_boost' | 'spend_campaign';

interface SpendResult {
  spent: number;
  splits: {
    leaderboard: number;
    referral: number;
    wheel: number;
    treasury: number;
  };
  referralRewards: {
    level1UserId: string | null;
    level1Amount: number;
    level2UserId: string | null;
    level2Amount: number;
  };
}

/**
 * Spend MYST with proper pool splits and referral rewards.
 * 
 * Given spend amount S:
 * - 15% → Leaderboard pool
 * - 10% → Referral pool (funds L1 8% + L2 2%)
 * - 5%  → Wheel pool
 * - 70% → Platform treasury
 * 
 * Referral rewards come from the 10% referral split:
 * - L1 gets 8% of S
 * - L2 gets 2% of S
 * - If no referrer, that portion goes to treasury
 */
export async function spendMyst(
  prisma: PrismaClient,
  userId: string,
  amount: number,
  spendType: SpendType,
  referenceId?: string
): Promise<SpendResult> {
  if (amount <= 0) throw new Error('Spend amount must be positive');

  // Check balance
  const balance = await getMystBalance(prisma, userId);
  if (balance < amount) {
    throw new Error(`Insufficient MYST balance. Have: ${balance.toFixed(2)}, Need: ${amount.toFixed(2)}`);
  }

  // Get user with referrer info
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      referrer: {
        include: { referrer: true },
      },
    },
  });

  if (!user) throw new Error('User not found');

  // Calculate pool splits
  const leaderboardSplit = amount * MYST_CONFIG.SPLIT_LEADERBOARD;
  const referralPoolSplit = amount * MYST_CONFIG.SPLIT_REFERRAL;
  const wheelSplit = amount * MYST_CONFIG.SPLIT_WHEEL;
  const treasurySplit = amount * MYST_CONFIG.SPLIT_TREASURY;

  // Calculate referral rewards (from the referral pool split)
  let level1UserId: string | null = null;
  let level1Amount = 0;
  let level2UserId: string | null = null;
  let level2Amount = 0;
  let unusedReferralToTreasury = referralPoolSplit;

  if (user.referrer) {
    level1UserId = user.referrer.id;
    level1Amount = amount * MYST_CONFIG.REFERRAL_LEVEL_1_RATE;
    unusedReferralToTreasury -= level1Amount;

    if (user.referrer.referrer) {
      level2UserId = user.referrer.referrer.id;
      level2Amount = amount * MYST_CONFIG.REFERRAL_LEVEL_2_RATE;
      unusedReferralToTreasury -= level2Amount;
    }
  }

  // Execute all in transaction
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

    // 2. Credit referral rewards
    if (level1UserId && level1Amount > 0) {
      await tx.mystTransaction.create({
        data: {
          userId: level1UserId,
          type: 'referral_reward_l1',
          amount: level1Amount,
          meta: { fromUserId: userId, originalSpend: amount, spendType, referenceId },
        },
      });
    }

    if (level2UserId && level2Amount > 0) {
      await tx.mystTransaction.create({
        data: {
          userId: level2UserId,
          type: 'referral_reward_l2',
          amount: level2Amount,
          meta: { fromUserId: userId, originalSpend: amount, spendType, referenceId },
        },
      });
    }

    // 3. Record referral event
    await tx.referralEvent.create({
      data: {
        userId,
        referrerLevel1Id: level1UserId,
        rewardLevel1: level1Amount,
        referrerLevel2Id: level2UserId,
        rewardLevel2: level2Amount,
        mystSpent: amount,
        spendType,
        referenceId,
      },
    });

    // 4. Update pool balances
    await tx.poolBalance.upsert({
      where: { id: POOL_IDS.LEADERBOARD },
      update: { balance: { increment: leaderboardSplit } },
      create: { id: POOL_IDS.LEADERBOARD, balance: leaderboardSplit },
    });

    await tx.poolBalance.upsert({
      where: { id: POOL_IDS.WHEEL },
      update: { balance: { increment: wheelSplit } },
      create: { id: POOL_IDS.WHEEL, balance: wheelSplit },
    });

    // Also update the legacy WheelPool for backwards compatibility
    await tx.wheelPool.upsert({
      where: { id: 'main_pool' },
      update: { balance: { increment: wheelSplit } },
      create: { id: 'main_pool', balance: wheelSplit },
    });

    // Treasury gets its split plus any unused referral portion
    const totalTreasury = treasurySplit + unusedReferralToTreasury;
    await tx.poolBalance.upsert({
      where: { id: POOL_IDS.TREASURY },
      update: { balance: { increment: totalTreasury } },
      create: { id: POOL_IDS.TREASURY, balance: totalTreasury },
    });
  });

  return {
    spent: amount,
    splits: {
      leaderboard: leaderboardSplit,
      referral: referralPoolSplit,
      wheel: wheelSplit,
      treasury: treasurySplit,
    },
    referralRewards: {
      level1UserId,
      level1Amount,
      level2UserId,
      level2Amount,
    },
  };
}

// ============================================
// WHEEL OF FORTUNE FUNCTIONS
// ============================================

/**
 * Get wheel pool balance (from both WheelPool and PoolBalance).
 */
export async function getWheelPoolBalance(prisma: PrismaClient): Promise<number> {
  try {
    // Try new PoolBalance first
    const poolBalance = await prisma.poolBalance.findUnique({
      where: { id: POOL_IDS.WHEEL },
    });
    if (poolBalance) return poolBalance.balance;

    // Fallback to legacy WheelPool
    const wheelPool = await prisma.wheelPool.findUnique({
      where: { id: 'main_pool' },
    });
    return wheelPool?.balance ?? 0;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.warn('[MystService] getWheelPoolBalance failed:', message);
    return 0;
  }
}

/**
 * Count user's spins today (UTC).
 */
export async function getUserSpinsToday(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  const count = await prisma.wheelSpin.count({
    where: {
      userId,
      createdAt: { gte: dayStart },
    },
  });
  
  return count;
}

/**
 * Select a random prize using weighted selection.
 * If MYST prize exceeds pool balance, downgrade to aXP.
 */
export function selectWheelPrize(poolBalance: number): WheelPrize {
  const totalWeight = WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const prize of WHEEL_PRIZES) {
    random -= prize.weight;
    if (random <= 0) {
      // If MYST prize but pool insufficient, convert to aXP
      if (prize.type === 'myst' && prize.myst > poolBalance) {
        // Return a fallback aXP prize
        return { type: 'axp', label: 'aXP +5', myst: 0, axp: 5, weight: 0 };
      }
      return prize;
    }
  }
  
  // Fallback
  return WHEEL_PRIZES[0];
}

// ============================================
// PREDICTION MARKET FUNCTIONS
// ============================================

/**
 * Calculate payout for winning bets in a prediction market.
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
  
  if (winningSideTotal <= 0) return { payout: 0, fee };
  
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
      type: 'prediction_win',
      amount: payout,
      meta: { predictionId },
    },
  });
}

// ============================================
// WITHDRAWAL FUNCTIONS
// ============================================

interface WithdrawalResult {
  success: boolean;
  withdrawalId?: string;
  mystFee?: number;
  mystBurn?: number;
  usdNet?: number;
  tonAmount?: number;
  error?: string;
}

/**
 * Create a withdrawal request (Model A - manual payout).
 */
export async function createWithdrawalRequest(
  prisma: PrismaClient,
  userId: string,
  amountMyst: number
): Promise<WithdrawalResult> {
  if (amountMyst <= 0) {
    return { success: false, error: 'Amount must be positive' };
  }

  // Get user with TON address
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tonAddress: true },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (!user.tonAddress) {
    return { success: false, error: 'TON wallet not linked' };
  }

  // Check balance
  const balance = await getMystBalance(prisma, userId);
  if (balance < amountMyst) {
    return { success: false, error: `Insufficient balance. Have: ${balance.toFixed(2)}, Need: ${amountMyst.toFixed(2)}` };
  }

  // Calculate amounts
  const feeMyst = amountMyst * MYST_CONFIG.WITHDRAWAL_FEE_RATE;
  const burnMyst = amountMyst - feeMyst;
  const netUsd = burnMyst * USD_PER_MYST;

  // Enforce minimum
  if (netUsd < MYST_CONFIG.WITHDRAWAL_MIN_USD) {
    return { 
      success: false, 
      error: `Minimum withdrawal is $${MYST_CONFIG.WITHDRAWAL_MIN_USD}. Your net: $${netUsd.toFixed(2)}` 
    };
  }

  const tonPriceUsd = await getTonPriceUsd();
  const tonAmount = netUsd / tonPriceUsd;

  // Create withdrawal in transaction
  const withdrawal = await prisma.$transaction(async (tx) => {
    // Debit user
    await tx.mystTransaction.create({
      data: {
        userId,
        type: 'withdraw_request',
        amount: -amountMyst,
        meta: { purpose: 'withdrawal' },
      },
    });

    // Credit fee to treasury
    await tx.poolBalance.upsert({
      where: { id: POOL_IDS.TREASURY },
      update: { balance: { increment: feeMyst } },
      create: { id: POOL_IDS.TREASURY, balance: feeMyst },
    });

    // Create withdrawal request
    const req = await tx.withdrawalRequest.create({
      data: {
        userId,
        tonAddress: user.tonAddress!,
        mystRequested: amountMyst,
        mystFee: feeMyst,
        mystBurn: burnMyst,
        usdNet: netUsd,
        tonAmount,
        tonPriceUsd,
        status: 'pending',
      },
    });

    return req;
  });

  console.log(`[MystService] Withdrawal request created: ${withdrawal.id}, ${amountMyst} MYST → ${tonAmount.toFixed(4)} TON`);

  return {
    success: true,
    withdrawalId: withdrawal.id,
    mystFee: feeMyst,
    mystBurn: burnMyst,
    usdNet: netUsd,
    tonAmount,
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

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referrerId: true },
  });

  if (user?.referrerId) {
    return { success: false, error: 'Already have a referrer' };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { referrerId: referrer.id },
  });

  // Check and grant referral milestone if applicable
  await checkAndGrantReferralMilestone(prisma, referrer.id);

  return { success: true, referrerUsername: referrer.username ?? undefined };
}

// ============================================
// STARS TO MYST CONVERSION
// ============================================

/** Stars to MYST conversion rate: 100 Stars = 1 MYST */
export const STARS_PER_MYST = 100;

/**
 * Convert Telegram Stars to MYST.
 * Rate: 100 Stars = 1 MYST
 * 
 * Note: This should only be called after verifying Stars payment.
 */
export async function convertStarsToMyst(
  prisma: PrismaClient,
  userId: string,
  starsAmount: number
): Promise<{ mystReceived: number; newBalance: number }> {
  if (starsAmount <= 0) throw new Error('Stars amount must be positive');

  const mystReceived = starsAmount / STARS_PER_MYST;

  await prisma.mystTransaction.create({
    data: {
      userId,
      type: 'stars_conversion',
      amount: mystReceived,
      meta: JSON.parse(JSON.stringify({ starsAmount, rate: STARS_PER_MYST })),
    },
  });

  const newBalance = await getMystBalance(prisma, userId);
  return { mystReceived, newBalance };
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
      type: { in: ['spend_bet', 'spend_boost', 'spend_campaign'] },
      amount: { lt: 0 },
      createdAt: { gte: startTime, lte: endTime },
    },
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'asc' } },
    take: limit,
  });

  return result.map((r) => ({
    userId: r.userId,
    totalSpent: Math.abs(r._sum.amount ?? 0),
  }));
}

/**
 * Get top referrers by referral rewards earned in a time period.
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
      type: { in: ['referral_reward_l1', 'referral_reward_l2'] },
      amount: { gt: 0 },
      createdAt: { gte: startTime, lte: endTime },
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
