/**
 * Group Credibility Summary
 * 
 * GET /api/groups/:id/credibility-summary
 * 
 * Returns credibility stats for known users in a group.
 * Note: This is a simplified version - we can enhance it later
 * with a TgGroupMember mapping table.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../../lib/prisma';

interface CredibilityResponse {
  ok: boolean;
  groupId?: string;
  groupTitle?: string;
  totalKnownMembers?: number;
  highCredCount?: number;
  score?: number;
  message?: string;
}

// Minimum credibility score to be considered "high credibility"
const HIGH_CRED_THRESHOLD = 3;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CredibilityResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ ok: false, message: 'Invalid group ID' });
  }

  try {
    // Get the group info
    const group = await prisma.tgGroup.findUnique({
      where: { id },
    });

    if (!group) {
      return res.status(404).json({ ok: false, message: 'Group not found' });
    }

    // For now, we'll return basic stats from all users in the platform
    // In a more complete implementation, we'd track group membership
    // via a TgGroupMember table
    
    // Count all users with credibility >= threshold
    const totalUsers = await prisma.user.count();
    const highCredUsers = await prisma.user.count({
      where: {
        credibilityScore: { gte: HIGH_CRED_THRESHOLD },
      },
    });

    // Calculate score (percentage of high-cred users)
    const score = totalUsers > 0 ? highCredUsers / totalUsers : 0;

    return res.status(200).json({
      ok: true,
      groupId: group.id,
      groupTitle: group.title,
      totalKnownMembers: totalUsers,
      highCredCount: highCredUsers,
      score: parseFloat(score.toFixed(2)),
    });
  } catch (error: any) {
    console.error('[Groups/Credibility] Error:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

