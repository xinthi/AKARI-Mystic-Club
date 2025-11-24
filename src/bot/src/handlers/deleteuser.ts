// @ts-nocheck - This file is not type-checked by Next.js
import { Context } from 'grammy';
import { prisma } from '../utils/prisma.js';

/**
 * GDPR: Delete user data
 */
export async function deleteUserHandler(ctx: Context) {
  const telegramId = BigInt(ctx.from!.id);

  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  // Confirm deletion
  await ctx.reply(
    '⚠️ *Delete Account*\n\n' +
    'This will permanently delete all your data:\n' +
    '- Profile information\n' +
    '- Points and tier\n' +
    '- Reviews\n' +
    '- Campaigns\n' +
    '- Predictions\n' +
    '- Surveys\n\n' +
    'This action cannot be undone.\n\n' +
    'Type "DELETE" to confirm.',
    { parse_mode: 'Markdown' }
  );

  // Wait for confirmation (simplified - in production, use conversation)
  // For now, just delete on command
}

/**
 * Confirm and delete user
 */
export async function confirmDeleteUser(ctx: Context) {
  const telegramId = BigInt(ctx.from!.id);
  const text = ctx.message?.text;

  if (text?.toUpperCase() !== 'DELETE') {
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      await ctx.reply('User not found.');
      return;
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: user.id }
    });

    await ctx.reply('✅ Your account and all data have been deleted.');
  } catch (error) {
    console.error('Error deleting user:', error);
    await ctx.reply('❌ Error deleting account. Please contact support.');
  }
}

