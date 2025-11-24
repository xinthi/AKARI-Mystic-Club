// @ts-nocheck - This file is not type-checked by Next.js
import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../utils/prisma.js';

/**
 * New survey command (founder only)
 */
export async function newSurveyHandler(ctx: Context) {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user || !user.isVerifiedFounder) {
    await ctx.reply('❌ Only verified founders can create surveys.');
    return;
  }

  // Check if user has a campaign with projectTgHandle
  const campaigns = await prisma.campaign.findMany({
    where: {
      createdById: user.id,
      projectTgHandle: { not: null }
    }
  });

  if (campaigns.length === 0) {
    await ctx.reply('❌ You need to create a campaign with a project Telegram handle first.');
    return;
  }

  await ctx.reply('Use /createsurvey command. Format:\n/createsurvey Title | Description | CampaignID | QuestionsJSON');
}

/**
 * Share survey
 */
export async function shareSurveyHandler(ctx: Context, surveyId: string) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      createdBy: true
    }
  });

  if (!survey || !survey.active) {
    await ctx.reply('Survey not found or inactive.');
    return;
  }

  const vercelUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  const keyboard = new InlineKeyboard()
    .webApp('Take Survey 📝', `${vercelUrl}/survey/${surveyId}`);

  await ctx.reply(
    `📝 *${survey.title}*\n\n` +
    `${survey.description || ''}\n\n` +
    `Tap below to take the survey:`,
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
}

