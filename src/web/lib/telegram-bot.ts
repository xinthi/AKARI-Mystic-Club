/**
 * Telegram Bot for AKARI Mystic Club
 * 
 * This bot handles:
 * - /start command with first-time welcome guide
 * - /help command with detailed guide
 * - /admin command for admins to access admin panel
 * - /akari_intro command for group introductions
 * - Group management (admin vs promo)
 * 
 * REQUIRED ENV VARS:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather
 * - NEXT_PUBLIC_APP_URL: The deployed app URL
 * - TELEGRAM_ADMIN_IDS: Comma-separated admin Telegram IDs
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

function getAdminIds(): number[] {
  const envAdminIds = process.env.TELEGRAM_ADMIN_IDS;
  if (envAdminIds) {
    const ids = envAdminIds.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    if (ids.length > 0) {
      console.log('[TelegramBot] Admin IDs loaded from env:', ids.length, 'admins');
      return ids;
    }
  }
  
  return [
    6022649318, // Primary admin
  ];
}

const ADMIN_IDS = getAdminIds();

// ============================================
// URL HELPERS
// ============================================

const getWebAppUrl = (startParam?: string): string => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://play.akarimystic.club';
  if (startParam) {
    return `${baseUrl}?startapp=${startParam}`;
  }
  return baseUrl;
};

const getAdminUrl = (path: string = '/admin/campaigns'): string => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://play.akarimystic.club';
  return `${baseUrl}${path}`;
};

// ============================================
// WELCOME MESSAGE TEMPLATES
// ============================================

const RESPONSIBLE_GAMBLING_WARNING = `
⚠️ *Responsible Play Warning*
• Do not gamble with money you cannot afford to lose.
• Prediction markets can be addictive.
• Take breaks if you feel stressed.
• If you need help, seek support.`;

const FIRST_TIME_WELCOME = `🔮 *Welcome to AKARI Mystic Club!*

A prediction market and reputation layer for Web3.

*How it works:*
1️⃣ You get *5 MYST* when you start (until 01 Jan 2026)
2️⃣ Use MYST to join prediction markets and play quests
3️⃣ Build reputation via reviews and referrals
4️⃣ Deposit TON to get more MYST and request withdrawals

*Commands:*
/play – Open the Mini App
/help – Full tips and FAQ
${RESPONSIBLE_GAMBLING_WARNING}`;

const RETURNING_WELCOME = `🔮 *Welcome back to AKARI Mystic Club!*

Ready to make some predictions?

Use /help for tips or tap below to open the app:`;

const HELP_MESSAGE = `🔮 *AKARI Mystic Club - Complete Guide*

*💰 How Gameplay Works*
• *MYST* is our in-game token (1 USD = 50 MYST)
• Use MYST to bet on predictions
• Win MYST when your predictions are correct
• Earn *aXP* (experience points) from activities
• Spin the *Wheel of Fortune* daily for rewards

*💎 How to Get MYST*
Step 1: Get a TON wallet (Tonkeeper, Ton Space)
Step 2: In the Mini App, go to Profile → Connect your wallet
Step 3: Use "Buy MYST with TON" section
Step 4: Send TON to the treasury address with your memo
Step 5: Wait for admin confirmation

*👥 Referrals & Reviews*
• Share your referral link to invite friends
• Earn 8% of your direct referrals' MYST spending (L1)
• Earn 2% from their referrals' spending (L2)
• Leave reviews on other users' profiles
• Build your credibility score for community trust

*🏆 Weekly Recognition*
• Top 10 players are highlighted every Tuesday
• Rankings reset weekly
• Compete on MYST Spent, Referrals, or aXP tabs
${RESPONSIBLE_GAMBLING_WARNING}`;

const ADMIN_GROUP_INTRO = `👋 Hi, I'm the *AKARI Mystic Club* bot.

In this group I will:
• Verify whether users joined for quests
• Help measure group credibility using user reviews

I will *not* spam predictions or quests here.`;

const PROMO_GROUP_INTRO = `👋 Hi, I'm the *AKARI Mystic Club* bot!

I share new predictions and quests here.

Open the Mini App above to play! 🔮`;

// ============================================
// BOT INSTANCE
// ============================================

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// ============================================
// COMMAND HANDLERS
// ============================================

// Handle /start command
bot.command('start', async (ctx) => {
  // Only respond in private chats
  if (ctx.chat?.type !== 'private') return;
  
  const userId = ctx.from?.id;
  const startParam = ctx.match as string | undefined;
  const webAppUrl = getWebAppUrl(startParam);
  
  // Check if first-time user
  let isFirstTime = true;
  
  if (userId) {
    try {
      const { prisma } = await import('./prisma');
      const user = await prisma.user.findUnique({
        where: { telegramId: String(userId) },
        select: { hasSeenBotWelcome: true },
      });
      
      if (user?.hasSeenBotWelcome) {
        isFirstTime = false;
      } else if (user) {
        // Mark as seen
        await prisma.user.update({
          where: { telegramId: String(userId) },
          data: { hasSeenBotWelcome: true },
        });
      }
    } catch (err) {
      console.error('[TelegramBot] Error checking first-time user:', err);
    }
  }
  
  const message = isFirstTime ? FIRST_TIME_WELCOME : RETURNING_WELCOME;
  
  await ctx.reply(message, {
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
  });
});

// Handle /play command - shortcut to open app
bot.command('play', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;
  
  const webAppUrl = getWebAppUrl();
  
  await ctx.reply('🎮 *Ready to play?*\n\nTap below to open the Mini App:', {
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
  });
});

// Handle /help command
bot.command('help', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;
  
  const webAppUrl = getWebAppUrl();
  
  await ctx.reply(HELP_MESSAGE, {
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
  });
});

// Handle /admin command - RESTRICTED to admin IDs only
bot.command('admin', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;
  
  const userId = ctx.from?.id;
  const username = ctx.from?.username || ctx.from?.first_name || 'Unknown';
  
  if (!userId) {
    await ctx.reply('Could not identify your user ID.');
    return;
  }
  
  if (!ADMIN_IDS.includes(userId)) {
    console.warn(`[TelegramBot] UNAUTHORIZED /admin attempt by user ${userId} (@${username})`);
    await ctx.reply(
      'This command is not available.\n\n' +
      'Use /start to open the Mini App or /help for available commands.'
    );
    return;
  }
  
  console.log(`[TelegramBot] Admin access granted to user ${userId} (@${username})`);
  
  const treasuryUrl = getAdminUrl('/admin/treasury');
  const campaignsUrl = getAdminUrl('/admin/campaigns');
  const predictionsUrl = getAdminUrl('/admin/predictions');
  const depositsUrl = getAdminUrl('/admin/deposits');
  const withdrawalsUrl = getAdminUrl('/admin/withdrawals');
  const mystUrl = getAdminUrl('/admin/myst');
  const wheelUrl = getAdminUrl('/admin/wheel');
  const leaderboardUrl = getAdminUrl('/admin/leaderboard');
  
  await ctx.reply(
    '🔐 *Admin Panel*\n\n' +
    'Welcome, admin! Here are your management tools:\n\n' +
    `🏦 [Treasury](${treasuryUrl})\n` +
    `📋 [Campaigns](${campaignsUrl})\n` +
    `🎯 [Predictions](${predictionsUrl})\n` +
    `📥 [Deposits](${depositsUrl})\n` +
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
            { text: '🏦 Treasury', url: treasuryUrl },
            { text: '💸 Withdrawals', url: withdrawalsUrl },
          ],
          [
            { text: '📥 Deposits', url: depositsUrl },
            { text: '📋 Campaigns', url: campaignsUrl },
          ],
          [
            { text: '🎯 Predictions', url: predictionsUrl },
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
});

// Handle /akari_intro command - group intro on demand
bot.command('akari_intro', async (ctx) => {
  const chat = ctx.chat;
  
  // Only for groups
  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    await ctx.reply('This command is only available in groups.');
    return;
  }
  
  const chatId = String(chat.id);
  
  try {
    const { prisma } = await import('./prisma');
    const group = await prisma.tgGroup.findUnique({
      where: { id: chatId },
      select: { isAdmin: true },
    });
    
    if (group?.isAdmin) {
      // Admin group - check if user is group admin
      const member = await bot.api.getChatMember(chat.id, ctx.from!.id);
      if (!['administrator', 'creator'].includes(member.status)) {
        await ctx.reply('Only group administrators can use this command here.');
        return;
      }
      
      await ctx.reply(ADMIN_GROUP_INTRO, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Open Mini App',
                web_app: { url: getWebAppUrl() },
              },
            ],
          ],
        },
      });
    } else {
      // Promo group - anyone can trigger
      await ctx.reply(PROMO_GROUP_INTRO, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Open Mini App',
                web_app: { url: getWebAppUrl() },
              },
            ],
          ],
        },
      });
    }
  } catch (err) {
    console.error('[TelegramBot] Error in /akari_intro:', err);
    // Fallback to promo intro
    await ctx.reply(PROMO_GROUP_INTRO, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Mini App',
              web_app: { url: getWebAppUrl() },
            },
          ],
        ],
      },
    });
  }
});

// Handle any other text in private - suggest opening Mini App
bot.on('message:text', async (ctx) => {
  // Only in private chats and non-commands
  if (ctx.chat?.type !== 'private') return;
  
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
// GROUP MEMBERSHIP HANDLERS
// ============================================

// Handle bot being added/removed from groups
bot.on('my_chat_member', async (ctx) => {
  const chat = ctx.chat;
  const newStatus = ctx.myChatMember.new_chat_member.status;
  
  // Only handle group/supergroup
  if (chat.type !== 'group' && chat.type !== 'supergroup') return;
  
  const chatId = String(chat.id);
  const title = chat.title || 'Unknown Group';
  const username = 'username' in chat ? chat.username : undefined;
  const isAdmin = newStatus === 'administrator';
  
  console.log(`[TelegramBot] Bot status in group ${chatId} (${title}): ${newStatus}`);
  
  try {
    const { prisma } = await import('./prisma');
    
    if (newStatus === 'administrator' || newStatus === 'member') {
      // Bot added to group - upsert TgGroup
      const existingGroup = await prisma.tgGroup.findUnique({
        where: { id: chatId },
        select: { introSent: true },
      });
      
      await prisma.tgGroup.upsert({
        where: { id: chatId },
        update: {
          title,
          username: username || null,
          isActive: true,
          isAdmin,
          allowPromo: !isAdmin, // Admin groups don't get promo
        },
        create: {
          id: chatId,
          title,
          username: username || null,
          isActive: true,
          isAdmin,
          allowPromo: !isAdmin,
          introSent: false,
        },
      });
      
      console.log(`[TelegramBot] Registered group: ${title} (${chatId}) isAdmin=${isAdmin}`);
      
      // Send intro message if not sent before
      if (!existingGroup?.introSent) {
        try {
          const introMessage = isAdmin ? ADMIN_GROUP_INTRO : PROMO_GROUP_INTRO;
          
          await bot.api.sendMessage(chat.id, introMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🚀 Open Mini App',
                    web_app: { url: getWebAppUrl() },
                  },
                ],
              ],
            },
          });
          
          // Mark intro as sent
          await prisma.tgGroup.update({
            where: { id: chatId },
            data: { introSent: true },
          });
          
          console.log(`[TelegramBot] Sent intro to group: ${title}`);
        } catch (sendErr) {
          console.error(`[TelegramBot] Failed to send intro to ${title}:`, sendErr);
        }
      }
      
    } else if (newStatus === 'left' || newStatus === 'kicked') {
      // Bot removed from group
      await prisma.tgGroup.update({
        where: { id: chatId },
        data: { isActive: false },
      }).catch(() => {
        // Group might not exist in DB yet
      });
      console.log(`[TelegramBot] Deactivated group: ${title} (${chatId})`);
    }
  } catch (err) {
    console.error('[TelegramBot] Error handling group update:', err);
  }
});

// ============================================
// GROUP VERIFICATION HELPER
// ============================================

/**
 * Check if a user is a member of a specific group/channel
 */
export async function hasUserJoinedGroup(userTelegramId: string, groupChatId: string): Promise<boolean> {
  try {
    const member = await bot.api.getChatMember(groupChatId, parseInt(userTelegramId, 10));
    
    // User is a member if status is one of these
    const validStatuses = ['member', 'administrator', 'creator', 'restricted'];
    return validStatuses.includes(member.status);
  } catch (err: any) {
    console.warn(`[TelegramBot] getChatMember failed for user ${userTelegramId} in ${groupChatId}:`, err.message);
    return false;
  }
}

// ============================================
// ERROR HANDLER
// ============================================

bot.catch((err) => {
  console.error('[TelegramBot] Error:', err);
});

export default bot;
