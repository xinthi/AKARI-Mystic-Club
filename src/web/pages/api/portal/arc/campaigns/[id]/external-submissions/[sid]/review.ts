/**
 * API Route: POST /api/portal/arc/campaigns/[id]/external-submissions/[sid]/review
 * 
 * Review (approve/reject) an external submission (admin/moderator only).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';
import { canManageProject } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface ReviewPayload {
  action: 'approve' | 'reject';
  notes?: string;
}

interface ExternalSubmission {
  id: string;
  campaign_id: string;
  participant_id: string;
  platform: string;
  url: string;
  status: string;
  reviewed_by_profile_id: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type ReviewResponse =
  | { ok: true; submission: ExternalSubmission }
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

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReviewResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id: campaignId, sid: submissionId } = req.query;

    if (!campaignId || typeof campaignId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }
    if (!submissionId || typeof submissionId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Submission ID is required' });
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
    } else {
      userId = 'dev-user-id';
    }

    // Get submission and campaign
    const { data: submission, error: submissionError } = await supabase
      .from('arc_external_submissions')
      .select('campaign_id')
      .eq('id', submissionId)
      .single();

    if (submissionError || !submission) {
      return res.status(404).json({ ok: false, error: 'Submission not found' });
    }

    if (submission.campaign_id !== campaignId) {
      return res.status(400).json({ ok: false, error: 'Submission does not belong to this campaign' });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('arc_campaigns')
      .select('project_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Check permissions
    if (!DEV_MODE) {
      const canManage = await canManageProject(supabase, userId, campaign.project_id);
      if (!canManage) {
        return res.status(403).json({
          ok: false,
          error: 'You do not have permission to review submissions',
        });
      }
    }

    // Parse body
    const body = req.body as ReviewPayload;
    if (!body.action || !['approve', 'reject'].includes(body.action)) {
      return res.status(400).json({ ok: false, error: 'Invalid action. Must be "approve" or "reject"' });
    }

    // Get reviewer profile ID
    const reviewerProfileId = await getProfileIdFromUserId(supabase, userId);
    if (!reviewerProfileId && !DEV_MODE) {
      return res.status(400).json({
        ok: false,
        error: 'Reviewer profile not found',
      });
    }

    // Update submission
    const updateData: any = {
      status: body.action === 'approve' ? 'approved' : 'rejected',
      reviewed_by_profile_id: reviewerProfileId || null,
      reviewed_at: new Date().toISOString(),
    };

    if (body.notes) {
      updateData.notes = body.notes;
    }

    const { data: updatedSubmission, error: updateError } = await supabase
      .from('arc_external_submissions')
      .update(updateData)
      .eq('id', submissionId)
      .select()
      .single();

    if (updateError) {
      console.error('[ARC Review API] Update error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update submission' });
    }

    return res.status(200).json({
      ok: true,
      submission: updatedSubmission as ExternalSubmission,
    });
  } catch (error: any) {
    console.error('[ARC Review API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



