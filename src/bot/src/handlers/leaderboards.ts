// @ts-nocheck - This file is not type-checked by Next.js
import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../utils/prisma.js';
import { computeCampaignLeaderboard, getOverallLeaderboard } from '../utils/leaderboard.js';

/**
 * Leaderboard command
 */
export async function leaderboardHandler(ctx: Context, campaignId?: string) {
  if (campaignId) {
    // Campaign leaderboard
    const leaderboard = await computeCampaignLeaderboard(campaignId);
    
    if (!leaderboard || leaderboard.length === 0) {
      await ctx.reply('No leaderboard data available for this campaign.');
      return;
    }

    let message = '🏆 *Campaign Leaderboard*\n\n';
    message += 'Rank | Username | Completions | EP | Cred\n';
    message += '─'.repeat(50) + '\n';

    for (const entry of leaderboard) {
      message += `${entry.rank} | @${entry.username} | ${entry.completions} | ${entry.points.toFixed(1)} | ${entry.cred.toFixed(1)}\n`;
    }

    await ctx.reply(message, { parse_mode: 'Markdown' });
  } else {
    // Overall leaderboard - show tier menu
    const keyboard = new InlineKeyboard()
      .text('Seeker 🧭', 'leaderboard_Seeker')
      .text('Alchemist 🔥', 'leaderboard_Alchemist')
      .row()
      .text('Sentinel 🛡️', 'leaderboard_Sentinel')
      .text('Merchant 💰', 'leaderboard_Merchant')
      .row()
      .text('Guardian ⚔️', 'leaderboard_Guardian')
      .text('Sovereign 👑', 'leaderboard_Sovereign')
      .row()
      .text('All Tiers', 'leaderboard_all');

    await ctx.reply('Select tier for leaderboard:', { reply_markup: keyboard });
  }
}

/**
 * Handle leaderboard tier selection
 */
export async function leaderboardTierHandler(ctx: Context, tier: string) {
  const tierPattern = tier === 'all' ? null : tier;
  const leaderboard = await getOverallLeaderboard(tierPattern);

  if (leaderboard.length === 0) {
    await ctx.reply('No users found in this tier.');
    return;
  }

  let message = `🏆 *Leaderboard${tier !== 'all' ? ` - ${tier}` : ''}*\n\n`;
  message += 'Rank | Username | EP | Tier | Cred\n';
  message += '─'.repeat(50) + '\n';

  for (const entry of leaderboard.slice(0, 20)) {
    message += `${entry.rank} | @${entry.username} | ${entry.points} | ${entry.tier} | ${entry.cred.toFixed(1)}\n`;
  }

  await ctx.reply(message, { parse_mode: 'Markdown' });
}

