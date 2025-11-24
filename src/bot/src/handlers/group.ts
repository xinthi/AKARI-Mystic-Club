import { Context } from 'grammy';
import { prisma } from '../utils/prisma.js';

/**
 * Handle new chat members
 */
export async function newChatMembersHandler(ctx: Context) {
  if (!ctx.message?.new_chat_members) return;

  for (const member of ctx.message.new_chat_members) {
    const telegramId = BigInt(member.id);
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (user) {
      const credBadge = user.positiveReviews >= 10 ? ' 🛡️' : '';
      await ctx.reply(
        `Welcome ${member.first_name}!${credBadge}\n` +
        `Credibility: ${user.credibilityScore?.toFixed(1) || 0}/10`
      );
    }
  }
}

/**
 * Credibility command - Show group credibility stats
 */
export async function credibilityHandler(ctx: Context) {
  if (!ctx.chat) return;

  // Get all users (simplified - in production, track group members)
  const allUsers = await prisma.user.findMany();
  const credibleUsers = allUsers.filter(u => u.positiveReviews >= 10);
  const total = allUsers.length;
  const credible = credibleUsers.length;
  const percentage = total > 0 ? ((credible / total) * 100).toFixed(1) : '0';

  await ctx.reply(
    `🛡️ *Group Credibility Stats*\n\n` +
    `Credible users: ${credible}/${total}\n` +
    `Elite percentage: ${percentage}%`,
    { parse_mode: 'Markdown' }
  );
}

