import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma, withDbRetry } from '../../../lib/prisma';
import { getUserFromRequest } from '../../../lib/telegram-auth';

type Data =
  | { ok: true; predictions: any[] }
  | { ok: false; predictions: any[]; reason: string };

async function seedPredictions() {
  const count = await withDbRetry(() => prisma.prediction.count());
  if (count > 0) return;

  const btcEnds = new Date('2025-12-31T23:59:59Z');
  const ethEnds = new Date('2026-12-31T23:59:59Z');
  const electionEnds = new Date('2025-11-05T23:59:59Z');
  const fedEnds = new Date('2025-06-30T23:59:59Z');

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
      {
        id: 'trump-2024',
        title: 'Will Trump win 2024 US election?',
        description:
          'Market resolves based on official US election results.',
        options: ['Yes', 'No'],
        entryFeeStars: 0,
        entryFeePoints: 75,
        pot: 0,
        resolved: false,
        endsAt: electionEnds,
        participantCount: 0,
      },
      {
        id: 'fed-rate-cut',
        title: 'Will Fed cut rates before July 2025?',
        description:
          'Resolves Yes if the Federal Reserve announces at least one interest rate cut before July 1, 2025.',
        options: ['Yes', 'No'],
        entryFeeStars: 0,
        entryFeePoints: 50,
        pot: 0,
        resolved: false,
        endsAt: fedEnds,
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
      const where: { resolved?: boolean; status?: string } = {
        status: 'ACTIVE', // Only show ACTIVE predictions
      };
      if (resolved === 'false') where.resolved = false;
      if (resolved === 'true') where.resolved = true;

      const predictions = await withDbRetry(() => prisma.prediction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { bets: true },
          },
        },
      }));

      // Helper to derive category from prediction id/title or use database category
      const deriveCategory = (id: string, title: string, dbCategory: string | null): string => {
        // If database has a category, use it (map TRENDING_CRYPTO to Crypto for frontend)
        if (dbCategory) {
          if (dbCategory === 'TRENDING_CRYPTO') {
            return 'Crypto';
          }
          // Map other database categories to frontend categories
          if (dbCategory === 'CRYPTO' || dbCategory === 'TRENDING_CRYPTO') {
            return 'Crypto';
          }
          if (dbCategory === 'POLITICS') {
            return 'Politics';
          }
          if (dbCategory === 'MARKETS') {
            return 'Markets';
          }
          // For any other category, fall through to derivation
        }
        
        // Fallback: derive from id/title if no database category
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
        return 'Community';
      };

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
        endsAt: p.endsAt?.toISOString() ?? null,
        participantCount: p._count.bets,
        category: deriveCategory(p.id, p.title, p.category),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      }));

      return res.status(200).json({ ok: true, predictions: mapped });
    }

    if (req.method === 'POST') {
      // Require authentication
      const user = await getUserFromRequest(req, prisma);
      if (!user) {
        return res.status(401).json({ ok: false, predictions: [], reason: 'Unauthorized' });
      }

      // Admin-only check (if ADMIN_TELEGRAM_ID is set)
      const adminTelegramId = process.env.ADMIN_TELEGRAM_ID;
      if (adminTelegramId && user.telegramId !== adminTelegramId) {
        return res.status(403).json({ ok: false, predictions: [], reason: 'Forbidden - Admin only' });
      }

      const { title, description, options, entryFeeStars, entryFeePoints, endsAt } = req.body;

      // Validate required fields
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ ok: false, predictions: [], reason: 'Title is required' });
      }

      // Validate endsAt
      const endsAtDate = new Date(endsAt);
      if (!endsAt || isNaN(endsAtDate.getTime())) {
        return res.status(400).json({ ok: false, predictions: [], reason: 'Invalid endsAt date' });
      }
      if (endsAtDate.getTime() <= Date.now()) {
        return res.status(400).json({ ok: false, predictions: [], reason: 'endsAt must be in the future' });
      }

      const created = await withDbRetry(() => prisma.prediction.create({
        data: {
          title,
          description,
          options: options || ['Yes', 'No'],
          entryFeeStars: Number(entryFeeStars || 0),
          entryFeePoints: Number(entryFeePoints || 0),
          endsAt: endsAtDate,
        },
      }));

      return res.status(201).json({ ok: true, predictions: [created] });
    }

    return res.status(405).json({ ok: false, predictions: [], reason: 'Method not allowed' });
  } catch (e: any) {
    console.error('Predictions index API error:', e);
    return res.status(500).json({ ok: false, predictions: [], reason: 'Server error' });
  }
}
