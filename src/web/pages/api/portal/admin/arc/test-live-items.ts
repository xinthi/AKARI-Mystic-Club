/**
 * API Route: /api/portal/admin/arc/test-live-items
 * 
 * Test endpoint to see raw data for debugging live items
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

type TestResponse =
  | {
      ok: true;
      rawArenas: any[];
      rawAccessChecks: Array<{
        projectId: string;
        projectName: string;
        accessCheck: any;
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
        projects:project_id (
          id,
          name,
          slug,
          x_handle
        )
      `)
      .in('status', ['active', 'scheduled', 'paused'])
      .order('created_at', { ascending: false });

    if (arenasError) {
      return res.status(500).json({ ok: false, error: `Error fetching arenas: ${arenasError.message}` });
    }

    // Get access checks for each arena
    const { requireArcAccess } = await import('@/lib/arc-access');
    const accessChecks = [];
    
    for (const arena of (arenas || [])) {
      const projectName = (arena.projects as any)?.name || 'Unknown';
      const accessCheck = await requireArcAccess(supabase, arena.project_id, 2);
      accessChecks.push({
        projectId: arena.project_id,
        projectName,
        arenaId: arena.id,
        arenaName: arena.name,
        accessCheck: {
          ok: accessCheck.ok,
          approved: accessCheck.ok ? accessCheck.approved : undefined,
          optionUnlocked: accessCheck.ok ? accessCheck.optionUnlocked : undefined,
          error: accessCheck.ok ? undefined : accessCheck.error,
          code: accessCheck.ok ? undefined : accessCheck.code,
        },
      });
    }

    // Get processed items
    const { getArcLiveItems } = await import('@/lib/arc/live-upcoming');
    const { live, upcoming } = await getArcLiveItems(supabase, 20);

    return res.status(200).json({
      ok: true,
      rawArenas: (arenas || []).map(a => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        projectId: a.project_id,
        projectName: (a.projects as any)?.name || 'NO PROJECT',
        projectSlug: (a.projects as any)?.slug || null,
        status: a.status,
        startsAt: a.starts_at,
        endsAt: a.ends_at,
      })),
      rawAccessChecks: accessChecks,
      processedLive: live.map(item => ({
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
