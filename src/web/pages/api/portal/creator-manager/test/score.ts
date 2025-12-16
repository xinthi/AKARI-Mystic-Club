/**
 * API Route: POST /api/portal/creator-manager/test/score
 * 
 * SuperAdmin-only testing endpoint for Creator Manager ARC scoring.
 * 
 * Input:
 *   {
 *     programId: string,
 *     creatorProfileId: string,
 *     engagementScore: number,  // Optional: if provided, uses this directly
 *     likes?: number,
 *     retweets?: number,
 *     quotes?: number,
 *     replies?: number,
 *     contentType?: ContentType,
 *     sentiment?: 'positive' | 'neutral' | 'negative',
 *     ring?: string,  // Not used in current formula, kept for compatibility
 *   }
 * 
 * Behavior:
 *   - Uses shared ARC scoring function to compute points
 *   - Updates creator_manager_creators.arc_points
 *   - Returns new arc_points total
 * 
 * Security: SuperAdmin only
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  calculateArcPointsForCreatorManager,
  addArcPointsForCreatorManager,
  type ContentType,
} from '@/lib/arc/creator-manager-scoring';

// =============================================================================
// TYPES
// =============================================================================

interface TestScoreRequest {
  programId: string;
  creatorProfileId: string;
  engagementScore?: number; // Legacy: if provided, uses simple formula
  likes?: number;
  retweets?: number;
  quotes?: number;
  replies?: number;
  contentType?: ContentType;
  sentiment?: 'positive' | 'neutral' | 'negative';
  ring?: string; // Not used in current formula, kept for compatibility
}

type TestScoreResponse =
  | {
      ok: true;
      pointsAwarded: number;
      newTotalPoints: number;
      breakdown?: {
        basePoints: number;
        sentimentMultiplier: number;
        engagementScore: number;
        finalPoints: number;
      };
    }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  // Check akari_user_roles table
  const { data: userRoles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  if (userRoles && userRoles.length > 0) {
    return true;
  }

  // Also check profiles.real_roles via Twitter username
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .eq('provider', 'x')
    .single();

  if (xIdentity?.username) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('real_roles')
      .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
      .single();

    if (profile?.real_roles?.includes('super_admin')) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestScoreResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Get current user
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return res.status(401).json({ ok: false, error: 'Session expired' });
  }

  // Check if user is super admin
  const isSuperAdmin = await checkSuperAdmin(supabase, session.user_id);
  if (!isSuperAdmin) {
    return res.status(403).json({ ok: false, error: 'Forbidden: SuperAdmin access required' });
  }

  const body: TestScoreRequest = req.body;

  // Validate required fields
  if (!body.programId || !body.creatorProfileId) {
    return res.status(400).json({ ok: false, error: 'programId and creatorProfileId are required' });
  }

  try {
    // Verify creator exists in program
    const { data: creator, error: creatorError } = await supabase
      .from('creator_manager_creators')
      .select('arc_points')
      .eq('program_id', body.programId)
      .eq('creator_profile_id', body.creatorProfileId)
      .single();

    if (creatorError || !creator) {
      return res.status(404).json({ ok: false, error: 'Creator not found in this program' });
    }

    // Calculate ARC points
    let pointsToAdd: number;
    let breakdown: {
      basePoints: number;
      sentimentMultiplier: number;
      engagementScore: number;
      finalPoints: number;
    } | undefined;

    // If engagementScore is provided (legacy mode), use simple formula
    // Otherwise, use full scoring with engagement metrics
    if (body.engagementScore !== undefined) {
      // Legacy simple formula (for backward compatibility)
      const sentiment = body.sentiment || 'neutral';
      const sentimentMult = sentiment === 'positive' ? 1.2 : sentiment === 'negative' ? 0.5 : 1.0;
      pointsToAdd = Math.round(body.engagementScore * sentimentMult);
      
      breakdown = {
        basePoints: body.engagementScore,
        sentimentMultiplier: sentimentMult,
        engagementScore: body.engagementScore,
        finalPoints: pointsToAdd,
      };
    } else {
      // Use full scoring formula
      const contentType = body.contentType || 'other';
      const sentiment = body.sentiment || 'neutral';
      const engagement = {
        likes: body.likes || 0,
        retweets: body.retweets || 0,
        quotes: body.quotes || 0,
        replies: body.replies || 0,
      };

      // Get detailed breakdown
      const { calculateArcPointsDetailed } = await import('@/lib/arc/creator-manager-scoring');
      const detailed = calculateArcPointsDetailed({
        contentType,
        sentiment,
        engagement,
      });

      pointsToAdd = detailed.deltaPoints;
      breakdown = {
        basePoints: detailed.basePoints,
        sentimentMultiplier: detailed.sentimentMultiplier,
        engagementScore: detailed.engagementScore,
        finalPoints: detailed.deltaPoints,
      };
    }

    // Add points to creator
    const result = await addArcPointsForCreatorManager(
      body.programId,
      body.creatorProfileId,
      pointsToAdd
    );

    if (!result.success) {
      return res.status(500).json({ ok: false, error: result.error || 'Failed to add ARC points' });
    }

    return res.status(200).json({
      ok: true,
      pointsAwarded: result.pointsAwarded,
      newTotalPoints: result.newTotalPoints,
      breakdown,
    });
  } catch (error: any) {
    console.error('[Test Score] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

