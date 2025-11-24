import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../utils/prisma.js';
import { verifyTelegramJoin, completeVerification } from '../utils/verifications.js';
import { Bot } from 'grammy';

/**
 * Tasks command handler - List active campaigns
 */
export async function tasksHandler(ctx: Context, bot: Bot) {
  const telegramId = BigInt(ctx.from!.id);

  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) {
    await ctx.reply('User not found. Please use /start first.');
    return;
  }

  const campaigns = await prisma.campaign.findMany({
    where: {
      isActive: true,
      endsAt: { gte: new Date() }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  if (campaigns.length === 0) {
    await ctx.reply('No active campaigns at the moment. Check back later!');
    return;
  }

  const vercelUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  const keyboard = new InlineKeyboard()
    .webApp('View All Tasks 📋', `${vercelUrl}/tasks?userId=${user.id}`);

  let message = '📋 *Active Campaigns*\n\n';
  for (const campaign of campaigns) {
    const tasks = (campaign.tasks as any[]) || [];
    message += `*${campaign.name}*\n`;
    message += `${campaign.description || ''}\n`;
    message += `Tasks: ${tasks.length}\n`;
    message += `Ends: ${campaign.endsAt.toLocaleDateString()}\n\n`;
  }

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Verify task completion
 */
export async function verifyTaskHandler(ctx: Context, bot: Bot, taskId: string, taskType: string, taskData: any) {
  const telegramId = BigInt(ctx.from!.id);

  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  let verified = false;

  switch (taskType) {
    case 'telegram_join':
      verified = await verifyTelegramJoin(bot, user.id, taskData.chatId);
      break;
    case 'x_follow':
      // X verification handled separately
      verified = false; // Placeholder
      break;
    case 'x_like':
    case 'x_repost':
      // X verification handled separately
      verified = false; // Placeholder
      break;
    default:
      await ctx.reply('Unknown task type.');
      return;
  }

  if (verified) {
    const completed = await completeVerification(user.id, taskId, taskType);
    if (completed) {
      await ctx.reply('✅ Task verified! You earned 0.2 EP.');
    } else {
      await ctx.reply('⚠️ Task already completed.');
    }
  } else {
    await ctx.reply('❌ Verification failed. Please complete the task first.');
  }
}

