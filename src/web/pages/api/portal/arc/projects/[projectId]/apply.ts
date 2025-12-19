/**
 * API Route: POST /api/portal/arc/projects/[projectId]/apply
 * 
 * Submit an ARC access approval request for a project.
 * Only project owners/admins/moderators or official X accounts can apply.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { canApplyForArcAccess, getProfileIdFromUserId } from '@/lib/arc-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface ApplyPayload {
  applied_by_official_x?: boolean;
  notes?: string;
}

type ApplyResponse =
  | { ok: true; requestId: string; status: 'pending' | 'existing' }
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

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApplyResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Authentication
    if (!DEV_MODE) {
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

      const userId = session.user_id;

      // Check if user can apply for ARC access
      const canApply = await canApplyForArcAccess(supabase, userId, projectId);
      if (!canApply) {
        return res.status(403).json({
          ok: false,
          error: 'Only project owners/admins/moderators or official X accounts can apply for ARC access',
        });
      }

      // Check if there's already a pending request
      const { data: existingRequest } = await supabase
        .from('arc_project_access')
        .select('id, application_status')
        .eq('project_id', projectId)
        .eq('application_status', 'pending')
        .maybeSingle();

      if (existingRequest) {
        return res.status(200).json({
          ok: true,
          requestId: existingRequest.id,
          status: 'existing',
        });
      }

      // Get profile ID
      const profileId = await getProfileIdFromUserId(supabase, userId);
      if (!profileId) {
        return res.status(400).json({
          ok: false,
          error: 'User profile not found. Please ensure your X account is linked.',
        });
      }

      // Parse body
      const body = req.body as ApplyPayload;
      const applied_by_official_x = body.applied_by_official_x || false;

      // Insert new request
      const { data: newRequest, error: insertError } = await supabase
        .from('arc_project_access')
        .insert({
          project_id: projectId,
          applied_by_profile_id: profileId,
          applied_by_official_x: applied_by_official_x,
          application_status: 'pending',
          notes: body.notes || null,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[ARC Apply API] Insert error:', insertError);
        
        // Handle unique constraint violation (pending request exists)
        if (insertError.code === '23505') {
          const { data: existing } = await supabase
            .from('arc_project_access')
            .select('id')
            .eq('project_id', projectId)
            .eq('application_status', 'pending')
            .single();
          
          if (existing) {
            return res.status(200).json({
              ok: true,
              requestId: existing.id,
              status: 'existing',
            });
          }
        }
        
        return res.status(500).json({ ok: false, error: 'Failed to create request' });
      }

      return res.status(200).json({
        ok: true,
        requestId: newRequest.id,
        status: 'pending',
      });
    } else {
      // DEV MODE - return mock response
      return res.status(200).json({
        ok: true,
        requestId: 'dev-request-id',
        status: 'pending',
      });
    }
  } catch (error: any) {
    console.error('[ARC Apply API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}





