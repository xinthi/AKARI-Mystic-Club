/**
 * API Route: GET /api/portal/crm/preferred-creators
 * 
 * List preferred creators for a project
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface PreferredCreator {
  id: string;
  project_id: string;
  creator_profile_id: string;
  list_name: string | null;
  notes: string | null;
  added_by_profile_id: string | null;
  created_at: string;
  // Populated info
  creator?: {
    id: string;
    username: string;
    name: string;
    profile_image_url: string | null;
  };
}

type PreferredCreatorsResponse =
  | {
      ok: true;
      creators: PreferredCreator[];
      totalCount: number;
      lists: { [listName: string]: number };
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PreferredCreatorsResponse>
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
    const supabase = createPortalClient();

    const { projectId, listName } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Verify user has permission
    const { data: teamMember, error: teamError } = await supabase
      .from('project_team_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('profile_id', profileId)
      .in('role', ['admin', 'moderator'])
      .single();

    if (teamError || !teamMember) {
      return res.status(403).json({
        ok: false,
        error: 'Not authorized to view preferred creators for this project',
      });
    }

    // Get preferred creators
    let query = supabase
      .from('project_preferred_creators')
      .select('*')
      .eq('project_id', projectId);

    if (listName && typeof listName === 'string') {
      query = query.eq('list_name', listName);
    }

    const { data: preferredCreators, error: preferredError } = await query.order(
      'created_at',
      { ascending: false }
    );

    if (preferredError) {
      console.error('[Preferred Creators API] Error fetching preferred creators:', preferredError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch preferred creators' });
    }

    // Get creator profile info
    const creatorIds = new Set(
      (preferredCreators || []).map((pc) => pc.creator_profile_id)
    );
    const { data: creators } = await supabase
      .from('profiles')
      .select('id, username, name, profile_image_url')
      .in('id', Array.from(creatorIds));

    const creatorsMap = new Map((creators || []).map((c) => [c.id, c]));

    const enrichedCreators: PreferredCreator[] = (preferredCreators || []).map((pc) => ({
      ...pc,
      creator: creatorsMap.get(pc.creator_profile_id),
    }));

    // Count by list name
    const lists: { [listName: string]: number } = {};
    enrichedCreators.forEach((pc) => {
      const list = pc.list_name || 'default';
      lists[list] = (lists[list] || 0) + 1;
    });

    return res.status(200).json({
      ok: true,
      creators: enrichedCreators,
      totalCount: enrichedCreators.length,
      lists,
    });
  } catch (error: any) {
    console.error('[Preferred Creators API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
