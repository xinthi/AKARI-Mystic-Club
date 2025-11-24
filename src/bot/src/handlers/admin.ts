import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../utils/prisma.js';

const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

/**
 * Check if user is admin
 */
function isAdmin(telegramId: number): boolean {
  return ADMIN_ID ? telegramId.toString() === ADMIN_ID : false;
}

/**
 * Admin command handler
 */
export async function adminHandler(ctx: Context) {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Admin only.');
    return;
  }

  const keyboard = new InlineKeyboard()
    .text('Verify Founder', 'admin_verify_founder')
    .text('Broadcast', 'admin_broadcast')
    .row()
    .text('Poll', 'admin_poll')
    .text('Approve', 'admin_approve');

  await ctx.reply('🔧 *Admin Panel*', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Verify founder
 */
export async function verifyFounderHandler(ctx: Context, userId: string) {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Admin only.');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  // Set subscription end to 1 year from now
  const subscriptionEnd = new Date();
  subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);

  await prisma.user.update({
    where: { id: userId },
    data: {
      isVerifiedFounder: true,
      founderSubscriptionEnd: subscriptionEnd
    }
  });

  await ctx.reply(`✅ Verified founder: ${user.username || userId}\nSubscription until: ${subscriptionEnd.toLocaleDateString()}`);
}

/**
 * Broadcast message
 */
export async function broadcastHandler(ctx: Context, message: string) {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Admin only.');
    return;
  }

  const users = await prisma.user.findMany({
    select: { telegramId: true }
  });

  let success = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await ctx.api.sendMessage(Number(user.telegramId), message);
      success++;
    } catch (error) {
      failed++;
    }
  }

  await ctx.reply(`📢 Broadcast complete!\n✅ Success: ${success}\n❌ Failed: ${failed}`);
}

/**
 * Create poll
 */
export async function pollHandler(ctx: Context, question: string, options: string[]) {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Admin only.');
    return;
  }

  if (!ctx.chat) {
    await ctx.reply('❌ Cannot send poll: chat not found.');
    return;
  }

  await ctx.api.sendPoll(ctx.chat.id, question, options, {
    is_anonymous: false
  });
}

/**
 * Approve verification (for IG screenshots)
 */
export async function approveHandler(ctx: Context, messageId: number) {
  if (!isAdmin(ctx.from!.id)) {
    await ctx.reply('❌ Admin only.');
    return;
  }

  // In production, fetch the message and process approval
  await ctx.reply(`✅ Approved message ${messageId}`);
}

