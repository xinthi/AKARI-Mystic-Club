/**
 * API Route: POST /api/portal/arc/campaigns
 * GET /api/portal/arc/campaigns
 * 
 * Create or list ARC CRM campaigns.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { verifyArcOptionAccess, getProfileIdFromUserId, checkArcProjectApproval } from '@/lib/arc-permissions';
import { canManageProject } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface CreateCampaignPayload {
  project_id: string;
  type?: 'crm' | 'normal' | 'gamified';
  participation_mode: 'invite_only' | 'public' | 'hybrid';
  leaderboard_visibility: 'public' | 'private';
  name: string;
  brief_objective?: string;
  start_at: string;
  end_at: string;
  website_url?: string;
  docs_url?: string;
  reward_pool_text?: string;
  winners_count?: number;
}

interface Campaign {
  id: string;
  project_id: string;
  type: string;
  participation_mode: string;
  leaderboard_visibility: string;
  name: string;
  brief_objective: string | null;
  start_at: string;
  end_at: string;
  website_url: string | null;
  docs_url: string | null;
  reward_pool_text: string | null;
  winners_count: number;
  status: string;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

type CampaignsResponse =
  | { ok: true; campaign?: Campaign; campaigns?: Campaign[] }
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
  res: NextApiResponse<CampaignsResponse>
) {
  try {
    const supabase = getSupabaseAdmin();

    // Handle GET - list campaigns
    if (req.method === 'GET') {
      const projectId = req.query.projectId as string | undefined;

      // If filtering by project, check ARC approval for that project
      if (projectId) {
        const approval = await checkArcProjectApproval(supabase, projectId);
        if (!approval.isApproved) {
          return res.status(403).json({
            ok: false,
            error: approval.isPending
              ? 'ARC access is pending approval'
              : approval.isRejected
              ? 'ARC access was rejected'
              : 'ARC access has not been approved for this project',
          });
        }
      }

      let query = supabase
        .from('arc_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data: campaigns, error: fetchError } = await query;

      if (fetchError) {
        console.error('[ARC Campaigns API] Fetch error:', fetchError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch campaigns' });
      }

      return res.status(200).json({
        ok: true,
        campaigns: (campaigns || []) as Campaign[],
      });
    }

    // Handle POST - create campaign
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
      const body = req.body as CreateCampaignPayload;

      // Validate required fields
      if (!body.project_id || !body.name || !body.start_at || !body.end_at) {
        return res.status(400).json({
          ok: false,
          error: 'Missing required fields: project_id, name, start_at, end_at',
        });
      }

      // Validate dates
      const startAt = new Date(body.start_at);
      const endAt = new Date(body.end_at);
      if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
        return res.status(400).json({ ok: false, error: 'Invalid date format' });
      }
      if (endAt <= startAt) {
        return res.status(400).json({ ok: false, error: 'end_at must be after start_at' });
      }

      // Verify ARC option access (for CRM, check option1_crm)
      if (!DEV_MODE) {
        const accessCheck = await verifyArcOptionAccess(supabase, body.project_id, 'option1_crm');
        if (!accessCheck.allowed) {
          return res.status(403).json({
            ok: false,
            error: accessCheck.reason || 'ARC Option 1 (CRM) is not available for this project',
          });
        }

        // Check project management permissions
        const canManage = await canManageProject(supabase, userId, body.project_id);
        if (!canManage) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have permission to create campaigns for this project',
          });
        }
      }

      // Get profile ID
      const profileId = await getProfileIdFromUserId(supabase, userId);
      if (!profileId && !DEV_MODE) {
        return res.status(400).json({
          ok: false,
          error: 'User profile not found',
        });
      }

      // Create campaign
      const campaignData = {
        project_id: body.project_id,
        type: body.type || 'crm',
        participation_mode: body.participation_mode,
        leaderboard_visibility: body.leaderboard_visibility,
        name: body.name,
        brief_objective: body.brief_objective || null,
        start_at: body.start_at,
        end_at: body.end_at,
        website_url: body.website_url || null,
        docs_url: body.docs_url || null,
        reward_pool_text: body.reward_pool_text || null,
        winners_count: body.winners_count || 100,
        status: 'draft',
        created_by_profile_id: profileId || null,
      };

      const { data: campaign, error: insertError } = await supabase
        .from('arc_campaigns')
        .insert(campaignData)
        .select()
        .single();

      if (insertError) {
        console.error('[ARC Campaigns API] Insert error:', insertError);
        return res.status(500).json({ ok: false, error: 'Failed to create campaign' });
      }

      return res.status(200).json({
        ok: true,
        campaign: campaign as Campaign,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[ARC Campaigns API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



