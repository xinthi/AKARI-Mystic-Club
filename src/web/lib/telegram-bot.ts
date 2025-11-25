/**
 * Minimal Telegram Bot for Mini App Entry Point
 * 
 * This bot only handles:
 * - /start command to open the Mini App
 * - Basic help/commands
 * 
 * All serious logic lives in the Mini App and API routes.
 * No polling, no cron jobs, no long-running processes.
 */

import { Bot, InlineKeyboard } from 'grammy';

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

// Get WebApp URL from environment
const getWebAppUrl = (startParam?: string): string => {
  const baseUrl = 'https://akari-mystic-club.vercel.app';
  
  if (startParam) {
    return `${baseUrl}?startapp=${startParam}`;
  }
  
  return baseUrl;
};

// Create bot instance
export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Handle /start command - opens Mini App
bot.command('start', async (ctx) => {
  const startParam = ctx.match as string | undefined;
  const webAppUrl = getWebAppUrl(startParam);
  
  const keyboard = new InlineKeyboard()
    .webApp('🚀 Open AKARI Mystic Club', webAppUrl);
  
  await ctx.reply(
    '🔮 *Welcome to AKARI Mystic Club*\n\n' +
    'Your gateway to prediction markets, campaigns, and rewards!\n\n' +
    'Tap the button below to open the Mini App:',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
});

// Handle /help command
bot.command('help', async (ctx) => {
  const webAppUrl = getWebAppUrl();
  
  const keyboard = new InlineKeyboard()
    .webApp('🚀 Open Mini App', webAppUrl);
  
  await ctx.reply(
    '🔮 *AKARI Mystic Club Bot*\n\n' +
    'Commands:\n' +
    '/start - Open the Mini App\n' +
    '/help - Show this help message\n\n' +
    'All features are available in the Mini App:',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
  );
});

// Handle any other text - suggest opening Mini App
bot.on('message:text', async (ctx) => {
  // Only respond if it's not a command
  const text = ctx.message.text;
  if (text && !text.startsWith('/')) {
    const webAppUrl = getWebAppUrl();
    
    const keyboard = new InlineKeyboard()
      .webApp('🚀 Open Mini App', webAppUrl);
    
    await ctx.reply(
      '👋 Hi! Open the Mini App to access all features:\n' +
      '• Prediction Markets\n' +
      '• Campaigns & Tasks\n' +
      '• Leaderboards\n' +
      '• Your Profile',
      {
        reply_markup: keyboard
      }
    );
  }
});

// Error handler - catch all errors gracefully
bot.catch((err) => {
  console.error('Bot error:', err);
  // Don't throw - let the webhook handler manage the response
});

// Export bot instance (no polling, no cron - serverless only)
export default bot;

