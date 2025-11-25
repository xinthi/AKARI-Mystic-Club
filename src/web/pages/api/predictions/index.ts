import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

type Data =
  | { ok: true; predictions: any[] }
  | { ok: false; predictions: any[]; reason: string };

async function seedPredictions() {
  const count = await prisma.prediction.count();
  if (count > 0) return;

  const btcEnds = new Date('2025-12-31T23:59:59Z');
  const ethEnds = new Date('2026-12-31T23:59:59Z');

  await prisma.prediction.createMany({
    data: [
      {
        id: 'btc-100k-2025',
        title: 'Will BTC close above $100k before 31 Dec 2025?',
        description:
          'Market resolves when daily close on a major USD exchange is recorded above $100,000 before 31 Dec 2025.',
        options: ['Yes', 'No'],
        entryFeeStars: 0,
        entryFeePoints: 100,
        pot: 0,
        resolved: false,
        endsAt: btcEnds,
        participantCount: 0,
      },
      {
        id: 'eth-10k-2026',
        title: 'Will ETH close above $10k before 31 Dec 2026?',
        description:
          'Market resolves when ETH daily close trades above $10,000 before the end of 2026.',
        options: ['Yes', 'No'],
        entryFeeStars: 0,
        entryFeePoints: 50,
        pot: 0,
        resolved: false,
        endsAt: ethEnds,
        participantCount: 0,
      },
    ],
    skipDuplicates: true,
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>
) {
  try {
    if (req.method === 'GET') {
      // Seed predictions if table is empty
      await seedPredictions();

      const { resolved } = req.query;
      const where: { resolved?: boolean } = {};
      if (resolved === 'false') where.resolved = false;
      if (resolved === 'true') where.resolved = true;

      const predictions = await prisma.prediction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { bets: true },
          },
        },
      });

      // Map to return participantCount based on actual bets count
      const mapped = predictions.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        options: p.options,
        entryFeeStars: p.entryFeeStars,
        entryFeePoints: p.entryFeePoints,
        pot: p.pot,
        resolved: p.resolved,
        winningOption: p.winningOption,
        endsAt: p.endsAt.toISOString(),
        participantCount: p._count.bets,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));

      return res.status(200).json({ ok: true, predictions: mapped });
    }

    if (req.method === 'POST') {
      const { title, description, options, entryFeeStars, entryFeePoints, endsAt } = req.body;

      const created = await prisma.prediction.create({
        data: {
          title,
          description,
          options: options || ['Yes', 'No'],
          entryFeeStars: Number(entryFeeStars || 0),
          entryFeePoints: Number(entryFeePoints || 0),
          endsAt: new Date(endsAt),
        },
      });

      return res.status(201).json({ ok: true, predictions: [created] });
    }

    return res.status(405).json({ ok: false, predictions: [], reason: 'Method not allowed' });
  } catch (e: any) {
    console.error('Predictions index API error:', e);
    return res.status(500).json({ ok: false, predictions: [], reason: 'Server error' });
  }
}
