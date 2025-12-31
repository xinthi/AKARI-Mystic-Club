/**
 * API Route: /api/portal/admin/arc/test-live-items
 * 
 * Comprehensive debug endpoint for ARC Live Leaderboards
 * Returns detailed information about each arena/project and why it's included/excluded
 * SuperAdmin only
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';

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
  const supabase = getSupabaseAdmin();
  const { data: session } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (!session || new Date(session.expires_at) < new Date()) {
    return null;
  }

  return session.user_id;
}

type DetailedArenaInfo = {
  arena: {
    id: string;
    name: string;
    slug: string;
    project_id: string;
    starts_at: string | null;
    ends_at: string | null;
    status: string;
    created_at: string;
  };
  project: {
    id: string;
    name: string;
    slug: string | null;
    twitter_username: string | null;
    x_handle: string | null;
  } | null;
  leaderboardRequests: Array<{
    id: string;
    status: string;
    approved_at: string | null;
    requested_by: string;
    arc_access_level: string | null;
    created_at: string;
  }>;
  accessCheck: {
    ok: boolean;
    approved: boolean | undefined;
    optionUnlocked: boolean | undefined;
    error: string | undefined;
    code: string | undefined;
  };
  classification: {
    status: 'live' | 'upcoming' | 'ended' | 'invalid';
    reason: string;
    now: string;
    startDate: string | null;
    endDate: string | null;
    startInFuture: boolean;
    endInPast: boolean;
  };
  includedInResponse: {
    inLive: boolean;
    inUpcoming: boolean;
    reason: string;
  };
};

type TestResponse =
  | {
      ok: true;
      summary: {
        totalArenas: number;
        totalLive: number;
        totalUpcoming: number;
        totalExcluded: number;
      };
      detailedArenas: DetailedArenaInfo[];
      duplicates: Array<{
        projectName: string;
        projectId: string;
        arenaIds: string[];
        arenaNames: string[];
      }>;
      processedLive: any[];
      processedUpcoming: any[];
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TestResponse>
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

    const supabase = getSupabaseAdmin();
    const now = new Date();

    // Get all arenas
    const { data: arenas, error: arenasError } = await supabase
      .from('arenas')
      .select(`
        id,
        name,
        slug,
        project_id,
        starts_at,
        ends_at,
        status,
        created_at,
        projects:project_id (
          id,
          name,
          slug,
          twitter_username,
          x_handle
        )
      `)
      .in('status', ['active', 'scheduled', 'paused'])
      .order('created_at', { ascending: false });

    if (arenasError) {
      return res.status(500).json({ ok: false, error: `Error fetching arenas: ${arenasError.message}` });
    }

    // Get processed items from the actual function
    const { getArcLiveItems } = await import('@/lib/arc/live-upcoming');
    const { live, upcoming } = await getArcLiveItems(supabase, 100);

    // Build detailed info for each arena
    const { requireArcAccess } = await import('@/lib/arc-access');
    const detailedArenas: DetailedArenaInfo[] = [];

    for (const arena of (arenas || [])) {
      const project = (arena.projects as any) || null;
      const projectId = arena.project_id;

      // Get leaderboard requests for this project
      const { data: requests } = await supabase
        .from('arc_leaderboard_requests')
        .select('id, status, approved_at, requested_by, arc_access_level, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      // Run access check
      const accessCheck = await requireArcAccess(supabase, projectId, 2);

      // Classify status
      let classification: DetailedArenaInfo['classification'];
      const startDate = arena.starts_at ? new Date(arena.starts_at) : null;
      const endDate = arena.ends_at ? new Date(arena.ends_at) : null;
      const startInFuture = startDate ? startDate > now : false;
      const endInPast = endDate ? endDate < now : false;

      if (!arena.starts_at) {
        // No start date = always live (unless ended)
        if (endInPast) {
          classification = {
            status: 'ended',
            reason: 'No start date but end date is in the past',
            now: now.toISOString(),
            startDate: null,
            endDate: arena.ends_at,
            startInFuture: false,
            endInPast: true,
          };
        } else {
          classification = {
            status: 'live',
            reason: 'No start date (always live)',
            now: now.toISOString(),
            startDate: null,
            endDate: arena.ends_at,
            startInFuture: false,
            endInPast: false,
          };
        }
      } else if (startInFuture) {
        classification = {
          status: 'upcoming',
          reason: 'Start date is in the future',
          now: now.toISOString(),
          startDate: arena.starts_at,
          endDate: arena.ends_at,
          startInFuture: true,
          endInPast: false,
        };
      } else if (endInPast) {
        classification = {
          status: 'ended',
          reason: 'End date is in the past',
          now: now.toISOString(),
          startDate: arena.starts_at,
          endDate: arena.ends_at,
          startInFuture: false,
          endInPast: true,
        };
      } else {
        classification = {
          status: 'live',
          reason: 'Within date range (started and not ended)',
          now: now.toISOString(),
          startDate: arena.starts_at,
          endDate: arena.ends_at,
          startInFuture: false,
          endInPast: false,
        };
      }

      // Check if included in response
      const inLive = live.some(item => item.id === arena.id || item.arenaId === arena.id);
      const inUpcoming = upcoming.some(item => item.id === arena.id || item.arenaId === arena.id);
      
      let inclusionReason = '';
      if (!accessCheck.ok) {
        inclusionReason = `Access check failed: ${accessCheck.error} (code: ${accessCheck.code})`;
      } else if (classification.status === 'ended') {
        inclusionReason = 'Excluded: Arena has ended';
      } else if (classification.status === 'invalid') {
        inclusionReason = 'Excluded: Invalid date configuration';
      } else if (inLive) {
        inclusionReason = 'Included in LIVE';
      } else if (inUpcoming) {
        inclusionReason = 'Included in UPCOMING';
      } else {
        inclusionReason = 'Excluded: Unknown reason (check server logs)';
      }

      detailedArenas.push({
        arena: {
          id: arena.id,
          name: arena.name,
          slug: arena.slug,
          project_id: projectId,
          starts_at: arena.starts_at,
          ends_at: arena.ends_at,
          status: arena.status,
          created_at: arena.created_at,
        },
        project: project ? {
          id: project.id,
          name: project.name,
          slug: project.slug,
          twitter_username: project.twitter_username,
          x_handle: project.x_handle,
        } : null,
        leaderboardRequests: (requests || []).map(r => ({
          id: r.id,
          status: r.status,
          approved_at: r.approved_at,
          requested_by: r.requested_by,
          arc_access_level: r.arc_access_level,
          created_at: r.created_at,
        })),
        accessCheck: {
          ok: accessCheck.ok,
          approved: accessCheck.ok ? accessCheck.approved : undefined,
          optionUnlocked: accessCheck.ok ? accessCheck.optionUnlocked : undefined,
          error: accessCheck.ok ? undefined : accessCheck.error,
          code: accessCheck.ok ? undefined : accessCheck.code,
        },
        classification,
        includedInResponse: {
          inLive,
          inUpcoming,
          reason: inclusionReason,
        },
      });
    }

    // Find duplicates (same project_id with multiple arenas)
    const projectArenaMap = new Map<string, string[]>();
    for (const arena of (arenas || [])) {
      if (!projectArenaMap.has(arena.project_id)) {
        projectArenaMap.set(arena.project_id, []);
      }
      projectArenaMap.get(arena.project_id)!.push(arena.id);
    }

    const duplicates: Array<{
      projectName: string;
      projectId: string;
      arenaIds: string[];
      arenaNames: string[];
    }> = [];
    for (const [projectId, arenaIds] of projectArenaMap.entries()) {
      if (arenaIds.length > 1) {
        const project = (arenas || []).find(a => a.project_id === projectId)?.projects as any;
        duplicates.push({
          projectName: project?.name || 'Unknown',
          projectId,
          arenaIds,
          arenaNames: arenaIds.map(id => {
            const arena = (arenas || []).find(a => a.id === id);
            return arena?.name || 'Unknown';
          }),
        });
      }
    }

    const totalExcluded = detailedArenas.filter(a => !a.includedInResponse.inLive && !a.includedInResponse.inUpcoming).length;

    return res.status(200).json({
      ok: true,
      summary: {
        totalArenas: (arenas || []).length,
        totalLive: live.length,
        totalUpcoming: upcoming.length,
        totalExcluded,
      },
      detailedArenas,
      duplicates,
      processedLive: live.map(item => ({
        id: item.id,
        projectId: item.projectId,
        projectName: item.projectName,
        projectSlug: item.projectSlug,
        title: item.title,
        slug: item.slug,
        kind: item.kind,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
      })),
      processedUpcoming: upcoming.map(item => ({
        id: item.id,
        projectId: item.projectId,
        projectName: item.projectName,
        title: item.title,
        kind: item.kind,
        startsAt: item.startsAt,
      })),
    });
  } catch (error: any) {
    console.error('[Test Live Items API] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to test live items',
    });
  }
}
