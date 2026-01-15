/**
 * API Route: GET /api/portal/creator-circles
 * 
 * List creator circles (connections) for the current user
 * - Shows accepted connections
 * - Shows pending requests (both sent and received)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createPortalClient } from '@/lib/portal/supabase';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface CreatorCircle {
  id: string;
  creator_profile_id: string;
  circle_member_profile_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'removed';
  initiated_by_profile_id: string;
  accepted_at: string | null;
  created_at: string;
  // Populated profile info
  member_profile?: {
    id: string;
    username: string;
    name: string;
    profile_image_url: string | null;
  };
  creator_profile?: {
    id: string;
    username: string;
    name: string;
    profile_image_url: string | null;
  };
}

type CreatorCirclesResponse =
  | {
      ok: true;
      circles: CreatorCircle[];
      acceptedCount: number;
      pendingSentCount: number;
      pendingReceivedCount: number;
    }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CreatorCirclesResponse>
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
      return res.status(200).json({
        ok: true,
        circles: [],
        acceptedCount: 0,
        pendingSentCount: 0,
        pendingReceivedCount: 0,
      });
    }
    const supabase = createPortalClient();

    // Get all circles where current user is involved (as creator or member)
    const { data: circles, error: circlesError } = await supabase
      .from('creator_circles')
      .select('*')
      .or(`creator_profile_id.eq.${profileId},circle_member_profile_id.eq.${profileId}`)
      .order('created_at', { ascending: false });

    if (circlesError) {
      console.error('[Creator Circles API] Error fetching circles:', circlesError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch circles' });
    }

    // Get unique profile IDs to fetch profile info
    const profileIds = new Set<string>();
    (circles || []).forEach((circle) => {
      profileIds.add(circle.creator_profile_id);
      profileIds.add(circle.circle_member_profile_id);
    });

    // Fetch profile info
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, name, profile_image_url')
      .in('id', Array.from(profileIds));

    if (profilesError) {
      console.error('[Creator Circles API] Error fetching profiles:', profilesError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch profiles' });
    }

    const profilesMap = new Map(
      (profiles || []).map((p) => [p.id, p])
    );

    // Enrich circles with profile info
    const enrichedCircles: CreatorCircle[] = (circles || []).map((circle) => ({
      ...circle,
      member_profile: profilesMap.get(circle.circle_member_profile_id),
      creator_profile: profilesMap.get(circle.creator_profile_id),
    }));

    // Calculate counts
    const acceptedCount = enrichedCircles.filter((c) => c.status === 'accepted').length;
    const pendingSentCount = enrichedCircles.filter(
      (c) => c.status === 'pending' && c.initiated_by_profile_id === profileId
    ).length;
    const pendingReceivedCount = enrichedCircles.filter(
      (c) => c.status === 'pending' && c.initiated_by_profile_id !== profileId
    ).length;

    return res.status(200).json({
      ok: true,
      circles: enrichedCircles,
      acceptedCount,
      pendingSentCount,
      pendingReceivedCount,
    });
  } catch (error: any) {
    console.error('[Creator Circles API] Unhandled error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}
