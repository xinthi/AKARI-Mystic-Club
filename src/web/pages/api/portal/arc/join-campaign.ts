/**
 * API Route: POST /api/portal/arc/join-campaign
 * 
 * Allows authenticated users to join an ARC campaign by creating an arena_creators entry
 * for the active arena of the specified project.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface JoinCampaignBody {
  projectId: string;
}

type JoinCampaignResponse =
  | {
      ok: true;
      message: string;
      arenaId?: string;
      creatorId?: string;
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<JoinCampaignResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    const supabase = createPortalClient();
    
    // Get session token from cookies
    const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
    let sessionToken: string | null = null;
    for (const cookie of cookies) {
      if (cookie.startsWith('akari_session=')) {
        sessionToken = cookie.substring('akari_session='.length);
        break;
      }
    }

    if (!sessionToken) {
      return res.status(401).json({
        ok: false,
        error: 'Not authenticated',
      });
    }

    // Get user session
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid session',
      });
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return res.status(401).json({
        ok: false,
        error: 'Session expired',
      });
    }

    const userId = session.user_id;

    // Get user profile to get Twitter username
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, twitter_username')
      .eq('akari_user_id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({
        ok: false,
        error: 'User profile not found. Please ensure your X account is connected.',
      });
    }

    if (!profile.twitter_username) {
      return res.status(400).json({
        ok: false,
        error: 'Twitter username not found. Please connect your X account.',
      });
    }

    const { projectId } = req.body as JoinCampaignBody;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'projectId is required',
      });
    }

    // Find active arena for this project
    const { data: activeArena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, name, slug')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (arenaError || !activeArena) {
      return res.status(404).json({
        ok: false,
        error: 'No active arena found for this project',
      });
    }

    // Check if user is already in this arena
    const { data: existingCreator, error: checkError } = await supabase
      .from('arena_creators')
      .select('id')
      .eq('arena_id', activeArena.id)
      .ilike('twitter_username', profile.twitter_username)
      .single();

    if (existingCreator) {
      return res.status(200).json({
        ok: true,
        message: 'Already joined this campaign',
        arenaId: activeArena.id,
        creatorId: existingCreator.id,
      });
    }

    // Create arena_creators entry
    const { data: newCreator, error: createError } = await supabase
      .from('arena_creators')
      .insert({
        arena_id: activeArena.id,
        profile_id: profile.id,
        twitter_username: profile.twitter_username,
        arc_points: 0,
        ring: 'discovery',
        style: null,
        meta: {},
      })
      .select()
      .single();

    if (createError) {
      console.error('[API /portal/arc/join-campaign] Error creating creator:', createError);
      return res.status(500).json({
        ok: false,
        error: 'Failed to join campaign',
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Successfully joined campaign',
      arenaId: activeArena.id,
      creatorId: newCreator.id,
    });
  } catch (error: any) {
    console.error('[API /portal/arc/join-campaign] Error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error',
    });
  }
}
