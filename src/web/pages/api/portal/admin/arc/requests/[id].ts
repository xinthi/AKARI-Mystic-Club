/**
 * API Route: PATCH /api/portal/admin/arc/requests/[id]
 * 
 * Approve or reject an ARC access request and unlock features (super admin only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface DecidePayload {
  action: 'approve' | 'reject';
  unlock_options?: ('option1_crm' | 'option2_normal' | 'option3_gamified')[];
  notes?: string;
}

type DecideResponse =
  | { ok: true; request: any }
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
  res: NextApiResponse<DecideResponse>
) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Request ID is required' });
    }

    // Authentication
    let userId: string;
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

      userId = session.user_id;

      // Check super admin
      const isSuperAdmin = await checkSuperAdmin(supabase, userId);
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    } else {
      userId = 'dev-user-id';
    }

    // Parse body
    const body = req.body as DecidePayload;
    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      return res.status(400).json({ ok: false, error: 'Invalid action. Must be "approve" or "reject"' });
    }

    // Get the request
    const { data: request, error: fetchError } = await supabase
      .from('arc_project_access')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }

    // Get approver profile ID
    const approverProfileId = await getProfileIdFromUserId(supabase, userId);
    if (!approverProfileId) {
      return res.status(400).json({
        ok: false,
        error: 'Approver profile not found',
      });
    }

    // Update request status
    const updateData: any = {
      application_status: body.action === 'approve' ? 'approved' : 'rejected',
      approved_by_profile_id: approverProfileId,
      approved_at: new Date().toISOString(),
    };

    if (body.notes) {
      updateData.notes = body.notes;
    }

    const { data: updatedRequest, error: updateError } = await supabase
      .from('arc_project_access')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[ARC Decide API] Update error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update request' });
    }

    // If approved, unlock features
    if (body.action === 'approve' && body.unlock_options && body.unlock_options.length > 0) {
      const unlockData: any = {};
      
      if (body.unlock_options.includes('option1_crm')) {
        unlockData.option1_crm_unlocked = true;
      }
      if (body.unlock_options.includes('option2_normal')) {
        unlockData.option2_normal_unlocked = true;
      }
      if (body.unlock_options.includes('option3_gamified')) {
        unlockData.option3_gamified_unlocked = true;
      }

      unlockData.unlocked_at = new Date().toISOString();

      // Upsert feature unlock status
      const { error: featuresError } = await supabase
        .from('arc_project_features')
        .upsert({
          project_id: request.project_id,
          ...unlockData,
        }, {
          onConflict: 'project_id',
        });

      if (featuresError) {
        console.error('[ARC Decide API] Features unlock error:', featuresError);
        // Don't fail the request - just log the error
      }
    }

    return res.status(200).json({
      ok: true,
      request: updatedRequest,
    });
  } catch (error: any) {
    console.error('[ARC Decide API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}









