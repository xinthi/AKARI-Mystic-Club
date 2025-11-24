import { Conversation, ConversationFlavor } from '@grammyjs/conversations';
import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../utils/prisma.js';
import { t } from '../utils/i18n.js';
import { awardPoints } from '../utils/stars.js';
import { getTwitterOAuthClient } from '../utils/twitter.js';
import type { Interest } from '@prisma/client';

type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

/**
 * Start command handler with onboarding conversation
 */
export async function startHandler(ctx: MyContext) {
  const telegramId = BigInt(ctx.from!.id);
  const username = ctx.from?.username;

  // Check if user exists
  let user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) {
    // Create new user
    user = await prisma.user.create({
      data: {
        telegramId,
        username,
        language: 'en'
      }
    });
  } else {
    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() }
    });
  }

  // Send welcome message
  const welcomeText = t('welcome', user.language || 'en');
  await ctx.reply(welcomeText);

  // Start onboarding conversation if new user or incomplete
  if (!user.language || user.interests.length === 0) {
    await ctx.conversation.enter('onboarding');
  } else {
    // Show main menu
    await showMainMenu(ctx, user.language || 'en');
  }
}

/**
 * Onboarding conversation
 */
export async function onboardingConversation(conversation: MyConversation, ctx: MyContext) {
  const telegramId = BigInt(ctx.from!.id);
  let user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) return;

  // Step 1: Language selection
  if (!user.language) {
    const keyboard = new InlineKeyboard()
      .text('English 🇺🇸', 'lang_en')
      .row()
      .text('Español 🇪🇸', 'lang_es');

    await ctx.reply(t('languageSelect', 'en'), { reply_markup: keyboard });

    const langCtx = await conversation.waitForCallbackQuery(/^lang_/);
    const lang = langCtx.callbackQuery.data.replace('lang_', '');

    user = await prisma.user.update({
      where: { id: user.id },
      data: { language: lang }
    });

    await langCtx.answerCallbackQuery();
    await langCtx.editMessageText(t('languageSelect', lang) + ' ✅');
  }

  // Step 2: Interests selection
  if (user.interests.length === 0) {
    const keyboard = new InlineKeyboard()
      .text('Content Creator 🎥', 'interest_content_creator')
      .row()
      .text('Airdrop Hunter 🪂', 'interest_airdrop_hunter')
      .row()
      .text('Investor 📈', 'interest_investor')
      .row()
      .text('Founder 👑', 'interest_founder')
      .row()
      .text('New to Crypto 🌱', 'interest_new_to_crypto')
      .row()
      .text('✅ Done', 'interests_done');

    await ctx.reply(t('interestsSelect', user.language || 'en'), { reply_markup: keyboard });

    const selectedInterests: string[] = [];
    let done = false;

    while (!done) {
      const interestCtx = await conversation.waitForCallbackQuery(/^interest_/);
      const interest = interestCtx.callbackQuery.data.replace('interest_', '');

      if (interest === 'done') {
        if (selectedInterests.length === 0) {
          await interestCtx.answerCallbackQuery({ text: 'Please select at least one role!' });
          continue;
        }
        done = true;
        await interestCtx.answerCallbackQuery();
      } else {
        const interestEnum = interest.toUpperCase().replace(/([A-Z])/g, '_$1').slice(1).toLowerCase();
        if (selectedInterests.includes(interestEnum)) {
          selectedInterests.splice(selectedInterests.indexOf(interestEnum), 1);
        } else {
          selectedInterests.push(interestEnum);
        }
        await interestCtx.answerCallbackQuery({ text: `Selected: ${selectedInterests.length}` });
      }
    }

    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        interests: {
          set: selectedInterests as Interest[]
        },
        isNewToCrypto: selectedInterests.includes('new_to_crypto')
      }
    });
  }

  // Step 3: X Connect (optional)
  if (!user.xUserId) {
    const keyboard = new InlineKeyboard()
      .url('Connect X Account', await getXAuthUrl(user.id))
      .row()
      .text('Skip', 'skip_x');

    await ctx.reply('Connect your X (Twitter) account:', { reply_markup: keyboard });

    const xCtx = await conversation.waitForCallbackQuery(/^(skip_x|x_connected)/);
    if (xCtx.callbackQuery.data === 'x_connected') {
      // X connection handled via API callback
      await xCtx.answerCallbackQuery({ text: 'X account connected!' });
    } else {
      await xCtx.answerCallbackQuery();
    }
  }

  // Step 4: Wallets
  if (!user.tonWallet) {
    await ctx.reply(t('walletTON', user.language || 'en'));
    const tonCtx = await conversation.waitFor('message:text');
    const tonWallet = tonCtx.message.text;

    user = await prisma.user.update({
      where: { id: user.id },
      data: { tonWallet: tonWallet }
    });
  }

  if (!user.evmWallet) {
    await ctx.reply(t('walletEVM', user.language || 'en'));
    const evmCtx = await conversation.waitFor('message:text');
    const evmWallet = evmCtx.message.text;

    user = await prisma.user.update({
      where: { id: user.id },
      data: { evmWallet: evmWallet }
    });
  }

  // Award bonus EP for completing onboarding
  if (user.tonWallet && user.evmWallet) {
    await awardPoints(user.id, 5);
    await ctx.reply(t('onboardingComplete', user.language || 'en'));
  }

  // Show main menu
  await showMainMenu(ctx, user.language || 'en');
}

/**
 * Get X OAuth URL
 */
async function getXAuthUrl(userId: string): Promise<string> {
  const vercelUrl = process.env.VERCEL_URL || 'http://localhost:3000';
  const callbackUrl = `${vercelUrl}/api/x-callback?userId=${userId}`;
  
  const oauthClient = getTwitterOAuthClient();
  const { url } = await oauthClient.generateOAuth2AuthLink(callbackUrl, {
    scope: ['tweet.read', 'users.read', 'offline.access']
  });

  return url;
}

/**
 * Show main menu
 */
export async function showMainMenu(ctx: MyContext, lang: string) {
  const keyboard = new InlineKeyboard()
    .webApp('View Profile 👤', `${process.env.VERCEL_URL || 'http://localhost:3000'}/profile?userId=${ctx.from!.id}`)
    .row()
    .text('Tasks 📋', 'menu_tasks')
    .text('Predictions 🎲', 'menu_predictions');

  await ctx.reply(t('menuMain', lang), { reply_markup: keyboard });
}

