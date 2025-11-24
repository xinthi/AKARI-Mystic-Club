import { prisma } from './prisma.js';
import { updateTier } from './tiers.js';

/**
 * Handle successful Stars payment
 * Awards points (1 per $1 spent = 1 per 100 Stars)
 * Logs 5% fee
 * @param userId - User ID
 * @param amount - Stars amount (in Stars, not dollars)
 * @param purpose - Payment purpose (campaign, bet, etc.)
 * @returns Updated user points
 */
export async function handleStarsPayment(
  userId: string,
  amount: number,
  purpose: 'campaign' | 'bet' | 'subscription'
): Promise<number> {
  // Calculate points: 1 point per $1 = 1 point per 100 Stars
  const pointsToAward = Math.floor(amount / 100);
  
  // Calculate fee: 5% of amount
  const fee = Math.floor(amount * 0.05);
  
  // Update user points
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      points: {
        increment: pointsToAward
      }
    }
  });
  
  // Update tier
  await updateTier(userId, user.points);
  
  // Log fee (in a real app, you might want a separate PaymentLog model)
  console.log(`[Stars Payment] User ${userId}: ${amount} Stars, Fee: ${fee} Stars, Points: +${pointsToAward}, Purpose: ${purpose}`);
  
  return user.points;
}

/**
 * Award points for task completion
 * @param userId - User ID
 * @param points - Points to award (default 0.2)
 * @returns Updated user points
 */
export async function awardPoints(userId: string, points: number = 0.2): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      points: {
        increment: points
      }
    }
  });
  
  // Update tier
  await updateTier(userId, user.points);
  
  return user.points;
}

