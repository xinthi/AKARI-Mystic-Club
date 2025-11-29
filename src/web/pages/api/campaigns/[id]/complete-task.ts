/**
 * Complete Campaign Task API
 *
 * POST: Mark a task as completed for the current user
 * 
 * - For Telegram tasks: Verifies user has joined the group/channel
 * - For X tasks: Marks as complete (can't verify via basic API)
 * - For other tasks: Marks as complete
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';
import { getUserFromRequest, getTelegramUserFromRequest } from '../../../../lib/telegram-auth';

// Verify if a Telegram user is a member of a chat/channel
async function verifyTelegramMembership(
  telegramUserId: string,
  chatIdentifier: string
): Promise<{ isMember: boolean; error?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[VerifyMembership] No bot token');
    return { isMember: false, error: 'Bot not configured' };
  }

  try {
    // Extract chat username from URL (t.me/chatname)
    let chatId = chatIdentifier;
    
    // Handle t.me URLs
    if (chatIdentifier.includes('t.me/')) {
      const match = chatIdentifier.match(/t\.me\/([^/?]+)/);
      if (match) {
        chatId = '@' + match[1];
      }
    }
    
    // If it's just a username without @, add it
    if (!chatId.startsWith('@') && !chatId.startsWith('-') && !chatId.match(/^\d+$/)) {
      chatId = '@' + chatId;
    }

    console.log(`[VerifyMembership] Checking user ${telegramUserId} in chat ${chatId}`);

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${telegramUserId}`
    );

    const data = await response.json();

    if (!data.ok) {
      console.warn('[VerifyMembership] API error:', data.description);
      // If bot is not admin or can't access the chat, we can't verify
      if (data.description?.includes('chat not found') || data.description?.includes('bot is not')) {
        return { isMember: false, error: 'Cannot verify membership. Please join the group/channel.' };
      }
      return { isMember: false, error: data.description || 'Verification failed' };
    }

    const status = data.result?.status;
    // Valid member statuses
    const memberStatuses = ['member', 'administrator', 'creator', 'restricted'];
    const isMember = memberStatuses.includes(status);

    console.log(`[VerifyMembership] User ${telegramUserId} status in ${chatId}: ${status} (member: ${isMember})`);

    if (!isMember && status === 'left') {
      return { isMember: false, error: 'You need to join the Telegram group/channel first.' };
    }
    if (!isMember && status === 'kicked') {
      return { isMember: false, error: 'You have been removed from this group/channel.' };
    }

    return { isMember };
  } catch (error: any) {
    console.error('[VerifyMembership] Error:', error.message);
    return { isMember: false, error: 'Failed to verify membership' };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get authenticated user
  const user = await getUserFromRequest(req, prisma);
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  // Get Telegram user data for verification
  const telegramUser = getTelegramUserFromRequest(req);

  const campaignId = String(req.query.id);
  const { taskId } = req.body as { taskId?: string };

  if (!taskId) {
    return res.status(400).json({ ok: false, error: 'Missing taskId' });
  }

  try {
    // Find campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Check campaign status
    if (campaign.status !== 'ACTIVE') {
      return res.status(400).json({ ok: false, error: 'Campaign is not active' });
    }

    // Verify task exists and belongs to campaign
    const task = await prisma.campaignTask.findFirst({
      where: {
        id: taskId,
        campaignId,
      },
    });

    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    // Check if task was already completed - prevent double points
    const existingProgress = await prisma.campaignUserProgress.findFirst({
      where: {
        userId: user.id,
        taskId,
      },
    });

    if (existingProgress?.completed) {
      return res.status(200).json({
        ok: true,
        alreadyCompleted: true,
        message: 'Task was already completed',
      });
    }

    // ============================================
    // TELEGRAM VERIFICATION
    // ============================================
    if (task.type === 'TELEGRAM_JOIN' && task.targetUrl) {
      if (!telegramUser) {
        return res.status(400).json({
          ok: false,
          error: 'Telegram authentication required for verification',
        });
      }

      const verification = await verifyTelegramMembership(
        String(telegramUser.id),
        task.targetUrl
      );

      if (!verification.isMember) {
        return res.status(400).json({
          ok: false,
          error: verification.error || 'Please join the Telegram group/channel first.',
          needsAction: true,
          actionUrl: task.targetUrl,
        });
      }
    }

    // ============================================
    // X TASKS (cannot verify with basic API)
    // ============================================
    // For X_FOLLOW, X_LIKE, X_RETWEET - we trust the user
    // The frontend already redirected them to the target URL

    // ============================================
    // MARK TASK AS COMPLETED
    // ============================================
    const pointsToAward = task.rewardPoints || 10;

    if (existingProgress) {
      // Progress exists but not completed - update it
      await prisma.campaignUserProgress.update({
        where: { id: existingProgress.id },
        data: {
          completed: true,
          completedAt: new Date(),
        },
      });
    } else {
      // No progress exists - create it
      await prisma.campaignUserProgress.create({
        data: {
          userId: user.id,
          campaignId,
          taskId,
          completed: true,
          completedAt: new Date(),
        },
      });
    }

    // Award aXP points
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

    // Check if all tasks are now completed
    const allTasks = await prisma.campaignTask.findMany({
      where: { campaignId },
    });
    const completedTasks = allProgress.filter(p => p.completed).length;
    const allComplete = completedTasks >= allTasks.length;

    // Build success message
    let message = `Task completed! +${pointsToAward} aXP`;
    if (allComplete) {
      message += ' 🎉 All tasks done!';
    }

    console.log(`[CompleteTask] User ${user.id} completed task ${taskId} (+${pointsToAward} aXP)`);

    return res.status(200).json({
      ok: true,
      message,
      pointsAwarded: pointsToAward,
      progress: allProgress.map((p) => ({
        taskId: p.taskId,
        completed: p.completed,
      })),
      allComplete,
    });
  } catch (e: any) {
    console.error('[CompleteTask] Error:', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
