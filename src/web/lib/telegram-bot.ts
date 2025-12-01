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
import { prisma } from './prisma';

// Helper to ensure database connection with retry
async function withDb<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      // Try to connect if needed
      await prisma.$connect();
      return await operation();
    } catch (err: any) {
      lastError = err;
      console.warn(`[DB] Attempt ${i + 1} failed:`, err.message);
      if (i < maxRetries) {
        // Small delay before retry
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  throw lastError;
}

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

// For serverless environments, we need to provide botInfo to avoid async init
// Get bot info from BotFather: username, first_name, id
const BOT_INFO = {
  id: 7788619498, // @AKARIMystic_Bot ID
  is_bot: true as const,
  first_name: 'AKARI-Mystic-Club',
  username: 'AKARIMystic_Bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
};

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN, {
  botInfo: BOT_INFO,
});

// ============================================
// COMMAND HANDLERS
// ============================================

// Handle /start command
bot.command('start', async (ctx) => {
  // In groups, show a brief intro with link
  if (ctx.chat?.type !== 'private') {
    const webAppUrl = getWebAppUrl();
    await ctx.reply(
      '🔮 *AKARI Mystic Club*\n\n' +
      'A prediction market and reputation layer for Web3.\n\n' +
      '👉 DM me to get started, or tap below to open the app!\n\n' +
      `🔗 ${webAppUrl}`,
      {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Open Mini App', url: webAppUrl }],
          ],
        },
      }
    );
    return;
  }
  
  const userId = ctx.from?.id;
  const startParam = ctx.match as string | undefined;
  const webAppUrl = getWebAppUrl(startParam);
  
  // Check if first-time user
  let isFirstTime = true;
  
  if (userId) {
    try {
      // prisma is imported at top of file
      const user = await withDb(() => prisma.user.findUnique({
        where: { telegramId: String(userId) },
        select: { hasSeenBotWelcome: true },
      }));
      
      if (user?.hasSeenBotWelcome) {
        isFirstTime = false;
      } else if (user) {
        // Mark as seen
        await withDb(() => prisma.user.update({
          where: { telegramId: String(userId) },
          data: { hasSeenBotWelcome: true },
        }));
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
  const webAppUrl = getWebAppUrl();
  
  // In groups, show link instead of web_app button
  if (ctx.chat?.type !== 'private') {
    await ctx.reply(
      '🎮 *Ready to play?*\n\n' +
      'Open the Mini App to access predictions, quests, and more!\n\n' +
      `🔗 ${webAppUrl}`,
      {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Open Mini App', url: webAppUrl }],
          ],
        },
      }
    );
    return;
  }
  
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
  const webAppUrl = getWebAppUrl();
  
  // In groups, show brief help with link
  if (ctx.chat?.type !== 'private') {
    await ctx.reply(
      '🔮 *AKARI Mystic Club - Quick Help*\n\n' +
      '*Available in this group:*\n' +
      '• /play - Open the Mini App\n' +
      '• /akari\\_intro - About this bot\n' +
      (ctx.chat.type === 'supergroup' ? '• /credibility - Group trust stats (admin groups)\n' : '') +
      '\n*Full features in DM:*\n' +
      '• /start - Get started\n' +
      '• /help - Full guide\n\n' +
      `🔗 ${webAppUrl}`,
      {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [{ text: '🚀 Open Mini App', url: webAppUrl }],
          ],
        },
      }
    );
    return;
  }
  
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

// Handle /credibility command - show group credibility stats
bot.command('credibility', async (ctx) => {
  const chat = ctx.chat;
  
  // Only for groups
  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    await ctx.reply('This command shows group credibility stats and is only available in groups.');
    return;
  }
  
  const chatId = String(chat.id);
  
  try {
    // Get group info with retry
    const group = await withDb(() => prisma.tgGroup.findUnique({
      where: { id: chatId },
      select: { isAdmin: true, title: true },
    }));
    
    if (!group?.isAdmin) {
      await ctx.reply(
        '⚠️ *Credibility Stats Not Available*\n\n' +
        'This feature requires the bot to have admin rights in this group.\n\n' +
        'Ask a group admin to make @AKARIMystic_Bot an administrator.',
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Get group members who are also AKARI users (simplified approach)
    // In production, you'd track TgGroupMember entries
    const allUsers = await withDb(() => prisma.user.findMany({
      where: {
        OR: [
          { positiveReviews: { gt: 0 } },
          { negativeReviews: { gt: 0 } },
        ],
      },
      select: {
        id: true,
        telegramId: true,
        username: true,
        positiveReviews: true,
        negativeReviews: true,
        credibilityScore: true,
      },
    }));
    
    // Check which users are in this group (sample approach)
    const membersInGroup: typeof allUsers = [];
    
    for (const user of allUsers.slice(0, 50)) { // Limit to 50 to avoid rate limits
      try {
        const telegramId = parseInt(user.telegramId, 10);
        if (isNaN(telegramId)) continue;
        
        const member = await bot.api.getChatMember(chat.id, telegramId);
        if (['member', 'administrator', 'creator'].includes(member.status)) {
          membersInGroup.push(user);
        }
      } catch {
        // User not in group or bot can't check
      }
    }
    
    const total = membersInGroup.length;
    const highCred = membersInGroup.filter(u => (u.credibilityScore || 0) >= 3).length;
    const positive = membersInGroup.reduce((sum, u) => sum + (u.positiveReviews || 0), 0);
    const negative = membersInGroup.reduce((sum, u) => sum + (u.negativeReviews || 0), 0);
    const avgScore = total > 0 
      ? (membersInGroup.reduce((sum, u) => sum + (u.credibilityScore || 0), 0) / total).toFixed(1)
      : '0';
    
    const percentage = total > 0 ? ((highCred / total) * 100).toFixed(0) : '0';
    
    // Credibility rating
    let rating = '🔴 Low';
    if (parseFloat(percentage) >= 70) rating = '🟢 High';
    else if (parseFloat(percentage) >= 40) rating = '🟡 Medium';
    
    await ctx.reply(
      `🛡️ *Group Credibility Stats*\n\n` +
      `*Group:* ${group.title || chat.title}\n` +
      `*Rating:* ${rating}\n\n` +
      `📊 *Statistics:*\n` +
      `• Known AKARI users: ${total}\n` +
      `• High credibility (≥3): ${highCred} (${percentage}%)\n` +
      `• Total positive reviews: ${positive}\n` +
      `• Total negative reviews: ${negative}\n` +
      `• Average credibility: ${avgScore}\n\n` +
      `_Users with high credibility are more trustworthy in the AKARI ecosystem._\n\n` +
      `🔗 Open Mini App: ${getWebAppUrl()}`,
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    );
    
  } catch (err) {
    console.error('[TelegramBot] Error in /credibility:', err);
    await ctx.reply('❌ Failed to fetch credibility stats. Please try again.');
  }
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
    // prisma is imported at top of file
    const group = await withDb(() => prisma.tgGroup.findUnique({
      where: { id: chatId },
      select: { isAdmin: true },
    }));
    
    if (group?.isAdmin) {
      // Admin group - check if user is group admin
      const member = await bot.api.getChatMember(chat.id, ctx.from!.id);
      if (!['administrator', 'creator'].includes(member.status)) {
        await ctx.reply('Only group administrators can use this command here.');
        return;
      }
      
      // In groups, use URL button instead of web_app button
      await ctx.reply(ADMIN_GROUP_INTRO + `\n\n🔗 ${getWebAppUrl()}`, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Open Mini App',
                url: getWebAppUrl(),
              },
            ],
          ],
        },
      });
    } else {
      // Promo group - anyone can trigger
      // In groups, use URL button instead of web_app button
      await ctx.reply(PROMO_GROUP_INTRO + `\n\n🔗 ${getWebAppUrl()}`, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Open Mini App',
                url: getWebAppUrl(),
              },
            ],
          ],
        },
      });
    }
  } catch (err) {
    console.error('[TelegramBot] Error in /akari_intro:', err);
    // Fallback to promo intro - use URL button for groups
    await ctx.reply(PROMO_GROUP_INTRO + `\n\n🔗 ${getWebAppUrl()}`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Mini App',
              url: getWebAppUrl(),
            },
          ],
        ],
      },
    });
  }
});

// Handle /debuggroup command - show group status (admin only)
bot.command('debuggroup', async (ctx) => {
  const chat = ctx.chat;
  
  // Only for groups
  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    await ctx.reply('This command is only available in groups.');
    return;
  }
  
  // Check if user is group admin or bot admin
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const isGroupAdmin = await (async () => {
    try {
      const member = await bot.api.getChatMember(chat.id, userId);
      return ['administrator', 'creator'].includes(member.status);
    } catch {
      return false;
    }
  })();
  
  const isBotAdmin = ADMIN_IDS.includes(userId);
  
  if (!isGroupAdmin && !isBotAdmin) {
    await ctx.reply('Only group admins can use this command.');
    return;
  }
  
  const chatId = String(chat.id);
  
  try {
    // prisma is imported at top of file
    
    // Get group from DB
    const group = await withDb(() => prisma.tgGroup.findUnique({
      where: { id: chatId },
    }));
    
    // Get bot's status in this group
    let botStatus = 'unknown';
    try {
      const me = await bot.api.getMe();
      const botMember = await bot.api.getChatMember(chat.id, me.id);
      botStatus = botMember.status;
    } catch (err: any) {
      botStatus = `error: ${err.message}`;
    }
    
    if (group) {
      await ctx.reply(
        `🔍 *Group Debug Info*\n\n` +
        `*Chat ID:* \`${chatId}\`\n` +
        `*Title:* ${chat.title}\n` +
        `*Type:* ${chat.type}\n\n` +
        `*Database Record:*\n` +
        `• Registered: ✅\n` +
        `• isActive: ${group.isActive ? '✅' : '❌'}\n` +
        `• isAdmin: ${group.isAdmin ? '✅' : '❌'}\n` +
        `• allowPromo: ${group.allowPromo ? '✅' : '❌'}\n` +
        `• introSent: ${group.introSent ? '✅' : '❌'}\n\n` +
        `*Bot Status:* ${botStatus}\n\n` +
        `_If isAdmin is wrong, remove and re-add bot with correct permissions._`,
        { parse_mode: 'Markdown' }
      );
    } else {
      await ctx.reply(
        `🔍 *Group Debug Info*\n\n` +
        `*Chat ID:* \`${chatId}\`\n` +
        `*Title:* ${chat.title}\n` +
        `*Type:* ${chat.type}\n\n` +
        `*Database Record:* ❌ Not found\n\n` +
        `*Bot Status:* ${botStatus}\n\n` +
        `⚠️ Group not registered. This usually means the webhook didn't receive the my_chat_member update.\n\n` +
        `*To fix:*\n` +
        `1. Remove the bot from group\n` +
        `2. Re-add the bot\n` +
        `3. If adding as admin, promote to admin BEFORE adding\n\n` +
        `Or use /registergroup to manually register.`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('[TelegramBot] Error in /debuggroup:', err);
    await ctx.reply('❌ Failed to fetch group debug info.');
  }
});

// Handle /registergroup command - manually register group
bot.command('registergroup', async (ctx) => {
  const chat = ctx.chat;
  
  // Only for groups
  if (chat.type !== 'group' && chat.type !== 'supergroup') {
    await ctx.reply('This command is only available in groups.');
    return;
  }
  
  // Check if user is group admin
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const isGroupAdmin = await (async () => {
    try {
      const member = await bot.api.getChatMember(chat.id, userId);
      return ['administrator', 'creator'].includes(member.status);
    } catch {
      return false;
    }
  })();
  
  if (!isGroupAdmin) {
    await ctx.reply('Only group admins can register the group.');
    return;
  }
  
  const chatId = String(chat.id);
  const title = chat.title || 'Unknown Group';
  const username = 'username' in chat ? chat.username : undefined;
  
  try {
    // prisma is imported at top of file
    
    // Check bot's status
    let isAdmin = false;
    try {
      const me = await bot.api.getMe();
      const botMember = await bot.api.getChatMember(chat.id, me.id);
      isAdmin = botMember.status === 'administrator';
    } catch {
      // Assume not admin if check fails
    }
    
    // Upsert group
    await withDb(() => prisma.tgGroup.upsert({
      where: { id: chatId },
      update: {
        title,
        username: username || null,
        isActive: true,
        isAdmin,
        allowPromo: !isAdmin,
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
    }));
    
    await ctx.reply(
      `✅ *Group Registered!*\n\n` +
      `*Title:* ${title}\n` +
      `*Chat ID:* \`${chatId}\`\n` +
      `*Bot is Admin:* ${isAdmin ? '✅' : '❌'}\n` +
      `*Promo Messages:* ${!isAdmin ? '✅ Allowed' : '❌ Disabled (admin group)'}\n\n` +
      (isAdmin 
        ? `_As an admin group, I'll only handle verifications and credibility. No spam!_`
        : `_As a promo group, I may share new predictions and campaigns._`
      ),
      { parse_mode: 'Markdown' }
    );
    
  } catch (err) {
    console.error('[TelegramBot] Error in /registergroup:', err);
    await ctx.reply('❌ Failed to register group. Please try again.');
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
    // prisma is imported at top of file
    
    if (newStatus === 'administrator' || newStatus === 'member') {
      // Bot added to group - upsert TgGroup
      const existingGroup = await withDb(() => prisma.tgGroup.findUnique({
        where: { id: chatId },
        select: { introSent: true },
      }));
      
      await withDb(() => prisma.tgGroup.upsert({
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
      }));
      
      console.log(`[TelegramBot] Registered group: ${title} (${chatId}) isAdmin=${isAdmin}`);
      
      // Send intro message if not sent before
      if (!existingGroup?.introSent) {
        try {
          const introMessage = isAdmin ? ADMIN_GROUP_INTRO : PROMO_GROUP_INTRO;
          
          // In groups, use URL button instead of web_app button
          await bot.api.sendMessage(chat.id, introMessage + `\n\n🔗 ${getWebAppUrl()}`, {
            parse_mode: 'Markdown',
            link_preview_options: { is_disabled: true },
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '🚀 Open Mini App',
                    url: getWebAppUrl(),
                  },
                ],
              ],
            },
          });
          
          // Mark intro as sent
          await withDb(() => prisma.tgGroup.update({
            where: { id: chatId },
            data: { introSent: true },
          }));
          
          console.log(`[TelegramBot] Sent intro to group: ${title}`);
        } catch (sendErr) {
          console.error(`[TelegramBot] Failed to send intro to ${title}:`, sendErr);
        }
      }
      
    } else if (newStatus === 'left' || newStatus === 'kicked') {
      // Bot removed from group
      await withDb(() => prisma.tgGroup.update({
        where: { id: chatId },
        data: { isActive: false },
      })).catch(() => {
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
