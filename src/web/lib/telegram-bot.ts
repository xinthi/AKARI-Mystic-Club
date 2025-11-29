/**
 * Minimal Telegram Bot for Mini App Entry Point
 * 
 * This bot handles:
 * - /start command to open the Mini App
 * - /admin command for admins to access admin panel
 * - Basic help/commands
 * 
 * All serious logic lives in the Mini App and API routes.
 * No polling, no cron jobs, no long-running processes.
 * 
 * REQUIRED ENV VARS:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather for @AKARIMystic_Bot
 * - NEXT_PUBLIC_APP_URL: The deployed app URL (e.g. https://play.akarimystic.club)
 */

import { Bot } from 'grammy';

// Log env var status on module load
console.log('[TelegramBot] Module loaded.');
console.log('[TelegramBot] TELEGRAM_BOT_TOKEN length:', process.env.TELEGRAM_BOT_TOKEN?.length ?? 0);
console.log('[TelegramBot] NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || '(not set, using fallback)');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

// ============================================
// ADMIN IDS
// ============================================

// Hardcoded list of admin Telegram user IDs
// Add your admin IDs here
const ADMIN_IDS: number[] = [
  6022649318, // Primary admin - replace with actual admin IDs
];

// ============================================
// URL HELPERS
// ============================================

// Get WebApp URL from environment
const getWebAppUrl = (startParam?: string): string => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://play.akarimystic.club';
  
  if (startParam) {
    return `${baseUrl}?startapp=${startParam}`;
  }
  
  return baseUrl;
};

// Get Admin panel URL
const getAdminUrl = (path: string = '/admin/campaigns'): string => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://play.akarimystic.club';
  return `${baseUrl}${path}`;
};

// ============================================
// BOT INSTANCE
// ============================================

// Create bot instance
export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// ============================================
// COMMAND HANDLERS
// ============================================

// Handle /start command - opens Mini App
bot.command('start', async (ctx) => {
  const startParam = ctx.match as string | undefined;
  const webAppUrl = getWebAppUrl(startParam);
  
  // Use raw inline_keyboard format for WebApp button
  await ctx.reply(
    '🔮 *Welcome to AKARI Mystic Club*\n\n' +
    'Your gateway to prediction markets, campaigns, and rewards!\n\n' +
    '✨ Features:\n' +
    '• Prediction Markets\n' +
    '• Daily Wheel of Fortune\n' +
    '• Campaigns & Tasks\n' +
    '• MYST Token Rewards\n' +
    '• Leaderboards\n\n' +
    'Tap the button below to open the Mini App:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open AKARI Mystic Club',
              web_app: { url: webAppUrl },
            },
          ],
        ],
      },
    }
  );
});

// Handle /admin command - only for admin IDs
bot.command('admin', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (!userId) {
    await ctx.reply('❌ Could not identify your user ID.');
    return;
  }
  
  // Check if user is an admin
  if (!ADMIN_IDS.includes(userId)) {
    await ctx.reply(
      '❌ You are not an admin.\n\n' +
      'If you believe this is an error, please contact the bot owner.'
    );
    return;
  }
  
  // User is an admin - show admin panel links
  const campaignsUrl = getAdminUrl('/admin/campaigns');
  const predictionsUrl = getAdminUrl('/admin/prediction-requests');
  const withdrawalsUrl = getAdminUrl('/admin/withdrawals');
  const mystUrl = getAdminUrl('/admin/myst');
  const wheelUrl = getAdminUrl('/admin/wheel');
  const leaderboardUrl = getAdminUrl('/admin/leaderboard');
  
  await ctx.reply(
    '🔐 *Admin Panel*\n\n' +
    'Welcome, admin! Here are your management tools:\n\n' +
    `📋 [Campaigns](${campaignsUrl})\n` +
    `🎯 [Prediction Requests](${predictionsUrl})\n` +
    `💸 [Withdrawals](${withdrawalsUrl})\n` +
    `💎 [MYST Grants](${mystUrl})\n` +
    `🎡 [Wheel Pool](${wheelUrl})\n` +
    `📊 [Leaderboard Analytics](${leaderboardUrl})\n\n` +
    '_Note: You will need your admin token to access these pages._',
    {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Campaigns', url: campaignsUrl },
            { text: '🎯 Predictions', url: predictionsUrl },
          ],
          [
            { text: '💸 Withdrawals', url: withdrawalsUrl },
            { text: '💎 MYST', url: mystUrl },
          ],
          [
            { text: '🎡 Wheel', url: wheelUrl },
            { text: '📊 Analytics', url: leaderboardUrl },
          ],
          [
            {
              text: '🚀 Open Mini App',
              web_app: { url: getWebAppUrl() },
            },
          ],
        ],
      },
    }
  );
  
  console.log(`[TelegramBot] Admin ${userId} accessed admin panel`);
});

// Handle /help command
bot.command('help', async (ctx) => {
  const webAppUrl = getWebAppUrl();
  
  await ctx.reply(
    '🔮 *AKARI Mystic Club Bot*\n\n' +
    '*Commands:*\n' +
    '/start - Open the Mini App\n' +
    '/help - Show this help message\n' +
    '/admin - Admin panel (admins only)\n\n' +
    'All features are available in the Mini App:',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Mini App',
              web_app: { url: webAppUrl },
            },
          ],
        ],
      },
    }
  );
});

// Handle any other text - suggest opening Mini App
bot.on('message:text', async (ctx) => {
  // Only respond if it's not a command
  const text = ctx.message.text;
  if (text && !text.startsWith('/')) {
    const webAppUrl = getWebAppUrl();
    
    await ctx.reply(
      '👋 Hi! Open the Mini App to access all features:\n' +
      '• Prediction Markets\n' +
      '• Daily Wheel of Fortune\n' +
      '• Campaigns & Tasks\n' +
      '• Leaderboards\n' +
      '• Your Profile',
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Open Mini App',
                web_app: { url: webAppUrl },
              },
            ],
          ],
        },
      }
    );
  }
});

// ============================================
// ERROR HANDLER
// ============================================

// Error handler - catch all errors gracefully
bot.catch((err) => {
  console.error('[TelegramBot] Error:', err);
  // Don't throw - let the webhook handler manage the response
});

// Export bot instance (no polling, no cron - serverless only)
export default bot;
