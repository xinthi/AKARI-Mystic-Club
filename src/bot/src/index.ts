import { Bot, Context, session, SessionFlavor } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { prisma } from './utils/prisma.js';
import { updateTier } from './utils/tiers.js';
import { startHandler, onboardingConversation, showMainMenu } from './handlers/start.js';
import { profileHandler } from './handlers/profile.js';
import { tasksHandler, verifyTaskHandler } from './handlers/tasks.js';
import { reviewHandler } from './handlers/review.js';
import { newCampaignHandler, handleCampaignPayment } from './handlers/campaigns.js';
import { predictionsHandler, betHandler, resolvePredictionHandler } from './handlers/predictions.js';
import { newSurveyHandler, shareSurveyHandler } from './handlers/surveys.js';
import { leaderboardHandler, leaderboardTierHandler } from './handlers/leaderboards.js';
import { newChatMembersHandler, credibilityHandler } from './handlers/group.js';
import { adminHandler, verifyFounderHandler, broadcastHandler, pollHandler, approveHandler } from './handlers/admin.js';
import { deleteUserHandler, confirmDeleteUser } from './handlers/deleteuser.js';
import { handleStarsPayment } from './utils/stars.js';

dotenv.config();

interface SessionData {
  // Add session data here if needed
}

type MyContext = Context & SessionFlavor<SessionData>;

// Initialize bot
const bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN!);

// Session middleware
bot.use(session({
  initial: (): SessionData => ({}),
}));

// Conversations middleware
bot.use(conversations());

// Register conversations
bot.use(createConversation(onboardingConversation, 'onboarding'));
bot.use(createConversation(async (conversation, ctx) => {
  // Campaign creation conversation (simplified)
  // Full implementation in campaigns.ts
}, 'createCampaign'));

// Command handlers
bot.command('start', startHandler);
bot.command('profile', profileHandler);
bot.command('tasks', (ctx) => tasksHandler(ctx, bot));
bot.command('review', reviewHandler);
bot.command('newcampaign', newCampaignHandler);
bot.command('predictions', predictionsHandler);
bot.command('newsurvey', newSurveyHandler);
bot.command('leaderboard', leaderboardHandler);
bot.command('credibility', credibilityHandler);
bot.command('admin', adminHandler);
bot.command('poll', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 3) {
    await ctx.reply('Usage: /poll <question> <option1> <option2> [option3] ...');
    return;
  }
  const question = args[0];
  const options = args.slice(1);
  await pollHandler(ctx, question, options);
});
bot.command('broadcast', async (ctx) => {
  const message = ctx.message.text.split(' ').slice(1).join(' ');
  if (!message) {
    await ctx.reply('Usage: /broadcast <message>');
    return;
  }
  await broadcastHandler(ctx, message);
});
bot.command('verifyfounder', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('Usage: /verifyfounder <userId>');
    return;
  }
  await verifyFounderHandler(ctx, args[0]);
});
bot.command('approve', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('Usage: /approve <messageId>');
    return;
  }
  const messageId = parseInt(args[0], 10);
  if (isNaN(messageId)) {
    await ctx.reply('Invalid message ID');
    return;
  }
  await approveHandler(ctx, messageId);
});
bot.command('deleteuser', deleteUserHandler);
bot.on('message:text', confirmDeleteUser);

// Callback query handlers
bot.callbackQuery('menu_tasks', (ctx) => tasksHandler(ctx, bot));
bot.callbackQuery('menu_predictions', predictionsHandler);
bot.callbackQuery(/^leaderboard_/, (ctx) => {
  const tier = ctx.callbackQuery.data.replace('leaderboard_', '');
  leaderboardTierHandler(ctx, tier);
});

// Admin callback queries
bot.callbackQuery('admin_verify_founder', async (ctx) => {
  await ctx.answerCallbackQuery('Use /verifyfounder <userId>');
  await ctx.reply('Use /verifyfounder <userId> to verify a founder.');
});
bot.callbackQuery('admin_broadcast', async (ctx) => {
  await ctx.answerCallbackQuery('Use /broadcast <message>');
  await ctx.reply('Use /broadcast <message> to broadcast to all users.');
});
bot.callbackQuery('admin_poll', async (ctx) => {
  await ctx.answerCallbackQuery('Use /poll <question> <option1> <option2> ...');
  await ctx.reply('Use /poll <question> <option1> <option2> ... to create a poll.');
});
bot.callbackQuery('admin_approve', async (ctx) => {
  await ctx.answerCallbackQuery('Use /approve <messageId>');
  await ctx.reply('Use /approve <messageId> to approve a verification.');
});

// Payment handler
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('message:successful_payment', async (ctx) => {
  const payment = ctx.message.successful_payment;
  const payload = payment.invoice_payload;

  // Parse payload
  if (payload.startsWith('campaign_')) {
    // Campaign payment handled separately
    const userId = payload.replace('campaign_', '');
    await handleStarsPayment(userId, payment.total_amount, 'campaign');
  } else if (payload.startsWith('bet_')) {
    const [, predictionId, optionIndex, userId] = payload.split('_');
    await handleStarsPayment(userId, payment.total_amount, 'bet');
    // Create bet (handled in predictions handler)
  } else if (payload.startsWith('subscription_')) {
    const userId = payload.replace('subscription_', '');
    await handleStarsPayment(userId, payment.total_amount, 'subscription');
  }

  await ctx.reply('✅ Payment successful! Points awarded.');
});

// Group handlers
bot.on('message:new_chat_members', newChatMembersHandler);

// Error handler
bot.catch((err) => {
  console.error('Bot error:', err);
});

/**
 * Cron jobs
 */
// Daily tier updates
cron.schedule('0 0 * * *', async () => {
  console.log('[Cron] Updating tiers...');
  const users = await prisma.user.findMany({
    select: { id: true, points: true }
  });

  for (const user of users) {
    await updateTier(user.id, user.points);
  }
  console.log('[Cron] Tiers updated');
});

// Remove new_to_crypto after 365 days active
cron.schedule('0 1 * * *', async () => {
  console.log('[Cron] Checking new_to_crypto expiration...');
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const users = await prisma.user.findMany({
    where: {
      isNewToCrypto: true,
      lastActive: { lt: oneYearAgo }
    }
  });

  for (const user of users) {
    const interests = user.interests.filter(i => i !== 'new_to_crypto');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        interests: { set: interests as any },
        isNewToCrypto: false
      }
    });
  }

  console.log(`[Cron] Removed new_to_crypto from ${users.length} users`);
});

// Update leaderboards daily
cron.schedule('0 2 * * *', async () => {
  console.log('[Cron] Updating leaderboards...');
  const campaigns = await prisma.campaign.findMany({
    where: { isActive: true }
  });

  for (const campaign of campaigns) {
    // Leaderboard computation handled in utils/leaderboard.ts
  }
  console.log('[Cron] Leaderboards updated');
});

/**
 * Webhook handler for Vercel
 */
export async function webhookHandler(req: any, res: any) {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
}

/**
 * Start bot (for local development)
 */
if (process.env.NODE_ENV !== 'production') {
  bot.start();
  console.log('🤖 Bot started in polling mode');
}

export default bot;

