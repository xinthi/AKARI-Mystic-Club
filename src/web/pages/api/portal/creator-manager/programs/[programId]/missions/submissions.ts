/**
 * API Route: GET /api/portal/creator-manager/programs/[programId]/missions/submissions
 * 
 * Get all mission submissions for a program (moderator view)
 * 
 * Returns submissions grouped by mission with creator info
 * 
 * Permissions: Only project owner/admin/moderator can view submissions
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface MissionSubmission {
  id: string;
  mission_id: string;
  mission_title: string;
  creator_profile_id: string;
  creator_username: string;
  creator_name: string | null;
  status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
  post_url: string | null;
  post_tweet_id: string | null;
  last_update_at: string;
}

type SubmissionsResponse =
  | { ok: true; submissions: MissionSubmission[] }
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string } | null> {
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

  return {
    userId: session.user_id,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SubmissionsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Get current user
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const currentUser = await getCurrentUser(supabase, sessionToken);
  if (!currentUser) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  try {
    // Get program to find project_id
    const { data: program, error: programError } = await supabase
      .from('creator_manager_programs')
      .select('project_id')
      .eq('id', programId)
      .single();

    if (programError || !program) {
      return res.status(404).json({ ok: false, error: 'Program not found' });
    }

    // Check permissions
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
    if (!permissions.isAdmin && !permissions.isModerator && !permissions.isOwner && !permissions.isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'Only project admins and moderators can view submissions' });
    }

    // Get all mission progress for this program
    const { data: progressList, error: progressError } = await supabase
      .from('creator_manager_mission_progress')
      .select(`
        id,
        mission_id,
        creator_profile_id,
        status,
        post_url,
        post_tweet_id,
        last_update_at,
        creator_manager_missions!inner (
          title
        )
      `)
      .eq('program_id', programId)
      .order('last_update_at', { ascending: false });

    if (progressError) {
      console.error('[Submissions] Error fetching progress:', progressError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch submissions' });
    }

    // Get creator profile info
    const creatorProfileIds = [...new Set((progressList || []).map((p: any) => p.creator_profile_id))];
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, name')
      .in('id', creatorProfileIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    // Build response
    const submissions: MissionSubmission[] = (progressList || []).map((p: any) => {
      const profile = profileMap.get(p.creator_profile_id);
      return {
        id: p.id,
        mission_id: p.mission_id,
        mission_title: p.creator_manager_missions?.title || 'Unknown Mission',
        creator_profile_id: p.creator_profile_id,
        creator_username: profile?.username || 'unknown',
        creator_name: profile?.name || null,
        status: p.status,
        post_url: p.post_url,
        post_tweet_id: p.post_tweet_id,
        last_update_at: p.last_update_at,
      };
    });

    return res.status(200).json({ ok: true, submissions });
  } catch (error: any) {
    console.error('[Submissions] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

