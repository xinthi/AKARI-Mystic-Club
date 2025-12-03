import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';
import { getMystBalance } from '../../../lib/myst-service';

type Data =
  | { ok: true; prediction: any; userBalances?: { myst: number; points: number } }
  | { ok: false; prediction: null; reason: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const id = String(req.query.id);

  try {
    if (req.method === 'GET') {
      const prediction = await withDbRetry(() => prisma.prediction.findUnique({
        where: { id },
        include: {
          _count: {
            select: { bets: true },
          },
        },
      }));

      if (!prediction) {
        return res.status(404).json({ ok: false, prediction: null, reason: 'Prediction not found' });
      }

      // Calculate real optionStats from bets
      const bets = await withDbRetry(() => prisma.bet.findMany({
        where: { predictionId: prediction.id },
        select: {
          option: true,
          starsBet: true,
          pointsBet: true,
          mystBet: true,
        },
      }));

      // Group bets by option and calculate stats
      const optionStatsMap = new Map<string, { betCount: number; totalStars: number; totalPoints: number; totalMyst: number }>();
      
      (prediction.options as string[]).forEach((option) => {
        optionStatsMap.set(option, { betCount: 0, totalStars: 0, totalPoints: 0, totalMyst: 0 });
      });

      bets.forEach((bet) => {
        const stats = optionStatsMap.get(bet.option) || { betCount: 0, totalStars: 0, totalPoints: 0, totalMyst: 0 };
        stats.betCount += 1;
        stats.totalStars += bet.starsBet || 0;
        stats.totalPoints += bet.pointsBet || 0;
        stats.totalMyst += bet.mystBet || 0;
        optionStatsMap.set(bet.option, stats);
      });

      const optionStats = (prediction.options as string[]).map((option: string, index: number) => {
        const stats = optionStatsMap.get(option) || { betCount: 0, totalStars: 0, totalPoints: 0, totalMyst: 0 };
        return {
          option,
          index,
          betCount: stats.betCount,
          totalStars: stats.totalStars,
          totalPoints: stats.totalPoints,
          totalMyst: stats.totalMyst,
        };
      });

      // Get user's existing bet if authenticated
      let userBet: any = null;
      let userBalances: { myst: number; points: number } | undefined = undefined;
      let referralCode: string | undefined = undefined;
      const user = await getUserFromRequest(req, prisma);
      if (user) {
        // Get user balances
        const mystBalance = await withDbRetry(() => getMystBalance(prisma, user.id));
        userBalances = {
          myst: mystBalance,
          points: user.points,
        };

        // Get or generate referral code
        if (user.referralCode) {
          referralCode = user.referralCode;
        } else {
          // Generate referral code if user doesn't have one
          const { generateReferralCode } = await import('../../../lib/myst-service');
          referralCode = generateReferralCode(user.telegramId);
          try {
            await withDbRetry(() => prisma.user.update({
              where: { id: user.id },
              data: { referralCode },
            }));
          } catch (e: any) {
            console.warn('[Prediction API] Failed to save referral code:', e.message);
            // Continue without referral code
          }
        }

        const existingBet = await withDbRetry(() => prisma.bet.findFirst({
          where: {
            predictionId: prediction.id,
            userId: user.id,
          },
        }));

        if (existingBet) {
          // Find the option index from the option string
          const optionIndex = Array.isArray(prediction.options)
            ? (prediction.options as string[]).indexOf(existingBet.option)
            : -1;

          userBet = {
            optionIndex: optionIndex >= 0 ? optionIndex : 0,
            option: existingBet.option,
            starsBet: existingBet.starsBet,
            pointsBet: existingBet.pointsBet,
            mystBet: existingBet.mystBet,
          };
        }
      }

      // Helper to derive category from prediction id/title
      const deriveCategory = (id: string, title: string): string => {
        const idLower = id.toLowerCase();
        const titleLower = title.toLowerCase();
        
        if (idLower.includes('btc') || idLower.includes('eth') || 
            titleLower.includes('bitcoin') || titleLower.includes('ethereum') ||
            titleLower.includes('crypto') || titleLower.includes('btc') || titleLower.includes('eth')) {
          return 'Crypto';
        }
        if (idLower.includes('trump') || idLower.includes('election') || idLower.includes('biden') ||
            titleLower.includes('election') || titleLower.includes('president') || titleLower.includes('vote')) {
          return 'Politics';
        }
        if (idLower.includes('fed') || idLower.includes('rate') || idLower.includes('stock') ||
            titleLower.includes('fed') || titleLower.includes('rate') || titleLower.includes('market') ||
            titleLower.includes('s&p') || titleLower.includes('nasdaq')) {
          return 'Markets';
        }
        if (idLower.includes('football') || idLower.includes('soccer') || idLower.includes('match') ||
            titleLower.includes('football') || titleLower.includes('soccer') || titleLower.includes('match') ||
            titleLower.includes('premier league') || titleLower.includes('la liga') || titleLower.includes('champions league')) {
          return 'Sports';
        }
        return 'Community';
      };

      return res.status(200).json({
        ok: true,
        prediction: {
          id: prediction.id,
          title: prediction.title,
          description: prediction.description,
          options: prediction.options,
          entryFeeStars: prediction.entryFeeStars,
          entryFeePoints: prediction.entryFeePoints,
          entryFeeMyst: prediction.entryFeeMyst,
          pot: prediction.pot,
          mystPoolYes: prediction.mystPoolYes,
          mystPoolNo: prediction.mystPoolNo,
          resolved: prediction.resolved,
          winningOption: prediction.winningOption,
          endsAt: prediction.endsAt?.toISOString() ?? null,
          participantCount: prediction._count.bets,
          category: deriveCategory(prediction.id, prediction.title),
          createdAt: prediction.createdAt.toISOString(),
          updatedAt: prediction.updatedAt.toISOString(),
          optionStats,
          userBet,
        },
        userBalances,
        referralCode,
      });
    }

    return res.status(405).json({ ok: false, prediction: null, reason: 'Method not allowed' });
  } catch (e: any) {
    console.error('Prediction [id] API error:', e);
    return res.status(500).json({ ok: false, prediction: null, reason: 'Server error' });
  }
}
