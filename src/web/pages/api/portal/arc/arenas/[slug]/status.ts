/**
 * API Route: GET /api/portal/arc/arenas/[slug]/status
 * 
 * Returns user's participation status and UTM links for CRM arenas
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';

interface ArenaStatus {
  isCRM: boolean;
  visibility: 'public' | 'private' | 'hybrid' | null;
  isInvited: boolean;
  isApproved: boolean;
  utmLink: string | null;
  canViewLeaderboard: boolean;
  canApply: boolean;
}

type StatusResponse =
  | { ok: true; status: ArenaStatus }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusResponse>
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

    // Find arena
    const { data: arenaData, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id')
      .ilike('slug', slug.trim().toLowerCase())
      .single();

    if (arenaError || !arenaData) {
      return res.status(404).json({ ok: false, error: 'Arena not found' });
    }

    // Get project
    const { data: projectData } = await supabase
      .from('projects')
      .select('id, arc_access_level')
      .eq('id', arenaData.project_id)
      .single();

    const isCRM = projectData?.arc_access_level === 'creator_manager';
    
    if (!isCRM) {
      return res.status(200).json({
        ok: true,
        status: {
          isCRM: false,
          visibility: null,
          isInvited: false,
          isApproved: false,
          utmLink: null,
          canViewLeaderboard: true,
          canApply: false,
        },
      });
    }

    // Get user's profile_id
    const { data: identity } = await supabase
      .from('akari_user_identities')
      .select('profile_id')
      .eq('user_id', portalUser.userId)
      .single();

    const profileId = identity?.profile_id || null;

    // Find associated campaign
    const { data: campaign } = await supabase
      .from('arc_campaigns')
      .select('id, leaderboard_visibility, participation_mode')
      .eq('project_id', arenaData.project_id)
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let visibility: 'public' | 'private' | 'hybrid' | null = null;
    let isInvited = false;
    let isApproved = false;
    let utmLink: string | null = null;
    let canApply = false;

    if (campaign) {
      visibility = campaign.leaderboard_visibility === 'public' ? 'public' : 'private';
      
      if (profileId) {
        // Check participant status
        const { data: participant } = await supabase
          .from('arc_campaign_participants')
          .select(`
            id,
            status,
            arc_participant_links (code, target_url)
          `)
          .eq('campaign_id', campaign.id)
          .eq('profile_id', profileId)
          .maybeSingle();

        if (participant) {
          isInvited = true;
          isApproved = participant.status === 'accepted' || participant.status === 'tracked';
          
          // Get UTM link
          if (participant.arc_participant_links) {
            const links = Array.isArray(participant.arc_participant_links) 
              ? participant.arc_participant_links 
              : [participant.arc_participant_links];
            if (links.length > 0 && links[0].code) {
              utmLink = `/r/${links[0].code}`;
            }
          }
        } else {
          // Check if can apply
          canApply = campaign.participation_mode === 'public' || campaign.participation_mode === 'hybrid';
        }
      } else {
        canApply = campaign.participation_mode === 'public' || campaign.participation_mode === 'hybrid';
      }
    } else {
      // Try creator_manager_programs
      const { data: program } = await supabase
        .from('creator_manager_programs')
        .select('id, visibility')
        .eq('project_id', arenaData.project_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (program) {
        visibility = program.visibility as 'public' | 'private' | 'hybrid';
        
        if (profileId) {
          const { data: creator } = await supabase
            .from('creator_manager_creators')
            .select(`
              id,
              status,
              creator_manager_links (id, utm_url)
            `)
            .eq('program_id', program.id)
            .eq('creator_profile_id', profileId)
            .maybeSingle();

          if (creator) {
            isInvited = true;
            isApproved = creator.status === 'approved';
            
            // Get UTM link
            if (creator.creator_manager_links) {
              const links = Array.isArray(creator.creator_manager_links)
                ? creator.creator_manager_links
                : [creator.creator_manager_links];
              if (links.length > 0 && links[0].utm_url) {
                utmLink = links[0].utm_url;
              }
            }
          } else {
            canApply = program.visibility === 'public' || program.visibility === 'hybrid';
          }
        } else {
          canApply = program.visibility === 'public' || program.visibility === 'hybrid';
        }
      }
    }

    const canViewLeaderboard = visibility === 'public' || (visibility === 'private' && isInvited && isApproved);

    return res.status(200).json({
      ok: true,
      status: {
        isCRM: true,
        visibility,
        isInvited,
        isApproved,
        utmLink,
        canViewLeaderboard,
        canApply,
      },
    });
  } catch (error: any) {
    console.error('[Arena Status API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

