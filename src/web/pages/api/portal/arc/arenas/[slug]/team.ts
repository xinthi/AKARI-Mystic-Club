/**
 * API Route: GET /api/portal/arc/arenas/[slug]/team
 * 
 * Returns project team members with affiliate titles for display on arena pages
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface TeamMember {
  id: string;
  profile_id: string;
  role: 'owner' | 'admin' | 'moderator' | 'investor_view';
  affiliate_title: string | null;
  profile: {
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
}

type TeamResponse =
  | { ok: true; members: TeamMember[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TeamResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();
    const { slug } = req.query;

    if (!slug || typeof slug !== 'string') {
      return res.status(400).json({ ok: false, error: 'Arena slug is required' });
    }

    // Find arena by slug
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select('project_id')
      .ilike('slug', slug.trim().toLowerCase())
      .single();

    if (arenaError || !arenaData) {
      return res.status(404).json({ ok: false, error: 'Arena not found' });
    }

    // Check ARC access
    const accessCheck = await requireArcAccess(supabase, arenaData.project_id, 2);
    if (!accessCheck.ok) {
      return res.status(403).json({ ok: false, error: accessCheck.error });
    }

    // Get team members with affiliate titles
    const { data: teamMembers, error: teamError } = await supabase
      .from('project_team_members')
      .select(`
        id,
        profile_id,
        role,
        affiliate_title,
        profiles:profile_id (
          username,
          name,
          profile_image_url
        )
      `)
      .eq('project_id', arenaData.project_id)
      .order('affiliate_title', { ascending: true, nullsFirst: false });

    if (teamError) {
      console.error('[ARC Arena Team API] Error:', teamError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch team members' });
    }

    const members: TeamMember[] = (teamMembers || []).map((member: any) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      return {
        id: member.id,
        profile_id: member.profile_id,
        role: member.role,
        affiliate_title: member.affiliate_title,
        profile: {
          username: profile?.username || '',
          name: profile?.name || null,
          profile_image_url: profile?.profile_image_url || null,
        },
      };
    });

    return res.status(200).json({ ok: true, members });
  } catch (error: any) {
    console.error('[ARC Arena Team API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

