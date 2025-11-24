import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../utils/prisma.js';

/**
 * Profile command handler
 */
export async function profileHandler(ctx: Context) {
  const telegramId = BigInt(ctx.from!.id);

  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: {
      reviewsReceived: true
    }
  });

  if (!user) {
    await ctx.reply('User not found. Please use /start first.');
    return;
  }

  const vercelUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  const keyboard = new InlineKeyboard()
    .webApp('View Profile 👤', `${vercelUrl}/profile?userId=${user.id}`);

  const credBadge = user.positiveReviews >= 10 ? ' 🛡️' : '';
  const tierDisplay = user.tier || 'None';

  await ctx.reply(
    `👤 *Profile*\n\n` +
    `Points: ${user.points} EP\n` +
    `Tier: ${tierDisplay}${credBadge}\n` +
    `Credibility: ${user.credibilityScore?.toFixed(1) || 0}/10\n` +
    `Reviews: ${user.positiveReviews} positive\n\n` +
    `Tap below to view full profile:`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
}

