/**
 * API Route: POST /api/portal/arc/campaigns/[id]/external-submissions
 * GET /api/portal/arc/campaigns/[id]/external-submissions
 * 
 * Submit or list external proof submissions (YouTube, TikTok, Telegram, Other).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface SubmitPayload {
  platform: 'youtube' | 'tiktok' | 'telegram' | 'other';
  url: string;
  participant_id?: string;
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
  participant?: {
    id: string;
    twitter_username: string;
  };
}

type SubmissionsResponse =
  | { ok: true; submission?: ExternalSubmission; submissions?: ExternalSubmission[] }
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
  res: NextApiResponse<SubmissionsResponse>
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id: campaignId } = req.query;

    if (!campaignId || typeof campaignId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }

    // Handle GET - list submissions
    if (req.method === 'GET') {
      // Check if user has permission to view (admin/moderator or participant)
      let canView = false;
      if (!DEV_MODE) {
        const sessionToken = getSessionToken(req);
        if (sessionToken) {
          const { data: session } = await supabase
            .from('akari_user_sessions')
            .select('user_id, expires_at')
            .eq('session_token', sessionToken)
            .single();

          if (session && new Date(session.expires_at) >= new Date()) {
            const userId = session.user_id;

            // Get campaign project_id
            const { data: campaign } = await supabase
              .from('arc_campaigns')
              .select('project_id')
              .eq('id', campaignId)
              .single();

            if (campaign) {
              // Runtime guard: ensure projectId is a non-empty string
              const projectId = campaign.project_id;
              if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
                return res.status(400).json({ ok: false, error: 'Missing projectId' });
              }

              // TypeScript narrowing: assign to const with explicit string type
              const pid: string = projectId;

              // Check ARC access (Option 1 = CRM)
              const accessCheck = await requireArcAccess(supabase, pid, 1);
              if (!accessCheck.ok) {
                return res.status(403).json({
                  ok: false,
                  error: accessCheck.error || 'ARC access not approved for this project',
                });
              }

              // Check if admin/moderator
              const permissions = await checkProjectPermissions(supabase, userId, pid);
              const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
              if (canManage) {
                canView = true;
              } else {
                // Check if participant
                const profileId = await getProfileIdFromUserId(supabase, userId);
                if (profileId) {
                  const { data: participant } = await supabase
                    .from('arc_campaign_participants')
                    .select('id')
                    .eq('campaign_id', campaignId)
                    .eq('profile_id', profileId)
                    .maybeSingle();
                  
                  if (participant) {
                    canView = true;
                  }
                }
              }
            }
          }
        }
      } else {
        canView = true; // DEV MODE
      }

      if (!canView) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }

      const { data: submissions, error: fetchError } = await supabase
        .from('arc_external_submissions')
        .select(`
          *,
          participant:arc_campaign_participants!arc_external_submissions_participant_id_fkey (
            id,
            twitter_username
          )
        `)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('[ARC Submissions API] Fetch error:', fetchError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch submissions' });
      }

      return res.status(200).json({
        ok: true,
        submissions: (submissions || []) as ExternalSubmission[],
      });
    }

    // Handle POST - submit
    if (req.method === 'POST') {
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

      // Parse body
      const body = req.body as SubmitPayload;
      if (!body.platform || !body.url) {
        return res.status(400).json({ ok: false, error: 'platform and url are required' });
      }

      if (!['youtube', 'tiktok', 'telegram', 'other'].includes(body.platform)) {
        return res.status(400).json({ ok: false, error: 'Invalid platform' });
      }

      // Validate URL
      try {
        new URL(body.url);
      } catch {
        return res.status(400).json({ ok: false, error: 'Invalid URL format' });
      }

      // Get campaign to check ARC approval
      const { data: campaign } = await supabase
        .from('arc_campaigns')
        .select('project_id')
        .eq('id', campaignId)
        .single();

      if (!campaign) {
        return res.status(404).json({ ok: false, error: 'Campaign not found' });
      }

      // Runtime guard: ensure projectId is a non-empty string
      const projectId = campaign.project_id;
      if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
        return res.status(400).json({ ok: false, error: 'Missing projectId' });
      }

      // TypeScript narrowing: assign to const with explicit string type
      const pid: string = projectId;

      // Check ARC access (Option 1 = CRM)
      if (!DEV_MODE) {
        const accessCheck = await requireArcAccess(supabase, pid, 1);
        if (!accessCheck.ok) {
          return res.status(403).json({
            ok: false,
            error: accessCheck.error || 'ARC access not approved for this project',
          });
        }
      }

      // Get participant ID (from body or find from user profile)
      let participantId: string;
      if (body.participant_id) {
        participantId = body.participant_id;
      } else {
        // Find participant from user profile
        const profileId = await getProfileIdFromUserId(supabase, userId);
        if (!profileId) {
          return res.status(400).json({
            ok: false,
            error: 'User profile not found. Please ensure your X account is linked.',
          });
        }

        const { data: participant } = await supabase
          .from('arc_campaign_participants')
          .select('id')
          .eq('campaign_id', campaignId)
          .eq('profile_id', profileId)
          .single();

        if (!participant) {
          return res.status(404).json({
            ok: false,
            error: 'You are not a participant in this campaign',
          });
        }

        participantId = participant.id;
      }

      // Create submission
      const { data: submission, error: insertError } = await supabase
        .from('arc_external_submissions')
        .insert({
          campaign_id: campaignId,
          participant_id: participantId,
          platform: body.platform,
          url: body.url,
          status: 'submitted',
        })
        .select()
        .single();

      if (insertError) {
        console.error('[ARC Submissions API] Insert error:', insertError);
        return res.status(500).json({ ok: false, error: 'Failed to create submission' });
      }

      return res.status(200).json({
        ok: true,
        submission: submission as ExternalSubmission,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[ARC Submissions API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



