import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

type Data =
  | { ok: true; prediction: any }
  | { ok: false; prediction: null; reason: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  const id = String(req.query.id);

  try {
    if (req.method === 'GET') {
      const prediction = await prisma.prediction.findUnique({
        where: { id },
        include: {
          _count: {
            select: { bets: true },
          },
        },
      });

      if (!prediction) {
        return res.status(404).json({ ok: false, prediction: null, reason: 'Prediction not found' });
      }

      // Build optionStats array (stub with zeros for now, can compute real stats later)
      const optionStats = (prediction.options as string[]).map((option: string, index: number) => ({
        option,
        index,
        betCount: 0,
        totalStars: 0,
        totalPoints: 0,
      }));

      // Get user's existing bet if authenticated
      let userBet: any = null;
      const user = await getUserFromRequest(req, prisma);
      if (user) {
        const existingBet = await prisma.bet.findFirst({
          where: {
            predictionId: prediction.id,
            userId: user.id,
          },
        });

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
          };
        }
      }

      return res.status(200).json({
        ok: true,
        prediction: {
          id: prediction.id,
          title: prediction.title,
          description: prediction.description,
          options: prediction.options,
          entryFeeStars: prediction.entryFeeStars,
          entryFeePoints: prediction.entryFeePoints,
          pot: prediction.pot,
          resolved: prediction.resolved,
          winningOption: prediction.winningOption,
          endsAt: prediction.endsAt.toISOString(),
          participantCount: prediction._count.bets,
          createdAt: prediction.createdAt.toISOString(),
          updatedAt: prediction.updatedAt.toISOString(),
          optionStats,
          userBet,
        },
      });
    }

    return res.status(405).json({ ok: false, prediction: null, reason: 'Method not allowed' });
  } catch (e: any) {
    console.error('Prediction [id] API error:', e);
    return res.status(500).json({ ok: false, prediction: null, reason: 'Server error' });
  }
}
