import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { prisma } from '../../../lib/prisma';

type Data =
  | { ok: true; campaigns: any[] }
  | { ok: false; campaigns: any[]; reason: string };

/**
 * Parse Telegram initData to get user telegramId
 */
function parseInitDataUser(initData: string, botToken: string): string | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');
    const dataCheckArr: string[] = [];
    Array.from(params.keys())
      .sort()
      .forEach((key) => {
        const value = params.get(key);
        if (value !== null) {
          dataCheckArr.push(`${key}=${value}`);
        }
      });

    const dataCheckString = dataCheckArr.join('\n');
    const secret = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    if (hmac !== hash) return null;

    const userJson = params.get('user');
    if (!userJson) return null;

    const parsed = JSON.parse(userJson);
    return String(parsed.id);
  } catch {
    return null;
  }
}

async function seedCampaigns() {
  const count = await prisma.campaign.count();
  if (count > 0) return;

  const endsAt = new Date('2025-12-31T23:59:59Z');

  const campaign = await prisma.campaign.create({
    data: {
      name: 'Akari OG Quest',
      description: 'Complete the OG tasks to become an early Akari Mystic.',
      rewards: 'Akari OG role + bonus EP',
      endsAt,
      starsFee: 0,
    },
  });

  await prisma.campaignTask.createMany({
    data: [
      {
        campaignId: campaign.id,
        title: 'Follow Akari on X',
        description: 'Follow our official X account @AkariOfficial',
        type: 'follow_x',
        metadata: { handle: 'AkariOfficial' },
      },
      {
        campaignId: campaign.id,
        title: 'Retweet the Akari intro thread',
        description: 'Help spread the word about Akari Mystic Club',
        type: 'retweet',
        metadata: { tweetUrl: 'https://x.com/AkariOfficial/status/placeholder' },
      },
      {
        campaignId: campaign.id,
        title: 'Join the Akari Telegram',
        description: 'Join our official Telegram community',
        type: 'join_telegram',
        metadata: { inviteLink: 'https://t.me/AkariMysticClub' },
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
      // Seed campaigns if table is empty
      await seedCampaigns();

      const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
      const initData = (req.headers['x-telegram-init-data'] as string) || '';
      const telegramId = parseInitDataUser(initData, botToken);

      // Find user if authenticated
      let dbUser: { id: string } | null = null;
      if (telegramId) {
        dbUser = await prisma.user.findUnique({
          where: { telegramId },
          select: { id: true },
        });
      }

      const campaigns = await prisma.campaign.findMany({
        include: {
          tasks: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get user progress if authenticated
      let userProgressMap: Map<string, boolean> = new Map();
      if (dbUser) {
        const progress = await prisma.campaignUserProgress.findMany({
          where: { userId: dbUser.id },
        });
        progress.forEach((p) => {
          userProgressMap.set(p.taskId, p.completed);
        });
      }

      const shaped = campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        rewards: c.rewards,
        tasks: c.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          type: t.type,
          metadata: t.metadata,
        })),
        tasksWithStatus: c.tasks.map((t) => ({
          taskId: t.id,
          title: t.title,
          description: t.description,
          type: t.type,
          completed: userProgressMap.get(t.id) || false,
        })),
        endsAt: c.endsAt.toISOString(),
        starsFee: c.starsFee,
      }));

      return res.status(200).json({ ok: true, campaigns: shaped });
    }

    return res.status(405).json({ ok: false, campaigns: [], reason: 'Method not allowed' });
  } catch (e: any) {
    console.error('Campaigns API error:', e);
    return res.status(500).json({ ok: false, campaigns: [], reason: 'Server error' });
  }
}
