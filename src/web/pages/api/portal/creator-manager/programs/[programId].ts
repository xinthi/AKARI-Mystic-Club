/**
 * API Route: GET /api/portal/creator-manager/programs/[programId]
 * 
 * Get a single Creator Manager program by ID
 * Requires project admin/moderator/owner permissions
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface Program {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  objective: string | null; // May not exist if migration not run
  visibility: 'private' | 'public' | 'hybrid';
  status: 'active' | 'paused' | 'ended';
  start_at: string | null;
  end_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

type ProgramResponse =
  | { ok: true; program: Program }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

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
  res: NextApiResponse<ProgramResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { programId } = req.query;

    if (!programId || typeof programId !== 'string') {
      return res.status(400).json({ ok: false, error: 'programId is required' });
    }

    // Get current user
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const currentUser = await getCurrentUser(supabase, sessionToken);
    if (!currentUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
    }

    // Get program details - try with objective field first, fallback if column doesn't exist
    let programQuery = supabase
      .from('creator_manager_programs')
      .select('*')
      .eq('id', programId)
      .single();

    const { data: programData, error: programError } = await programQuery;

    // If error is "column does not exist" (objective column), retry with explicit column list
    if (programError && programError.message?.includes('column') && programError.message?.includes('does not exist')) {
      console.warn('[Creator Manager Program] Objective column not found, fetching without it');
      const { data: retryData, error: retryError } = await supabase
        .from('creator_manager_programs')
        .select('id, project_id, title, description, visibility, status, start_at, end_at, created_by, created_at, updated_at')
        .eq('id', programId)
        .single();

      if (retryError || !retryData) {
        return res.status(404).json({ ok: false, error: 'Program not found' });
      }

      // Add objective as null since column doesn't exist
      const program: Program = {
        ...retryData,
        objective: null,
      };

      // Check permissions
      const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
      
      if (!permissions.canManage) {
        return res.status(403).json({ ok: false, error: 'You do not have permission to view this program' });
      }

      return res.status(200).json({ ok: true, program });
    }

    if (programError || !programData) {
      return res.status(404).json({ ok: false, error: 'Program not found' });
    }

    // Check permissions
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, programData.project_id);
    
    if (!permissions.canManage) {
      return res.status(403).json({ ok: false, error: 'You do not have permission to view this program' });
    }

    return res.status(200).json({ ok: true, program: programData as Program });
  } catch (error: any) {
    console.error('[Creator Manager Program] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
