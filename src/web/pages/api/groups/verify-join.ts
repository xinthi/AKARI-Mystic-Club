/**
 * Verify User Joined Group
 * 
 * POST /api/groups/verify-join
 * Body: { groupId: string, telegramId: string }
 * 
 * Uses the bot to check if a user is a member of a group/channel.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { hasUserJoinedGroup } from '../../../lib/telegram-bot';

interface VerifyResponse {
  ok: boolean;
  joined?: boolean;
  message?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { groupId, telegramId } = req.body;

  if (!groupId || typeof groupId !== 'string') {
    return res.status(400).json({ ok: false, message: 'groupId is required' });
  }

  if (!telegramId || typeof telegramId !== 'string') {
    return res.status(400).json({ ok: false, message: 'telegramId is required' });
  }

  try {
    const joined = await hasUserJoinedGroup(telegramId, groupId);
    
    return res.status(200).json({
      ok: true,
      joined,
    });
  } catch (error: any) {
    console.error('[Groups/VerifyJoin] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Failed to verify membership' });
  }
}

