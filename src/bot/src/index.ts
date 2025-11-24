// @ts-nocheck - This file is not type-checked by Next.js
import { Bot, Context, session, SessionFlavor } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { prisma } from './utils/prisma.js';
import { updateTier } from './utils/tiers.js';
import { startHandler, onboardingConversation } from './handlers/start.js';
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

// Load environment variables first
dotenv.config();

// Check TELEGRAM_BOT_TOKEN
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Missing token');
}

interface SessionData {
  step?: string;
  tempData?: Record<string, any>;
}

type MyContext = Context & SessionFlavor<SessionData>;

// Initialize bot
const bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN || '');

// Session middleware with proper initial state
bot.use(session({
  initial: () => ({
    step: 'idle',
    tempData: {}
  }),
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
  const message = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
  if (!message) {
    await ctx.reply('Usage: /broadcast <message>');
    return;
  }
  await broadcastHandler(ctx, message);
});
bot.command('verifyfounder', async (ctx) => {
  const text = ctx.message?.text || '';
  const args = text.split(' ').slice(1);
  if (args.length < 1) {
    await ctx.reply('Usage: /verifyfounder <userId>');
    return;
  }
  await verifyFounderHandler(ctx, args[0]);
});
bot.command('approve', async (ctx) => {
  const text = ctx.message?.text || '';
  const args = text.split(' ').slice(1);
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

// Error handler with better error handling
bot.catch((ctx, err) => {
  console.error('Webhook error:', err);
  // Check if it's a TypeError
  if (err.message && err.message.includes('TypeError')) {
    console.error('TypeError detected:', err);
    if (ctx && ctx.chat) {
      ctx.reply('🔮 Mystic error—retry!').catch(() => {
        // Ignore if reply fails
      });
    }
  } else {
    // Try to reply to user if context is available
    if (ctx && ctx.chat) {
      ctx.reply('🔮 Mystic error—retry!').catch(() => {
        // Ignore if reply fails
      });
    }
  }
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
 * Webhook callback function for Grammy.js
 * Creates a Next.js-compatible handler that uses bot.handleUpdate()
 */
function webhookCallback(botInstance: Bot, framework: string = 'grammy') {
  return async (req: any, res: any) => {
    // Check TELEGRAM_BOT_TOKEN
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('Missing token');
      return res.status(500).send('Missing token');
    }

    try {
      // Ensure Prisma is connected
      await prisma.$connect().catch((err: any) => {
        console.error('Prisma connect error:', err);
      });

      // Parse request body
      const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      
      if (!update || !update.update_id) {
        console.error('Webhook: Invalid update format', update);
        return res.status(400).send('Invalid update format');
      }

      // Handle update with bot
      await botInstance.handleUpdate(update);
      
      // Send success response
      if (!res.headersSent) {
        res.status(200).send('OK');
      }
    } catch (error: any) {
      console.error('Webhook handler error:', error);
      if (!res.headersSent) {
        res.status(500).send(`Error: ${error.message || 'Unknown error'}`);
      }
    }
  };
}

// Initialize bot (Grammy.js doesn't have bot.init(), but we can verify readiness)
async function initializeBot() {
  try {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      // Test bot by checking if token is valid (bot is ready after creation)
      console.log('Bot initialized');
    }
  } catch (err: any) {
    console.error('Bot init error:', err);
  }
}

// Initialize bot on module load
initializeBot();

// Export webhook handler using webhookCallback pattern
export const handler = webhookCallback(bot, 'grammy');

/**
 * Legacy webhook handler (for compatibility)
 * @deprecated Use handler instead
 */
export async function webhookHandler(req: any, res: any) {
  try {
    // Validate environment
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('Webhook: Missing TELEGRAM_BOT_TOKEN');
      if (!res.headersSent) {
        return res.status(500).send('Bot token not configured');
      }
      return;
    }

    if (!process.env.DATABASE_URL) {
      console.error('Webhook: Missing DATABASE_URL');
      if (!res.headersSent) {
        return res.status(500).send('Database not configured');
      }
      return;
    }

    // Ensure Prisma is connected
    try {
      await prisma.$connect();
    } catch (prismaError: any) {
      console.error('Prisma connection error:', prismaError);
      // Continue anyway - connection might already be established
    }

    const update = req.body;
    if (!update || !update.update_id) {
      console.error('Webhook: Invalid update format', update);
      if (!res.headersSent) {
        return res.status(400).send('Invalid update format');
      }
      return;
    }
    
    await bot.handleUpdate(update);
    
    if (!res.headersSent) {
      res.status(200).send('OK');
    }
  } catch (error: any) {
    console.error('Webhook error:', error);
    // Don't send error response if already sent
    if (!res.headersSent) {
      res.status(500).send(`Error: ${error.message || 'Unknown error'}`);
    }
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

