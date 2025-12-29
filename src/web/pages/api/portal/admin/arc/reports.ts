/**
 * API Route: GET /api/portal/admin/arc/reports
 * 
 * Get analytics report for a live item (arena, campaign, or gamified program).
 * Super admin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

type ReportResponse =
  | {
      ok: true;
      kind: 'arena' | 'campaign' | 'gamified';
      id: string;
      title: string;
      projectName: string;
      projectSlug: string | null;
      stats: {
        totalCreators: number;
        totalPosts: number;
        totalViews: number;
        totalLikes: number;
        totalReplies: number;
        totalReposts: number;
        totalQuotes: number;
      };
      topCreators: Array<{
        username: string;
        displayName: string | null;
        arcPoints: number;
        posts: number;
        views: number;
        likes: number;
        replies: number;
        reposts: number;
        quotes: number;
      }>;
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
  res: NextApiResponse<ReportResponse>
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
        .select('profile_id, twitter_username, arc_points, profiles:profile_id(username, display_name)')
        .eq('arena_id', id);

      const totalCreators = creators?.length || 0;

      // For now, set other metrics to N/A (0) as we need to aggregate from user_ct_activity
      // This is a placeholder that can be extended later with actual aggregation
      const stats = {
        totalCreators,
        totalPosts: 0,
        totalViews: 0,
        totalLikes: 0,
        totalReplies: 0,
        totalReposts: 0,
        totalQuotes: 0,
      };

      const topCreators = (creators || []).map((c: any) => ({
        username: c.twitter_username || c.profiles?.username || 'unknown',
        displayName: c.profiles?.display_name || null,
        arcPoints: Number(c.arc_points) || 0,
        posts: 0,
        views: 0,
        likes: 0,
        replies: 0,
        reposts: 0,
        quotes: 0,
      })).sort((a, b) => b.arcPoints - a.arcPoints).slice(0, 10);

      return res.status(200).json({
        ok: true,
        kind: 'arena',
        id,
        title: arena.name || 'Arena',
        projectName: (arena.projects as any)?.name || 'Unknown Project',
        projectSlug: (arena.projects as any)?.slug || null,
        stats,
        topCreators,
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
        .select('profile_id, profiles:profile_id(username, display_name)')
        .eq('campaign_id', id)
        .eq('status', 'approved');

      const totalCreators = participants?.length || 0;

      // For now, set other metrics to N/A (0) as we need to aggregate from user_ct_activity
      const stats = {
        totalCreators,
        totalPosts: 0,
        totalViews: 0,
        totalLikes: 0,
        totalReplies: 0,
        totalReposts: 0,
        totalQuotes: 0,
      };

      const topCreators = (participants || []).map((p: any) => ({
        username: p.profiles?.username || 'unknown',
        displayName: p.profiles?.display_name || null,
        arcPoints: 0,
        posts: 0,
        views: 0,
        likes: 0,
        replies: 0,
        reposts: 0,
        quotes: 0,
      })).slice(0, 10);

      return res.status(200).json({
        ok: true,
        kind: 'campaign',
        id,
        title: campaign.name || 'Campaign',
        projectName: (campaign.projects as any)?.name || 'Unknown Project',
        projectSlug: (campaign.projects as any)?.slug || null,
        stats,
        topCreators,
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
        .select('creator_profile_id, arc_points, profiles:creator_profile_id(username, display_name)')
        .eq('program_id', id)
        .eq('status', 'approved');

      const totalCreators = creators?.length || 0;

      // For now, set other metrics to N/A (0)
      const stats = {
        totalCreators,
        totalPosts: 0,
        totalViews: 0,
        totalLikes: 0,
        totalReplies: 0,
        totalReposts: 0,
        totalQuotes: 0,
      };

      const topCreators = (creators || []).map((c: any) => ({
        username: c.profiles?.username || 'unknown',
        displayName: c.profiles?.display_name || null,
        arcPoints: Number(c.arc_points) || 0,
        posts: 0,
        views: 0,
        likes: 0,
        replies: 0,
        reposts: 0,
        quotes: 0,
      })).sort((a, b) => b.arcPoints - a.arcPoints).slice(0, 10);

      return res.status(200).json({
        ok: true,
        kind: 'gamified',
        id,
        title: program.title || 'Program',
        projectName: (program.projects as any)?.name || 'Unknown Project',
        projectSlug: (program.projects as any)?.slug || null,
        stats,
        topCreators,
      });
    }

    return res.status(400).json({ ok: false, error: 'Invalid kind' });
  } catch (error: any) {
    console.error('[ARC Reports API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

