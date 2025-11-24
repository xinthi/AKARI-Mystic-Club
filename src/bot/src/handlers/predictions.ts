import { Context, InlineKeyboard } from 'grammy';
import { prisma } from '../utils/prisma.js';
import { handleStarsPayment } from '../utils/stars.js';

/**
 * Predictions command - List active predictions
 */
export async function predictionsHandler(ctx: Context) {
  const predictions = await prisma.prediction.findMany({
    where: {
      resolved: false,
      endsAt: { gte: new Date() }
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      creator: true
    }
  });

  if (predictions.length === 0) {
    await ctx.reply('No active predictions at the moment.');
    return;
  }

  let message = '🎲 *Active Predictions*\n\n';
  for (const pred of predictions) {
    const options = (pred.options as any[]) || [];
    message += `*${pred.title}*\n`;
    message += `Options: ${options.map((o, i) => `${i + 1}. ${o}`).join(', ')}\n`;
    message += `Pot: ${pred.pot} Stars\n`;
    message += `Entry: ${pred.entryFeeStars} Stars\n`;
    message += `Ends: ${pred.endsAt.toLocaleDateString()}\n\n`;
  }

  const keyboard = new InlineKeyboard()
    .text('Create Prediction', 'create_prediction')
    .text('Place Bet', 'bet_prediction');

  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

/**
 * Create prediction (admin/founder only)
 */
export async function createPredictionHandler(ctx: Context) {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user || !user.isVerifiedFounder) {
    await ctx.reply('❌ Only verified founders can create predictions.');
    return;
  }

  // Simplified - in production, use conversation
  await ctx.reply('Use /createprediction command with format:\n/createprediction Title | Option1,Option2 | Fee | EndDate');
}

/**
 * Place bet on prediction
 */
export async function betHandler(ctx: Context, predictionId: string, optionIndex: number) {
  const telegramId = BigInt(ctx.from!.id);
  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) {
    await ctx.reply('User not found.');
    return;
  }

  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId }
  });

  if (!prediction || prediction.resolved || prediction.endsAt < new Date()) {
    await ctx.reply('Prediction not available.');
    return;
  }

  // Check if already bet
  const existingBet = await prisma.bet.findFirst({
    where: {
      userId: user.id,
      predictionId: prediction.id
    }
  });

  if (existingBet) {
    await ctx.reply('You already placed a bet on this prediction.');
    return;
  }

  // Send invoice for Stars payment
  if (!ctx.chat) return;
  await ctx.api.sendInvoice(
    ctx.chat.id,
    `Bet: ${prediction.title}`,
    `Option ${optionIndex + 1}`,
    `bet_${prediction.id}_${optionIndex}_${user.id}`,
    process.env.PAYMENT_PROVIDER_TOKEN || '',
    'XTR',
    [{ label: 'Entry Fee', amount: prediction.entryFeeStars }]
  );
}

/**
 * Handle successful bet payment
 */
export async function handleBetPayment(
  userId: string,
  predictionId: string,
  optionIndex: number,
  amount: number
) {
  // Award points
  await handleStarsPayment(userId, amount, 'bet');

  // Create bet
  const bet = await prisma.bet.create({
    data: {
      userId,
      predictionId,
      optionIndex,
      starsBet: amount
    }
  });

  // Update pot
  await prisma.prediction.update({
    where: { id: predictionId },
    data: {
      pot: {
        increment: amount
      }
    }
  });

  return bet;
}

/**
 * Resolve prediction (admin only)
 */
export async function resolvePredictionHandler(ctx: Context, predictionId: string, winnerOption: number) {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (ctx.from?.id.toString() !== adminId) {
    await ctx.reply('❌ Admin only.');
    return;
  }

  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: {
      bets: {
        include: {
          user: true
        }
      }
    }
  });

  if (!prediction) {
    await ctx.reply('Prediction not found.');
    return;
  }

  // Calculate distribution (95% of pot, pro-rata)
  const winningBets = prediction.bets.filter(b => b.optionIndex === winnerOption);
  const totalWinningBets = winningBets.reduce((sum, b) => sum + b.starsBet, 0);
  const payoutPot = Math.floor(prediction.pot * 0.95);

  // Update prediction
  await prisma.prediction.update({
    where: { id: predictionId },
    data: {
      resolved: true,
      winnerOption
    }
  });

  // Distribute winnings (log for manual payout)
  const distributions: Array<{ userId: string; amount: number }> = [];
  for (const bet of winningBets) {
    const share = Math.floor((bet.starsBet / totalWinningBets) * payoutPot);
    distributions.push({
      userId: bet.userId,
      amount: share
    });
  }

  console.log(`[Prediction Resolved] ${predictionId}: Payout ${distributions.length} winners, Total: ${payoutPot} Stars`);

  await ctx.reply(`✅ Prediction resolved! Winner: Option ${winnerOption + 1}\nPayout: ${payoutPot} Stars to ${distributions.length} winners.`);
}

