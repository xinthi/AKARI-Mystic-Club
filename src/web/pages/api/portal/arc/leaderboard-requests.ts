/**
 * API Route: POST /api/portal/arc/leaderboard-requests
 * 
 * Allows authenticated users to request ARC leaderboard access for a project.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { canRequestLeaderboard } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardRequestPayload {
  projectId: string;
  justification?: string | null;
}

type LeaderboardRequestResponse =
  | { ok: true; requestId: string; status: 'pending' | 'existing' }
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

async function getCurrentUserProfile(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ profileId: string } | null> {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  // Get user's Twitter username to find profile
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  if (!xIdentity?.username) {
    return null;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
    .single();

  if (!profile) {
    return null;
  }

  return {
    profileId: profile.id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LeaderboardRequestResponse | { ok: true; request: any } | { ok: false; error: string }>
) {
  // Handle GET - fetch user's request for a project
  if (req.method === 'GET') {
    const sessionToken = getSessionToken(req);
    
    // If not authenticated, return null request (not an error)
    if (!sessionToken) {
      return res.status(200).json({ ok: true, request: null });
    }

    try {
      const supabase = getSupabaseAdmin();
      const userProfile = await getCurrentUserProfile(supabase, sessionToken);
      
      // If profile not found, return null request (not an error)
      if (!userProfile) {
        return res.status(200).json({ ok: true, request: null });
      }

      const { projectId } = req.query;
      if (!projectId || typeof projectId !== 'string') {
        return res.status(400).json({ ok: false, error: 'projectId is required' });
      }

      // Fetch user's request for this project
      const { data: request, error: requestError } = await supabase
        .from('arc_leaderboard_requests')
        .select('id, status, justification, created_at')
        .eq('project_id', projectId)
        .eq('requested_by', userProfile.profileId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (requestError) {
        console.error('[Leaderboard Request API] Fetch error:', requestError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch request' });
      }

      if (!request) {
        return res.status(200).json({ ok: true, request: null });
      }

      return res.status(200).json({ ok: true, request });
    } catch (error: any) {
      console.error('[Leaderboard Request API] Error:', error);
      return res.status(500).json({ ok: false, error: 'Server error' });
    }
  }

  // Handle POST - create request
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Get session token
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get current user's profile
    const userProfile = await getCurrentUserProfile(supabase, sessionToken);
    if (!userProfile) {
      return res.status(401).json({ ok: false, error: 'User profile not found' });
    }

    // Parse and validate request body
    const { projectId, justification } = req.body as Partial<LeaderboardRequestPayload>;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'projectId is required',
      });
    }

    // Verify project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        ok: false,
        error: 'Project not found',
      });
    }

    // Get user ID from session for permission check
    const { data: session } = await supabase
      .from('akari_user_sessions')
      .select('user_id')
      .eq('session_token', sessionToken)
      .single();

    if (!session?.user_id) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check if user can request leaderboard (owner/admin/moderator only)
    const canRequest = await canRequestLeaderboard(supabase, session.user_id, projectId);
    if (!canRequest) {
      return res.status(403).json({
        ok: false,
        error: 'Only project admins/founders can request a leaderboard for this project.',
      });
    }

    // Check if user already has a pending request for this project (dedupe)
    const { data: existingRequest, error: checkError } = await supabase
      .from('arc_leaderboard_requests')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('requested_by', userProfile.profileId)
      .eq('status', 'pending')
      .maybeSingle();

    if (checkError) {
      console.error('[Leaderboard Request API] Check error:', checkError);
      return res.status(500).json({ ok: false, error: 'Failed to check existing requests' });
    }

    // If pending request exists, return it
    if (existingRequest) {
      return res.status(200).json({
        ok: true,
        requestId: existingRequest.id,
        status: 'existing',
      });
    }

    // Insert new request
    const { data: newRequest, error: insertError } = await supabase
      .from('arc_leaderboard_requests')
      .insert({
        project_id: projectId,
        requested_by: userProfile.profileId,
        justification: justification || null,
        status: 'pending',
        decided_by: null,
        decided_at: null,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[Leaderboard Request API] Insert error:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to create request' });
    }

    return res.status(200).json({
      ok: true,
      requestId: newRequest.id,
      status: 'pending',
    });
  } catch (error: any) {
    console.error('[Leaderboard Request API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

