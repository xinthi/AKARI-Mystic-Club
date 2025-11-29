import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { prisma } from '../../../../lib/prisma';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id);

  try {
    if (req.method === 'GET') {
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: { tasks: true },
      });

      if (!campaign) {
        return res.status(404).json({ ok: false, campaign: null, reason: 'Campaign not found' });
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
      const initData = (req.headers['x-telegram-init-data'] as string) || '';
      const telegramId = parseInitDataUser(initData, botToken);

      // Get user progress if authenticated
      let userProgress: { taskId: string; completed: boolean }[] = [];
      if (telegramId) {
        const dbUser = await prisma.user.findUnique({
          where: { telegramId },
          select: { id: true },
        });

        if (dbUser) {
          const progress = await prisma.campaignUserProgress.findMany({
            where: {
              userId: dbUser.id,
              campaignId: id,
            },
          });
          userProgress = progress.map((p) => ({
            taskId: p.taskId,
            completed: p.completed,
          }));
        }
      }

      const progressMap = new Map(userProgress.map((p) => [p.taskId, p.completed]));

      return res.status(200).json({
        ok: true,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          rewards: campaign.rewards,
          tasks: campaign.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            type: t.type,
            metadata: t.metadata,
          })),
          tasksWithStatus: campaign.tasks.map((t) => ({
            taskId: t.id,
            title: t.title,
            description: t.description,
            type: t.type,
            targetUrl: t.targetUrl,
            rewardPoints: t.rewardPoints,
            completed: progressMap.get(t.id) || false,
          })),
          endsAt: campaign.endsAt.toISOString(),
          starsFee: campaign.starsFee,
        },
      });
    }

    return res.status(405).json({ ok: false, campaign: null, reason: 'Method not allowed' });
  } catch (e: any) {
    console.error('Campaign [id] API error:', e);
    return res.status(500).json({ ok: false, campaign: null, reason: 'Server error' });
  }
}
