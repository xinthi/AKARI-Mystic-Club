import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { prisma } from '../../../../lib/prisma';

/**
 * Parse and verify Telegram initData, return telegramId
 */
function verifyAndParseInitData(initData: string, botToken: string): string | null {
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
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'Method not allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ ok: false, reason: 'Server misconfigured' });
  }

  // Authenticate via initData header
  const initData = (req.headers['x-telegram-init-data'] as string) || '';
  const telegramId = verifyAndParseInitData(initData, botToken);

  if (!telegramId) {
    return res.status(401).json({ ok: false, reason: 'Unauthorized' });
  }

  const campaignId = String(req.query.id);
  const { taskId } = req.body as { taskId?: string };

  if (!taskId) {
    return res.status(400).json({ ok: false, reason: 'Missing taskId' });
  }

  try {
    // Find user
    const user = await prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      return res.status(404).json({ ok: false, reason: 'User not found' });
    }

    // Find campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({ ok: false, reason: 'Campaign not found' });
    }

    // Verify task exists and belongs to campaign
    const task = await prisma.campaignTask.findFirst({
      where: {
        id: taskId,
        campaignId,
      },
    });

    if (!task) {
      return res.status(404).json({ ok: false, reason: 'Task not found' });
    }

    // Upsert progress
    await prisma.campaignUserProgress.upsert({
      where: {
        userId_taskId: {
          userId: user.id,
          taskId,
        },
      },
      update: {
        completed: true,
        completedAt: new Date(),
      },
      create: {
        userId: user.id,
        campaignId,
        taskId,
        completed: true,
        completedAt: new Date(),
      },
    });

    // Award some points (e.g., 10 points per task)
    const pointsToAward = 10;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        points: { increment: pointsToAward },
      },
    });

    // Get updated progress for this campaign
    const allProgress = await prisma.campaignUserProgress.findMany({
      where: {
        userId: user.id,
        campaignId,
      },
    });

    return res.status(200).json({
      ok: true,
      message: `Task completed! +${pointsToAward} EP`,
      progress: allProgress.map((p) => ({
        taskId: p.taskId,
        completed: p.completed,
      })),
    });
  } catch (e: any) {
    console.error('Complete-task API error:', e);
    return res.status(500).json({ ok: false, reason: 'Server error' });
  }
}
