/**
 * API Route: GET /api/portal/crm/preferred-creators/lists
 * 
 * Get all lists (list names) for a project with creator counts
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface ListInfo {
  listName: string;
  creatorCount: number;
}

type ListsResponse =
  | {
      ok: true;
      lists: ListInfo[];
      totalCreators: number;
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ListsResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const user = await requirePortalUser(req, res);
    if (!user) {
      return; // requirePortalUser already sent 401 response
    }
    const profileId = user.profileId;
    if (!profileId) {
      return res.status(403).json({ ok: false, error: 'Profile not found' });
    }
    const supabase = getSupabaseAdmin();

    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Verify user has permission
    const { data: teamMember, error: teamError } = await supabase
      .from('project_team_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('profile_id', profileId)
      .in('role', ['admin', 'moderator', 'owner'])
      .single();

    if (teamError || !teamMember) {
      return res.status(403).json({
        ok: false,
        error: 'Not authorized to view lists for this project',
      });
    }

    // Get all preferred creators for this project
    const { data: preferredCreators, error: preferredError } = await supabase
      .from('project_preferred_creators')
      .select('list_name')
      .eq('project_id', projectId);

    if (preferredError) {
      console.error('[Lists API] Error fetching preferred creators:', preferredError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch lists' });
    }

    // Count creators by list name
    const listCounts: { [listName: string]: number } = {};
    let totalCreators = 0;

    (preferredCreators || []).forEach((pc) => {
      const listName = pc.list_name || 'default';
      listCounts[listName] = (listCounts[listName] || 0) + 1;
      totalCreators++;
    });

    // Convert to array
    const lists: ListInfo[] = Object.entries(listCounts).map(([listName, count]) => ({
      listName,
      creatorCount: count,
    }));

    // Sort by list name (default first, then alphabetically)
    lists.sort((a, b) => {
      if (a.listName === 'default') return -1;
      if (b.listName === 'default') return 1;
      return a.listName.localeCompare(b.listName);
    });

    return res.status(200).json({
      ok: true,
      lists,
      totalCreators,
    });
  } catch (error: any) {
    console.error('[Lists API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
