import { Context } from 'grammy';
import { prisma } from '../utils/prisma.js';

/**
 * Review command handler: /review @username 1-5 [comment]
 */
export async function reviewHandler(ctx: Context) {
  const text = ctx.message?.text;
  if (!text) return;

  const match = text.match(/^\/review\s+@?(\w+)\s+([1-5])\s*(.*)$/);
  if (!match) {
    await ctx.reply('Usage: /review @username 1-5 [comment]\nExample: /review @john 5 Great work!');
    return;
  }

  const [, targetUsername, ratingStr, comment] = match;
  const rating = parseInt(ratingStr, 10);
  const fromTelegramId = BigInt(ctx.from!.id);

  // Get users
  const fromUser = await prisma.user.findUnique({
    where: { telegramId: fromTelegramId }
  });

  const toUser = await prisma.user.findFirst({
    where: { username: targetUsername }
  });

  if (!fromUser || !toUser) {
    await ctx.reply('User not found.');
    return;
  }

  if (fromUser.id === toUser.id) {
    await ctx.reply('You cannot review yourself.');
    return;
  }

  // Check if review already exists
  const existingReview = await prisma.review.findUnique({
    where: {
      fromUserId_toUserId: {
        fromUserId: fromUser.id,
        toUserId: toUser.id
      }
    }
  });

  if (existingReview) {
    // Update existing review
    await prisma.review.update({
      where: { id: existingReview.id },
      data: {
        rating,
        comment: comment || null
      }
    });
  } else {
    // Create new review
    await prisma.review.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        rating,
        comment: comment || null
      }
    });
  }

  // Recalculate credibility score
  const reviews = await prisma.review.findMany({
    where: { toUserId: toUser.id }
  });

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  const credibilityScore = avgRating * 2; // Scale 1-5 to 1-10
  const positiveReviews = reviews.filter(r => r.rating >= 4).length;

  await prisma.user.update({
    where: { id: toUser.id },
    data: {
      credibilityScore,
      positiveReviews
    }
  });

  await ctx.reply(`✅ Review submitted! ${toUser.username} now has ${positiveReviews} positive reviews.`);
}

