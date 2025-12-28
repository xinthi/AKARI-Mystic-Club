/**
 * API Route: GET /api/portal/admin/arc/item-report
 * 
 * Get analytics report for a single live item (arena, campaign, or gamified program).
 * Super admin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

type ItemReportResponse =
  | {
      ok: true;
      kind: 'arena' | 'campaign' | 'gamified';
      id: string;
      title: string;
      projectName: string;
      projectSlug: string | null;
      stats: {
        participants: number;
        posts: number;
        views: number;
        likes: number;
        reposts: number;
        replies: number;
        quotes: number;
        engagementRate: number;
      };
    }
  | { ok: false; error: string };

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: session, error } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (error || !session) {
      return null;
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('akari_user_sessions').delete().eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ItemReportResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    // Check authentication
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const userId = await getUserIdFromSession(sessionToken);
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }

    // Check super admin
    const isSuperAdmin = await isSuperAdminServerSide(userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    const { kind, id } = req.query as { kind?: string; id?: string };

    if (!kind || !['arena', 'campaign', 'gamified'].includes(kind)) {
      return res.status(400).json({ ok: false, error: 'kind must be "arena", "campaign", or "gamified"' });
    }

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'id is required' });
    }

    const supabase = getSupabaseAdmin();

    if (kind === 'arena') {
      // Get arena report
      const { data: arena, error: arenaError } = await supabase
        .from('arenas')
        .select('id, name, project_id, projects:project_id(name, slug)')
        .eq('id', id)
        .single();

      if (arenaError || !arena) {
        return res.status(404).json({ ok: false, error: 'Arena not found' });
      }

      // Get creators in this arena
      const { data: creators } = await supabase
        .from('arena_creators')
        .select('profile_id, twitter_username')
        .eq('arena_id', id);

      const participants = creators?.length || 0;

      // For now, set other metrics to 0 (N/A equivalent)
      // These can be extended later with actual aggregation from user_ct_activity
      const stats = {
        participants,
        posts: 0,
        views: 0,
        likes: 0,
        reposts: 0,
        replies: 0,
        quotes: 0,
        engagementRate: 0,
      };

      return res.status(200).json({
        ok: true,
        kind: 'arena',
        id,
        title: arena.name || 'Arena',
        projectName: (arena.projects as any)?.name || 'Unknown Project',
        projectSlug: (arena.projects as any)?.slug || null,
        stats,
      });
    } else if (kind === 'campaign') {
      // Get campaign report
      const { data: campaign, error: campaignError } = await supabase
        .from('arc_campaigns')
        .select('id, name, project_id, projects:project_id(name, slug)')
        .eq('id', id)
        .single();

      if (campaignError || !campaign) {
        return res.status(404).json({ ok: false, error: 'Campaign not found' });
      }

      // Get participants in this campaign
      const { data: participants } = await supabase
        .from('arc_campaign_participants')
        .select('profile_id')
        .eq('campaign_id', id)
        .eq('status', 'approved');

      const participantCount = participants?.length || 0;

      // For now, set other metrics to 0 (N/A equivalent)
      const stats = {
        participants: participantCount,
        posts: 0,
        views: 0,
        likes: 0,
        reposts: 0,
        replies: 0,
        quotes: 0,
        engagementRate: 0,
      };

      return res.status(200).json({
        ok: true,
        kind: 'campaign',
        id,
        title: campaign.name || 'Campaign',
        projectName: (campaign.projects as any)?.name || 'Unknown Project',
        projectSlug: (campaign.projects as any)?.slug || null,
        stats,
      });
    } else if (kind === 'gamified') {
      // Get gamified program report (creator_manager_programs)
      const { data: program, error: programError } = await supabase
        .from('creator_manager_programs')
        .select('id, title, project_id, projects:project_id(name, slug)')
        .eq('id', id)
        .single();

      if (programError || !program) {
        return res.status(404).json({ ok: false, error: 'Program not found' });
      }

      // Get creators in this program
      const { data: creators } = await supabase
        .from('creator_manager_creators')
        .select('creator_profile_id')
        .eq('program_id', id)
        .eq('status', 'approved');

      const participantCount = creators?.length || 0;

      // For now, set other metrics to 0 (N/A equivalent)
      const stats = {
        participants: participantCount,
        posts: 0,
        views: 0,
        likes: 0,
        reposts: 0,
        replies: 0,
        quotes: 0,
        engagementRate: 0,
      };

      return res.status(200).json({
        ok: true,
        kind: 'gamified',
        id,
        title: program.title || 'Program',
        projectName: (program.projects as any)?.name || 'Unknown Project',
        projectSlug: (program.projects as any)?.slug || null,
        stats,
      });
    }

    return res.status(400).json({ ok: false, error: 'Invalid kind' });
  } catch (error: any) {
    console.error('[ARC Item Report API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

