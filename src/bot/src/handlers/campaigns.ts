// @ts-nocheck - This file is not type-checked by Next.js
import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../utils/prisma.js';
import { handleStarsPayment } from '../utils/stars.js';
import { Bot } from 'grammy';

type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

/**
 * New campaign command (founder only)
 */
export async function newCampaignHandler(ctx: MyContext) {
  const telegramId = BigInt(ctx.from!.id);

  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) {
    await ctx.reply('User not found. Please use /start first.');
    return;
  }

  // Check if verified founder with active subscription
  if (!user.isVerifiedFounder || !user.founderSubscriptionEnd || user.founderSubscriptionEnd < new Date()) {
    await ctx.reply('❌ Only verified founders with active subscriptions can create campaigns.');
    return;
  }

  await ctx.reply('Let\'s create a new campaign! Starting conversation...');
  await ctx.conversation.enter('createCampaign');
}

/**
 * Create campaign conversation
 */
export async function createCampaignConversation(conversation: MyConversation, ctx: MyContext) {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) return;

  // Step 1: Name
  await ctx.reply('Enter campaign name:');
  const nameCtx = await conversation.waitFor('message:text');
  const name = nameCtx.message.text;

  // Step 2: Description
  await ctx.reply('Enter campaign description:');
  const descCtx = await conversation.waitFor('message:text');
  const description = descCtx.message.text;

  // Step 3: Rewards
  await ctx.reply('Enter rewards description:');
  const rewardsCtx = await conversation.waitFor('message:text');
  const rewards = rewardsCtx.message.text;

  // Step 4: Dates
  await ctx.reply('Enter start date (YYYY-MM-DD):');
  const startCtx = await conversation.waitFor('message:text');
  const startsAt = new Date(startCtx.message.text);

  await ctx.reply('Enter end date (YYYY-MM-DD):');
  const endCtx = await conversation.waitFor('message:text');
  const endsAt = new Date(endCtx.message.text);

  // Step 5: Tasks (simplified - in production, use menu)
  await ctx.reply('Enter tasks as JSON array (or type "skip" to add later):');
  const tasksCtx = await conversation.waitFor('message:text');
  let tasks: any[] = [];
  if (tasksCtx.message.text.toLowerCase() !== 'skip') {
    try {
      tasks = JSON.parse(tasksCtx.message.text);
    } catch {
      tasks = [];
    }
  }

  // Step 6: Project Telegram handle
  await ctx.reply('Enter project Telegram handle (for surveys, or "skip"):');
  const handleCtx = await conversation.waitFor('message:text');
  const projectTgHandle = handleCtx.message.text.toLowerCase() === 'skip' ? null : handleCtx.message.text;

  // Step 7: Payment
  const keyboard = new InlineKeyboard()
    .text('$100 one-time (100 Stars)', 'pay_100')
    .row()
    .text('$20/year (200 Stars)', 'pay_200');

  await ctx.reply('Choose payment option:', { reply_markup: keyboard });

  const payCtx = await conversation.waitForCallbackQuery(/^pay_/);
  const amount = payCtx.callbackQuery.data === 'pay_100' ? 100 : 200;

  // Send invoice for Stars payment
  if (!payCtx.chat) return;
  await payCtx.api.sendInvoice(
    payCtx.chat.id,
    `Campaign: ${name}`,
    description || '',
    `campaign_${user.id}`,
    process.env.PAYMENT_PROVIDER_TOKEN || '',
    [{ label: 'Campaign Fee', amount: amount * 100 }], // Amount in smallest currency unit (cents for XTR)
    'XTR'
  );

  // Wait for payment (handled by stars handler)
  // For now, create campaign after payment confirmation
  // In production, use webhook or payment handler

  await payCtx.answerCallbackQuery();
}

/**
 * Handle successful campaign payment
 */
export async function handleCampaignPayment(
  userId: string,
  amount: number,
  campaignData: {
    name: string;
    description: string;
    rewards: string;
    tasks: any[];
    startsAt: Date;
    endsAt: Date;
    projectTgHandle?: string;
  }
) {
  // Award points
  await handleStarsPayment(userId, amount, 'campaign');

  // Calculate fee
  const fee = Math.floor(amount * 0.05);

  // Create campaign
  const campaign = await prisma.campaign.create({
    data: {
      ...campaignData,
      createdById: userId,
      starsFee: amount,
      projectTgHandle: campaignData.projectTgHandle || undefined
    }
  });

  return campaign;
}

